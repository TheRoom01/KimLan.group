import type {
  MediaBundle,
  RoomAnchor,
  SemanticIndexedDbMessage,
  SemanticMediaBias,
  SemanticParserOptions,
} from "./types";

import {
  buildAlbums,
  getVideoPayload,
  isVideoMessage,
  messageTimestamp,
  pickImageUrl,
} from "./utils";

export type MediaAssignmentResult = {
  inferredBias: Exclude<SemanticMediaBias, "auto">;
  assignedByRoomId: Map<string, MediaBundle[]>;
  warningsByRoomId: Map<string, Set<string>>;
  unassignedBundles: MediaBundle[];
};

/*
 * Một số phiên bản Zalo vẫn có URL ảnh nhưng không gắn kind = "image",
 * hoặc URL nằm ở field dự phòng/DOM hydration. Chuẩn hóa cục bộ tại tầng
 * media để không thay đổi logic ghép album và phòng hiện có.
 */
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

  return Array.from(
    new Set(
      candidates
        .map((value) => String(value || "").trim())
        .filter((url) => {
          if (!url) return false;
          if (!/^(?:https?:|blob:|file:)/i.test(url)) return false;

          const lower = url.toLowerCase();
          return !(
            lower.includes("avatar") ||
            lower.includes("sticker") ||
            lower.includes("emoji") ||
            lower.includes("reaction") ||
            lower.includes("icon") ||
            lower.includes("logo")
          );
        })
    )
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

function dominantSender(
  messages: SemanticIndexedDbMessage[]
) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    const sender = String(message.fromUid || "").trim();
    if (!sender) continue;
    counts.set(sender, (counts.get(sender) || 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0] || ""
  );
}

