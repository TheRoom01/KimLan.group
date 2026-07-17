import type {
  BuildingSegment,
  MediaBundle,
  RoomAnchor,
  SemanticIndexedDbMessage,
  SemanticParserOptions,
  SemanticRoomPreview,
  SemanticVideoPayload,
  SemanticAlbumPreview,
} from "./types";

import { splitIntoBuildingSegments } from "./building-segmenter";
import { classifyTextMessage } from "./message-classifier";
import { buildMediaBundles } from "./media-matcher-v2";
import { assignPhase2MediaToRooms } from "./phase2-media-assignment";
import {
  cleanText,
  isNoiseText,
  messageTimestamp,
  sha256,
  uniqueTexts,
} from "./utils";

export function normalizeForCompare(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[|;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function looksLikeSharedBuildingText(input: string) {
  const normalized = normalizeForCompare(input);
  if (!normalized) return false;

  const cues = [
    "dia chi",
    "chinh sach",
    "chi phi",
    "dien",
    "nuoc",
    "dich vu",
    "phi dich vu",
    "hoa hong",
    "coc",
    "thanh toan",
    "thang may",
    "thang bo",
    "camera",
    "an ninh",
    "gio giac",
    "noi that",
    "may lanh",
    "tu lanh",
    "may giat",
    "giu xe",
    "gui xe",
    "pet",
    "thu cung",
    "toi da",
    "so nguoi",
    "so xe",
    "ket thuc",
    "hop dong",
    "hđ",
    "hd",
    "gioi han",
    "tien nha",
    "tien coc",
    "don dep",
    "wifi",
    "bao tri",
    "tram",
    "tien ich",
  ];

  return cues.some((cue) => normalized.includes(cue));
}

function buildRoomAnchors(segment: BuildingSegment) {
  const rooms: RoomAnchor[] = [];

  segment.messages.forEach((message, messageIndex) => {
    if (message.kind !== "text") return;

    const classification = classifyTextMessage(message);
    classification.roomAnchors.forEach((anchor, anchorIndex) => {
      const roomCodes = String(anchor.roomCode || "")
        .split("+")
        .map((value) => value.trim())
        .filter(Boolean);

      const expandedCodes = roomCodes.length > 0 ? roomCodes : [""];

      expandedCodes.forEach((roomCode, codeIndex) => {
        rooms.push({
          id: [
            segment.id,
            String(message.msgId || message.cliMsgId || messageIndex),
            anchorIndex,
            codeIndex,
          ].join(":"),
          messageId: String(message.msgId || message.cliMsgId || "").trim(),
          messageIndex,
          timestamp: messageTimestamp(message),
          senderUid: String(message.fromUid || "").trim(),
          markerText: anchor.markerText,
          roomCode,
          descriptionTexts: [],
        });
      });
    });
  });

  return rooms.sort((a, b) => {
    if (a.messageIndex !== b.messageIndex) {
      return a.messageIndex - b.messageIndex;
    }

    return a.id.localeCompare(b.id);
  });
}

function makeSyntheticRoom(params: {
  segment: BuildingSegment;
  bundles: MediaBundle[];
}) {
  const { segment, bundles } = params;
  const firstMedia = bundles[0];
  const firstMessage = segment.messages[0];
  const lastMessage =
    segment.messages[segment.messages.length - 1] || firstMessage;

  const messageIndex =
    firstMedia?.firstMessageIndex ?? Math.max(0, segment.messages.length - 1);

  return {
    id: `${segment.id}:synthetic-room`,
    messageId: String(
      firstMedia?.messageIds[0] ||
        lastMessage?.msgId ||
        lastMessage?.cliMsgId ||
        "",
    ).trim(),
    messageIndex,
    timestamp:
      firstMedia?.firstTimestamp ||
      messageTimestamp(lastMessage) ||
      messageTimestamp(firstMessage),
    senderUid: firstMedia?.senderUid || dominantSender(segment.messages),
    markerText: "",
    roomCode: "",
    descriptionTexts: [],
  } satisfies RoomAnchor;
}

function pickRoomIndexForTimeline(params: {
  rooms: RoomAnchor[];
  messageIndex: number;
}) {
  const { rooms, messageIndex } = params;
  if (rooms.length === 0) return -1;

  let candidate = -1;
  for (let index = 0; index < rooms.length; index++) {
    if (rooms[index].messageIndex <= messageIndex) {
      candidate = index;
      continue;
    }
    break;
  }

  if (candidate >= 0) return candidate;
  return 0;
}

type ResolvedMediaBias = "before" | "after";

function findPreviousRoomIndexForBundle(params: {
  rooms: RoomAnchor[];
  bundle: MediaBundle;
}) {
  let candidate = -1;

  for (let index = 0; index < params.rooms.length; index++) {
    if (
      params.rooms[index].messageIndex <=
      params.bundle.firstMessageIndex
    ) {
      candidate = index;
      continue;
    }

    break;
  }

  return candidate;
}

function findNextRoomIndexForBundle(params: {
  rooms: RoomAnchor[];
  bundle: MediaBundle;
}) {
  return params.rooms.findIndex(
    (room) =>
      room.messageIndex >=
      params.bundle.lastMessageIndex,
  );
}

function resolveMediaBiasForTimeline(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options: SemanticParserOptions;
}): ResolvedMediaBias {
  if (params.options.mediaBias === "before") {
    return "before";
  }

  if (params.options.mediaBias === "after") {
    return "after";
  }

  let beforeScore = 0;
  let afterScore = 0;

  const sortedBundles = [...params.bundles].sort((a, b) => {
    if (a.firstMessageIndex !== b.firstMessageIndex) {
      return a.firstMessageIndex - b.firstMessageIndex;
    }

    return a.lastMessageIndex - b.lastMessageIndex;
  });

  for (const bundle of sortedBundles) {
    const previousRoomIndex =
      findPreviousRoomIndexForBundle({
        rooms: params.rooms,
        bundle,
      });

    const nextRoomIndex =
      findNextRoomIndexForBundle({
        rooms: params.rooms,
        bundle,
      });

    if (previousRoomIndex < 0 && nextRoomIndex >= 0) {
      /*
       * Album xuất hiện trước marker đầu tiên là bằng chứng mạnh
       * cho kiểu đăng: ảnh -> marker.
       */
      beforeScore += 4;
      continue;
    }

    if (nextRoomIndex < 0 && previousRoomIndex >= 0) {
      /*
       * Album xuất hiện sau marker cuối cùng là bằng chứng mạnh
       * cho kiểu đăng: marker -> ảnh.
       */
      afterScore += 4;
      continue;
    }

    if (previousRoomIndex < 0 || nextRoomIndex < 0) {
      continue;
    }

    const previousRoom = params.rooms[previousRoomIndex];
    const nextRoom = params.rooms[nextRoomIndex];

    const bundleSender = String(bundle.senderUid || "").trim();
    const previousSender = String(
      previousRoom.senderUid || "",
    ).trim();
    const nextSender = String(nextRoom.senderUid || "").trim();

    if (bundleSender) {
      if (
        nextSender === bundleSender &&
        previousSender !== bundleSender
      ) {
        beforeScore += 2;
      } else if (
        previousSender === bundleSender &&
        nextSender !== bundleSender
      ) {
        afterScore += 2;
      }
    }

    const previousGap = Math.max(
      0,
      bundle.firstMessageIndex - previousRoom.messageIndex,
    );

    const nextGap = Math.max(
      0,
      nextRoom.messageIndex - bundle.lastMessageIndex,
    );

    if (nextGap < previousGap) {
      beforeScore += 1;
    } else if (previousGap < nextGap) {
      afterScore += 1;
    }
  }

  if (beforeScore !== afterScore) {
    return beforeScore > afterScore
      ? "before"
      : "after";
  }

  const firstRoom = params.rooms[0];
  const firstBundle = sortedBundles[0];

  if (
    firstRoom &&
    firstBundle &&
    firstBundle.firstMessageIndex < firstRoom.messageIndex
  ) {
    return "before";
  }

  const lastRoom = params.rooms[params.rooms.length - 1];
  const lastBundle = sortedBundles[sortedBundles.length - 1];

  if (
    lastRoom &&
    lastBundle &&
    lastBundle.lastMessageIndex > lastRoom.messageIndex
  ) {
    return "after";
  }

  /*
   * Mặc định an toàn cho kiểu đăng phổ biến:
   * marker phòng trước, album theo sau.
   */
  return "after";
}

function assignMediaToRoomsByTimeline(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options: SemanticParserOptions;
}) {
  const assignedByRoomId = new Map<string, MediaBundle[]>();
  const warningsByRoomId = new Map<string, Set<string>>();
  const unassignedBundles: MediaBundle[] = [];

  for (const room of params.rooms) {
    assignedByRoomId.set(room.id, []);
    warningsByRoomId.set(room.id, new Set<string>());
  }

  const sortedBundles = [...params.bundles].sort((a, b) => {
    if (a.firstMessageIndex !== b.firstMessageIndex) {
      return a.firstMessageIndex - b.firstMessageIndex;
    }

    if (a.firstTimestamp !== b.firstTimestamp) {
      return a.firstTimestamp - b.firstTimestamp;
    }

    return a.id.localeCompare(b.id);
  });

  const resolvedBias = resolveMediaBiasForTimeline({
    rooms: params.rooms,
    bundles: sortedBundles,
    options: params.options,
  });

  for (const bundle of sortedBundles) {
    if (params.rooms.length === 0) {
      unassignedBundles.push(bundle);
      continue;
    }

    const previousRoomIndex =
      findPreviousRoomIndexForBundle({
        rooms: params.rooms,
        bundle,
      });

    const nextRoomIndex =
      findNextRoomIndexForBundle({
        rooms: params.rooms,
        bundle,
      });

    /*
     * before: album thuộc marker đứng ngay sau album.
     * after:  album thuộc marker đứng ngay trước album.
     *
     * Nếu không có marker ở phía ưu tiên, fallback sang phía còn lại.
     */
    const preferredRoomIndex =
      resolvedBias === "before"
        ? nextRoomIndex
        : previousRoomIndex;

    const fallbackRoomIndex =
      resolvedBias === "before"
        ? previousRoomIndex
        : nextRoomIndex;

    const roomIndex =
      preferredRoomIndex >= 0
        ? preferredRoomIndex
        : fallbackRoomIndex;

    const targetRoom = params.rooms[roomIndex];

    if (!targetRoom) {
      unassignedBundles.push(bundle);
      continue;
    }

    assignedByRoomId.get(targetRoom.id)?.push(bundle);
  }

  return {
    assignedByRoomId,
    warningsByRoomId,
    unassignedBundles,
    resolvedBias,
  };
}
function distributeTimelineText(params: {
  segment: BuildingSegment;
  rooms: RoomAnchor[];
}) {
  const houseInfoTexts = [...params.segment.buildingTexts];
  const roomTextsById = new Map<string, string[]>();

  for (const room of params.rooms) {
    roomTextsById.set(room.id, []);
  }

  const firstRoomIndex = params.rooms[0]?.messageIndex ?? Number.MAX_SAFE_INTEGER;

  params.segment.messages.forEach((message, messageIndex) => {
    if (message.kind !== "text") return;

    const classification = classifyTextMessage(message);
    if (classification.separator) return;

    const candidateTexts = uniqueTexts(classification.otherLines);

    for (const text of candidateTexts) {
      if (!text || isNoiseText(text)) continue;

      if (
        classification.buildingLines.length > 0 ||
        looksLikeSharedBuildingText(text) ||
        messageIndex < firstRoomIndex
      ) {
        houseInfoTexts.push(text);
        continue;
      }

      const roomIndex = pickRoomIndexForTimeline({
        rooms: params.rooms,
        messageIndex,
      });

      if (roomIndex < 0) {
        houseInfoTexts.push(text);
        continue;
      }

      const targetRoom = params.rooms[roomIndex];
      if (!targetRoom) {
        houseInfoTexts.push(text);
        continue;
      }

      roomTextsById.get(targetRoom.id)?.push(text);
    }
  });

  return {
    houseInfoText: uniqueTexts(houseInfoTexts).join("\n").trim(),
    roomTextsById,
  };
}

