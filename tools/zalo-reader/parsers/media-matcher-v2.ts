import type {
  MediaBundle,
  SemanticAlbumPreview,
  SemanticIndexedDbMessage,
  SemanticVideoPayload,
} from "./types";

import { isVideoMessage, messageTimestamp } from "./utils";

function stableUrlSet(urls: string[]) {
  return Array.from(
    new Set(
      urls
        .map((url) => String(url || "").trim())
        .filter(Boolean),
    ),
  );
}

function getFallbackImageUrls(message: SemanticIndexedDbMessage) {
  const raw = message as any;

  const candidates = [
    ...(Array.isArray(raw.imageUrls) ? raw.imageUrls : []),
    raw.hdUrl,
    raw.originalUrl,
    raw.originUrl,
    raw.normalUrl,
    raw.imageUrl,
    raw.photoUrl,
    raw.thumbUrl,
    raw.thumbnailUrl,
    raw.content?.hdUrl,
    raw.content?.originalUrl,
    raw.content?.originUrl,
    raw.content?.url,
    raw.content?.href,
    raw.params?.hdUrl,
    raw.params?.url,
    ...(Array.isArray(raw.domHydration?.imageUrls)
      ? raw.domHydration.imageUrls
      : []),
  ];

  return stableUrlSet(
    candidates.filter((url) => {
      const value = String(url || "").trim();
      if (!value) return false;
      if (!/^(?:https?:|blob:|file:)/i.test(value)) {
        return false;
      }

      const lower = value.toLowerCase();
      return !(
        lower.includes("avatar") ||
        lower.includes("sticker") ||
        lower.includes("emoji") ||
        lower.includes("reaction") ||
        lower.includes("icon") ||
        lower.includes("logo")
      );
    }) as string[],
  );
}

function normalizeImageMessage(message: SemanticIndexedDbMessage) {
  const imageUrls = getFallbackImageUrls(message);
  if (imageUrls.length === 0) return message;

  return {
    ...message,
    kind: "image" as const,
    imageUrls,
  };
}

function dominantSender(messages: SemanticIndexedDbMessage[]) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    const sender = String(message.fromUid || "").trim();
    if (!sender) continue;
    counts.set(sender, (counts.get(sender) || 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
  );
}

function flattenAlbumUrls(messages: SemanticIndexedDbMessage[]) {
  return stableUrlSet(
    messages.flatMap((message) =>
      Array.isArray(message.imageUrls) ? message.imageUrls : [],
    ),
  );
}

function getVideoPayload(
  message: SemanticIndexedDbMessage,
): SemanticVideoPayload | null {
  const sourceUrl = String(
    message.videoUrls?.find((url) => String(url || "").trim()) || "",
  ).trim();

  if (!sourceUrl) return null;

  const thumbnailUrl = String(
    message.videoThumbUrls?.find((url) => String(url || "").trim()) || "",
  ).trim();

  const durationMs = Number(message.videoDebug?.durationMs || 0);
  const width = Number(message.videoDebug?.width || 0);
  const height = Number(message.videoDebug?.height || 0);
  const sizeBytes = Number(
    message.videoDebug?.fileSize || message.videoDebug?.sizeBytes || 0,
  );

  return {
    sourceUrl,
    thumbnailUrl: thumbnailUrl || undefined,
    durationMs:
      Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined,
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
    sizeBytes:
      Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : undefined,
  };
}

type ImageRun = {
  layoutKey: string;
  runKey: string;
  messages: SemanticIndexedDbMessage[];
  messageIndexes: number[];
  firstIndex: number;
  lastIndex: number;
};