export function buildMediaBundles(
  messages: SemanticIndexedDbMessage[]
) {
  const indexesByMessageId = new Map<string, number>();

  messages.forEach((message, index) => {
    const keys = [message.msgId, message.cliMsgId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const key of keys) {
      indexesByMessageId.set(key, index);
    }
  });

  const imageMessages = messages
    .map(normalizeImageMessage)
    .filter((message) => Boolean(pickImageUrl(message)));

  const albums = buildAlbums(imageMessages);
  const bundles: MediaBundle[] = [];

  for (const album of albums) {
    const albumMessages = imageMessages.filter((message) => {
      const expectedKey =
        message.groupLayoutId != null
          ? `album:${String(message.groupLayoutId)}`
          : `single:${String(message.msgId || message.cliMsgId)}`;

      return expectedKey === album.albumKey;
    });

    const messageIndexes = albumMessages
      .map((message) =>
        indexesByMessageId.get(
          String(message.msgId || message.cliMsgId || "")
        )
      )
      .filter((value): value is number => Number.isFinite(value));

    if (messageIndexes.length === 0) continue;

    const timestamps = albumMessages
      .map(messageTimestamp)
      .filter((value) => value > 0);

    bundles.push({
      id: album.albumKey,
      kind: "album",
      messageIds: album.imageMessageIds,
      messageIndexes,
      firstMessageIndex: Math.min(...messageIndexes),
      lastMessageIndex: Math.max(...messageIndexes),
      firstTimestamp:
        timestamps.length > 0 ? Math.min(...timestamps) : 0,
      lastTimestamp:
        timestamps.length > 0 ? Math.max(...timestamps) : 0,
      senderUid: dominantSender(albumMessages),
      album,
    });
  }

  messages.forEach((message, index) => {
    if (!isVideoMessage(message)) return;

    const payload = getVideoPayload(message);
    const sourceUrls = Array.from(
      new Set(
        (message.videoUrls || [])
          .map((url) => String(url || "").trim())
          .filter(Boolean)
      )
    );

    const thumbUrls = Array.from(
      new Set(
        (message.videoThumbUrls || [])
          .map((url) => String(url || "").trim())
          .filter(Boolean)
      )
    );

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

function inferBias(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  configuredBias?: SemanticMediaBias;
}) {
  if (
    params.configuredBias === "before" ||
    params.configuredBias === "after"
  ) {
    return params.configuredBias;
  }

  const firstRoom = params.rooms[0];
  const firstBundle = params.bundles[0];

  if (!firstRoom || !firstBundle) return "after";

  return firstBundle.firstMessageIndex < firstRoom.messageIndex
    ? "before"
    : "after";
}

function countRoomAnchorsBetween(params: {
  rooms: RoomAnchor[];
  room: RoomAnchor;
  bundle: MediaBundle;
}) {
  const low = Math.min(
    params.room.messageIndex,
    params.bundle.firstMessageIndex
  );
  const high = Math.max(
    params.room.messageIndex,
    params.bundle.firstMessageIndex
  );

  return params.rooms.filter(
    (candidate) =>
      candidate.id !== params.room.id &&
      candidate.messageIndex > low &&
      candidate.messageIndex < high
  ).length;
}

function scoreBundleForRoom(params: {
  room: RoomAnchor;
  bundle: MediaBundle;
  rooms: RoomAnchor[];
  bias: "before" | "after";
  maxMediaGapMs: number;
}) {
  const { room, bundle, rooms, bias, maxMediaGapMs } = params;
  const bundleIndex =
    bias === "after"
      ? bundle.firstMessageIndex
      : bundle.lastMessageIndex;

  const indexDistance = Math.abs(bundleIndex - room.messageIndex);
  const directionMatches =
    bias === "after"
      ? bundle.firstMessageIndex >= room.messageIndex
      : bundle.lastMessageIndex <= room.messageIndex;

  let score = directionMatches ? 100 : 20;
  score -= Math.min(70, indexDistance * 7);

  const crossedRooms = countRoomAnchorsBetween({
    rooms,
    room,
    bundle,
  });

  score -= crossedRooms * 90;

  if (
    room.senderUid &&
    bundle.senderUid &&
    room.senderUid === bundle.senderUid
  ) {
    score += 12;
  }

  const roomTime = room.timestamp;
  const mediaTime =
    bias === "after" ? bundle.firstTimestamp : bundle.lastTimestamp;

  if (roomTime > 0 && mediaTime > 0) {
    const timeDistance = Math.abs(mediaTime - roomTime);
    score -= Math.min(35, timeDistance / 60_000);

    if (timeDistance > maxMediaGapMs) {
      score -= 80;
    }
  }

  return score;
}

export function assignMediaToRooms(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options?: SemanticParserOptions;
}): MediaAssignmentResult {
  const options = params.options || {};
  const maxMediaGapMs = Math.max(
    60_000,
    Number(options.maxMediaGapMs || 30 * 60 * 1000)
  );
  const uncertainScoreDelta = Math.max(
    0,
    Number(options.uncertainScoreDelta ?? 18)
  );

  const inferredBias = inferBias({
    rooms: params.rooms,
    bundles: params.bundles,
    configuredBias: options.mediaBias || "auto",
  });

  const assignedByRoomId = new Map<string, MediaBundle[]>();
  const warningsByRoomId = new Map<string, Set<string>>();
  const unassignedBundles: MediaBundle[] = [];

  for (const room of params.rooms) {
    assignedByRoomId.set(room.id, []);
    warningsByRoomId.set(room.id, new Set<string>());
  }

  for (const bundle of params.bundles) {
    const ranked = params.rooms
      .map((room) => ({
        room,
        score: scoreBundleForRoom({
          room,
          bundle,
          rooms: params.rooms,
          bias: inferredBias,
          maxMediaGapMs,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];

    if (!best) {
      unassignedBundles.push(bundle);
      continue;
    }

    assignedByRoomId.get(best.room.id)?.push(bundle);

    if (
      second &&
      best.score - second.score <= uncertainScoreDelta
    ) {
      warningsByRoomId
        .get(best.room.id)
        ?.add(
          `MEDIA_ASSIGNMENT_UNCERTAIN:${bundle.id}:${best.score.toFixed(
            1
          )}/${second.score.toFixed(1)}`
        );
    }

    if (best.score < 25) {
      warningsByRoomId
        .get(best.room.id)
        ?.add(`MEDIA_ASSIGNMENT_LOW_CONFIDENCE:${bundle.id}`);
    }
  }

  return {
    inferredBias,
    assignedByRoomId,
    warningsByRoomId,
    unassignedBundles,
  };
}
