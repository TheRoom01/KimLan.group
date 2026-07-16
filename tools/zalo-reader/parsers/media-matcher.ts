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

function dominantSender(messages: SemanticIndexedDbMessage[]) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    const sender = String(message.fromUid || "").trim();
    if (!sender) continue;
    counts.set(sender, (counts.get(sender) || 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function sortRooms(rooms: RoomAnchor[]) {
  return [...rooms].sort((a, b) => {
    if (a.messageIndex !== b.messageIndex) {
      return a.messageIndex - b.messageIndex;
    }

    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }

    return a.id.localeCompare(b.id);
  });
}

function sortBundles(bundles: MediaBundle[]) {
  return [...bundles].sort((a, b) => {
    if (a.firstMessageIndex !== b.firstMessageIndex) {
      return a.firstMessageIndex - b.firstMessageIndex;
    }

    if (a.firstTimestamp !== b.firstTimestamp) {
      return a.firstTimestamp - b.firstTimestamp;
    }

    return a.id.localeCompare(b.id);
  });
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

  const imageMessages = messages
    .map(normalizeImageMessage)
    .filter((message) => Boolean(Array.isArray(message.imageUrls) && message.imageUrls.length > 0));

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
        indexesByMessageId.get(String(message.msgId || message.cliMsgId || ""))
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
      firstTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      lastTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : 0,
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

  const rooms = sortRooms(params.rooms);
  const bundles = sortBundles(params.bundles);

  const firstRoom = rooms[0];
  const firstBundle = bundles[0];

  if (!firstRoom || !firstBundle) return "after";

  return firstBundle.firstMessageIndex < firstRoom.messageIndex
    ? "before"
    : "after";
}

function countRoomAnchorsBetween(params: {
  rooms: RoomAnchor[];
  bundle: MediaBundle;
}) {
  const low = Math.min(
    params.bundle.firstMessageIndex,
    params.bundle.lastMessageIndex
  );
  const high = Math.max(
    params.bundle.firstMessageIndex,
    params.bundle.lastMessageIndex
  );

  return params.rooms.filter(
    (candidate) =>
      candidate.messageIndex > low &&
      candidate.messageIndex < high
  ).length;
}

function chooseTargetRoom(params: {
  rooms: RoomAnchor[];
  bundle: MediaBundle;
  bias: "before" | "after";
}) {
  const rooms = sortRooms(params.rooms);
  const { bundle, bias } = params;

  if (rooms.length === 0) return null;

  /*
   * Pattern "media trước marker":
   * gán media cho marker kế tiếp.
   */
  if (bias === "before") {
    return (
      rooms.find((room) => room.messageIndex >= bundle.firstMessageIndex) ||
      rooms[rooms.length - 1] ||
      null
    );
  }

  /*
   * Pattern "media sau marker":
   * gán media cho marker hiện tại.
   */
  return (
    [...rooms].reverse().find((room) => room.messageIndex <= bundle.lastMessageIndex) ||
    rooms[0] ||
    null
  );
}

/*
 * Không dùng global nearest-room scoring nữa.
 * Luồng mới:
 * - rooms được giữ theo thứ tự timeline
 * - media trước marker → gán cho marker kế tiếp
 * - media sau marker → gán cho marker hiện tại
 * - nếu media cắt qua nhiều marker thì vẫn gán theo slot tuyến tính,
 *   chỉ thêm warning để debug.
 */
export function assignMediaToRooms(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options?: SemanticParserOptions;
}): MediaAssignmentResult {
  const options = params.options || {};
  const rooms = sortRooms(params.rooms || []);
  const bundles = sortBundles(params.bundles || []);

  const inferredBias = inferBias({
    rooms,
    bundles,
    configuredBias: options.mediaBias || "auto",
  });

  const assignedByRoomId = new Map<string, MediaBundle[]>();
  const warningsByRoomId = new Map<string, Set<string>>();
  const unassignedBundles: MediaBundle[] = [];

  const maxMediaGapMs = Math.max(
    60_000,
    Number(options.maxMediaGapMs || 30 * 60 * 1000)
  );

  for (const room of rooms) {
    assignedByRoomId.set(room.id, []);
    warningsByRoomId.set(room.id, new Set<string>());
  }

  if (rooms.length === 0) {
    unassignedBundles.push(...bundles);
    return {
      inferredBias,
      assignedByRoomId,
      warningsByRoomId,
      unassignedBundles,
    };
  }

  for (const bundle of bundles) {
    const targetRoom = chooseTargetRoom({
      rooms,
      bundle,
      bias: inferredBias,
    });

    if (!targetRoom) {
      unassignedBundles.push(bundle);
      continue;
    }

    assignedByRoomId.get(targetRoom.id)?.push(bundle);

    const crossedRooms = countRoomAnchorsBetween({
      rooms,
      bundle,
    });

    if (crossedRooms > 0) {
      warningsByRoomId.get(targetRoom.id)?.add(
        `MEDIA_CROSSES_ROOM_BOUNDARY:${bundle.id}:${crossedRooms}`
      );
    }

    const roomTime = targetRoom.timestamp;
    const mediaTime =
      inferredBias === "before" ? bundle.firstTimestamp : bundle.lastTimestamp;

    if (roomTime > 0 && mediaTime > 0) {
      const timeDistance = Math.abs(mediaTime - roomTime);

      if (timeDistance > maxMediaGapMs) {
        warningsByRoomId.get(targetRoom.id)?.add(
          `MEDIA_ASSIGNMENT_LOW_CONFIDENCE:${bundle.id}:${Math.round(
            timeDistance / 60_000
          )}m`
        );
      } else if (timeDistance > 10 * 60_000) {
        warningsByRoomId.get(targetRoom.id)?.add(
          `MEDIA_ASSIGNMENT_NEAR_BOUNDARY:${bundle.id}`
        );
      }
    }
  }

  return {
    inferredBias,
    assignedByRoomId,
    warningsByRoomId,
    unassignedBundles,
  };
}