function flattenVideoPayloads(bundles: MediaBundle[]) {
  const payloads = new Map<string, SemanticVideoPayload>();

  for (const bundle of bundles) {
    for (const video of bundle.videos || []) {
      if (video.sourceUrl && !payloads.has(video.sourceUrl)) {
        payloads.set(video.sourceUrl, video);
      }
    }
  }

  return Array.from(payloads.values());
}

function buildFullText(params: {
  houseInfoText: string;
  markerText: string;
  descriptions: string[];
}) {
  return uniqueTexts([
    params.houseInfoText,
    params.markerText,
    ...params.descriptions,
  ])
    .join("\n\n")
    .trim();
}

function buildRoomsForSegment(params: {
  segment: BuildingSegment;
  groupName: string;
  groupId: string;
  options: SemanticParserOptions;
}) {
  const { segment, groupName, groupId, options } = params;
  const bundles = buildMediaBundles(segment.messages);
  let rooms = buildRoomAnchors(segment);
  const hadRealRoomMarker = rooms.length > 0;

  if (rooms.length === 0) {
    /* FINAL_MEDIA_REVIEW_ROOM */
    /* Chỉ text thì không tạo phòng giả; có media thì tạo review card. */
    if (bundles.length === 0) return [];

    rooms = bundles.map((bundle, bundleIndex) => {
      const synthetic = makeSyntheticRoom({ segment, bundles: [bundle] });
      return {
        ...synthetic,
        id: `${segment.id}:media-review:${bundleIndex}`,
        messageId: bundle.messageIds[0] || synthetic.messageId,
        messageIndex: bundle.firstMessageIndex,
        timestamp: bundle.firstTimestamp || synthetic.timestamp,
        senderUid: bundle.senderUid || synthetic.senderUid,
      };
    });
  }

  const assignment = assignPhase2MediaToRooms({
    rooms,
    bundles,
    options,
  });

  /* FINAL_SHARED_ALBUM_MULTI_ROOM */
  const realMarkerRooms = rooms.filter((room) => Boolean(cleanText(room.markerText)));
  const markerMessageIds = new Set(realMarkerRooms.map((room) => room.messageId).filter(Boolean));
  const markerMessageIndexes = new Set(realMarkerRooms.map((room) => room.messageIndex));
  const mayShareSingleAlbum =
    bundles.length === 1 &&
    realMarkerRooms.length > 1 &&
    (markerMessageIds.size === 1 || markerMessageIndexes.size === 1);

  if (mayShareSingleAlbum) {
    const sharedBundle = bundles[0];
    for (const room of realMarkerRooms) {
      assignment.assignedByRoomId.set(room.id, [sharedBundle]);
      assignment.warningsByRoomId.get(room.id)?.add("SHARED_ALBUM_MULTI_ROOM_MESSAGE");
    }
    assignment.unassignedBundles.splice(0, assignment.unassignedBundles.length);
  }

  if (!hadRealRoomMarker && rooms.length === bundles.length) {
    rooms.forEach((room, index) => {
      const bundle = bundles[index];
      if (!bundle) return;
      assignment.assignedByRoomId.set(room.id, [bundle]);
      assignment.warningsByRoomId.get(room.id)?.add("UNASSIGNED_MEDIA_REVIEW_REQUIRED");
    });
    assignment.unassignedBundles.splice(0, assignment.unassignedBundles.length);
  }

  const distributed = distributeTimelineText({
    segment,
    rooms,
  });

  const houseInfoText = distributed.houseInfoText;
  const result: SemanticRoomPreview[] = [];

  for (const room of rooms) {
    const assigned = assignment.assignedByRoomId.get(room.id) || [];
    const albums = assigned
      .map((bundle) => bundle.album)
      .filter((album): album is SemanticAlbumPreview => Boolean(album));

    const imageUrls = Array.from(
      new Set(albums.flatMap((album) => album.imageUrls)),
    );
    const imageMessageIds = Array.from(
      new Set(albums.flatMap((album) => album.imageMessageIds)),
    );

    const videoBundles = assigned.filter((bundle) => bundle.kind === "video");
    const videoMessageIds = Array.from(
      new Set(videoBundles.flatMap((bundle) => bundle.messageIds)),
    );
    const videoUrls = Array.from(
      new Set(videoBundles.flatMap((bundle) => bundle.videoUrls || [])),
    );
    const videoThumbUrls = Array.from(
      new Set(videoBundles.flatMap((bundle) => bundle.videoThumbUrls || [])),
    );
    const videos = flattenVideoPayloads(videoBundles);

    const warnings = new Set<string>(segment.warnings);

    for (const warning of
      assignment.warningsByRoomId.get(room.id) || []) {
      warnings.add(warning);
    }

    warnings.add(
      `SEMANTIC_MEDIA_ASSIGNMENT:${assignment.assignmentMode}`
    );

    if (bundles.length > 0 && hadRealRoomMarker) {
      warnings.add(`SEMANTIC_MEDIA_BIAS:${assignment.resolvedBias}`);
    }

    if (!hadRealRoomMarker) {
      warnings.add("NO_ROOM_MARKER");
      warnings.add("ROOM_MARKER_MISSING");
      warnings.add("ROOM_CODE_MISSING");
      warnings.add("UNASSIGNED_MEDIA_REVIEW_REQUIRED");
    }

    if (!houseInfoText) {
      warnings.add("NO_HOUSE_INFO");
      warnings.add("HOUSE_INFO_MISSING");
    }

    if (imageUrls.length === 0) {
      warnings.add("NO_IMAGES");
      warnings.add("ROOM_MEDIA_MISSING");
    }

    if (imageUrls.length === 0 && videoBundles.length === 0) {
      warnings.add("NO_MEDIA");
    }

    for (const album of albums) {
      if (!album.complete) {
        warnings.add(
          [
            "INCOMPLETE_ALBUM",
            album.albumKey,
            `${album.actualImageCount}/${album.expectedImageCount}`,
          ].join(":"),
        );
      }
    }

    if (videoBundles.length > 0 && videos.length === 0) {
      warnings.add(`VIDEO_SOURCE_URL_MISSING:${videoBundles.length}`);
    }

    if (assignment.unassignedBundles.length > 0) {
      warnings.add(`UNASSIGNED_MEDIA:${assignment.unassignedBundles.length}`);
    }

    const descriptionTexts = uniqueTexts(
      distributed.roomTextsById.get(room.id) || [],
    );
    const markerText = cleanText(room.markerText);

    if (!room.roomCode) {
      warnings.add("ROOM_CODE_MISSING");
    }

    if (room.roomCode.includes("+")) {
      warnings.add(`MULTIPLE_ROOM_CODES:${room.roomCode}`);
    }
    const markerMessageId =
      room.messageId || assigned[0]?.messageIds[0] || segment.messages[0]?.msgId || "";
    const markerTimestamp =
      room.timestamp || assigned[0]?.firstTimestamp || messageTimestamp(segment.messages[0]);
    const senderUid =
      room.senderUid ||
      assigned.find((bundle) => bundle.senderUid)?.senderUid ||
      dominantSender(segment.messages);

    const sourceHash = sha256(
      [
        "indexeddb-semantic-room-v3",
        groupName,
        groupId,
        segment.knownAddressKey,
        markerMessageId,
        room.roomCode,
        markerText,
        ...imageMessageIds,
        ...videoMessageIds,
      ].join("|"),
    );

    result.push({
      sourceHash,
      groupId,
      senderUid,
      houseInfoText,
      markerText,
      descriptionTexts,
      fullText: buildFullText({
        houseInfoText,
        markerText,
        descriptions: descriptionTexts,
      }),
      markerMessageId,
      markerTimestamp,
      albums,
      imageUrls,
      imageMessageIds,
      hasVideo: videoBundles.length > 0,
      videoMessageIds,
      videoUrls,
      videoThumbUrls,
      videos,
      warnings: Array.from(warnings),
    });
  }

  return result;
}