function buildImageRuns(messages: SemanticIndexedDbMessage[]) {
  const runs: ImageRun[] = [];
  let current: ImageRun | null = null;
  let lastImageIndex = -1;
  let lastLayoutKey = "";

  const closeCurrent = () => {
    if (current && current.messages.length > 0) {
      runs.push(current);
    }
    current = null;
  };

  messages.forEach((rawMessage, index) => {
    const message = normalizeImageMessage(rawMessage);
    const imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];
    const isImage = imageUrls.length > 0;

    /* PHASE_2_FINAL_TEXT_BREAKS_ALBUM */
    /*
     * Bất kỳ message chữ/non-image nào xen giữa đều đóng album.
     * Ảnh sau text luôn bắt đầu một album/run mới, kể cả khi
     * Zalo tái sử dụng cùng groupLayoutId.
     */
    if (!isImage) {
      closeCurrent();
      lastImageIndex = -1;
      lastLayoutKey = "";
      return;
    }

    const layoutKey =
      message.groupLayoutId != null
        ? `album:${String(message.groupLayoutId)}`
        : `single:${String(message.msgId || message.cliMsgId || index)}`;

    const contiguousSameRun =
      current != null &&
      lastImageIndex === index - 1 &&
      lastLayoutKey === layoutKey;

    if (!contiguousSameRun) {
      closeCurrent();
      current = {
        layoutKey,
        runKey: `${layoutKey}:${index}`,
        messages: [],
        messageIndexes: [],
        firstIndex: index,
        lastIndex: index,
      };
    }

    current!.messages.push(message);
    current!.messageIndexes.push(index);
    current!.lastIndex = index;

    lastImageIndex = index;
    lastLayoutKey = layoutKey;
  });

  closeCurrent();
  return runs;
}

export function buildMediaBundles(messages: SemanticIndexedDbMessage[]) {
  const indexesByMessageId = new Map<string, number>();

  messages.forEach((message, index) => {
    const keys = [message.msgId, message.cliMsgId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const key of keys) {
      indexesByMessageId.set(key, index);
    }
  });

  const imageRuns = buildImageRuns(messages);
  const bundles: MediaBundle[] = [];

  for (const run of imageRuns) {
    const sorted = [...run.messages].sort((a, b) => {
      const ai = Number(a.imageIndex);
      const bi = Number(b.imageIndex);

      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) {
        return ai - bi;
      }

      return messageTimestamp(a) - messageTimestamp(b);
    });

    const expected = sorted
      .map((message) => Number(message.totalImages))
      .filter((value) => Number.isFinite(value) && value > 0);

    const expectedImageCount =
      expected.length > 0 ? Math.max(...expected) : null;

    const imageMessageIds = sorted
      .map((message) => String(message.msgId || "").trim())
      .filter(Boolean);

    const imageUrls = flattenAlbumUrls(sorted);
    /* Một message ảnh = một ảnh; URL fallback không làm tăng count. */
    const actualImageCount = sorted.length;

    const album: SemanticAlbumPreview = {
      albumKey: run.runKey,
      groupLayoutId: sorted[0]?.groupLayoutId ?? null,
      expectedImageCount,
      actualImageCount,
      complete:
        expectedImageCount == null || actualImageCount >= expectedImageCount,
      imageMessageIds,
      imageUrls,
    };

    const messageIndexes = sorted
      .map((message) =>
        indexesByMessageId.get(String(message.msgId || message.cliMsgId || "")),
      )
      .filter((value): value is number => Number.isFinite(value));

    if (messageIndexes.length === 0) continue;

    const timestamps = sorted
      .map(messageTimestamp)
      .filter((value) => value > 0);

    bundles.push({
      id: album.albumKey,
      kind: "album",
      messageIds: album.imageMessageIds,
      messageIndexes,
      firstMessageIndex: Math.min(...messageIndexes),
      lastMessageIndex: Math.max(...messageIndexes),
      firstTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      lastTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      senderUid: dominantSender(sorted),
      album,
    });
  }

  messages.forEach((message, index) => {
    if (!isVideoMessage(message)) return;

    const payload = getVideoPayload(message);
    const sourceUrls = stableUrlSet(message.videoUrls || []);
    const thumbUrls = stableUrlSet(message.videoThumbUrls || []);

    bundles.push({
      id: `video:${String(message.msgId || message.cliMsgId || index)}`,
      kind: "video",
      messageIds: [String(message.msgId || "").trim()].filter(Boolean),
      messageIndexes: [index],
      firstMessageIndex: index,
      lastMessageIndex: index,
      firstTimestamp: messageTimestamp(message),
      lastTimestamp: messageTimestamp(message),
      senderUid: String(message.fromUid || "").trim(),
      videos: payload ? [payload] : [],
      videoUrls: sourceUrls,
      videoThumbUrls: thumbUrls,
    });
  });

  return bundles.sort((a, b) => {
    if (a.firstMessageIndex !== b.firstMessageIndex) {
      return a.firstMessageIndex - b.firstMessageIndex;
    }

    return a.firstTimestamp - b.firstTimestamp;
  });
}