function parseOneTimeline(params: {
  groupName: string;
  groupId: string;
  messages: SemanticIndexedDbMessage[];
  options: SemanticParserOptions;
}) {
  const segments = splitIntoBuildingSegments({
    messages: params.messages,
    options: params.options,
  });

  return segments
    .flatMap((segment) =>
      buildRoomsForSegment({
        segment,
        groupName: params.groupName,
        groupId: params.groupId,
        options: params.options,
      }),
    )
    .sort((a, b) => b.markerTimestamp - a.markerTimestamp);
}

export function buildSemanticTimelineRooms(params: {
  groupName: string;
  groupId: string;
  messages: SemanticIndexedDbMessage[];
  maxGapMs?: number;
  parserOptions?: SemanticParserOptions;
}) {
  const options: SemanticParserOptions = {
    mediaBias: "auto",
    buildingBoundary: "address-or-separator",
    splitBySender: false,
    allowMediaOnly: true,
    allowTextOnly: true,
    maxMediaGapMs: params.parserOptions?.maxMediaGapMs || params.maxGapMs,
    boundaryGapMs: 45 * 60 * 1000,
    uncertainScoreDelta: 18,
    ...params.parserOptions,
  };

  if (!options.splitBySender) {
    return parseOneTimeline({
      groupName: params.groupName,
      groupId: params.groupId,
      messages: params.messages,
      options,
    });
  }

  const bySender = new Map<string, SemanticIndexedDbMessage[]>();

  for (const message of params.messages) {
    const sender = String(message.fromUid || "").trim() || "__UNKNOWN_SENDER__";
    const current = bySender.get(sender) || [];
    current.push(message);
    bySender.set(sender, current);
  }

  return Array.from(bySender.values())
    .flatMap((messages) =>
      parseOneTimeline({
        groupName: params.groupName,
        groupId: params.groupId,
        messages,
        options,
      }),
    )
    .sort((a, b) => b.markerTimestamp - a.markerTimestamp);
}

export function detectZaloBuildingCandidates(params: {
  groupName: string;
  groupId: string;
  messages: SemanticIndexedDbMessage[];
  maxGapMs?: number;
  parserOptions?: SemanticParserOptions;
}) {
  return buildSemanticTimelineRooms(params);
}