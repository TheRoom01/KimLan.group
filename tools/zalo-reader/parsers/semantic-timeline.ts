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
import {
  assignMediaToRooms,
  buildMediaBundles,
} from "./media-matcher";
import {
  cleanText,
  isNoiseText,
  messageTimestamp,
  sha256,
  uniqueTexts,
} from "./utils";

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

function buildRoomAnchors(segment: BuildingSegment) {
  const rooms: RoomAnchor[] = [];

  segment.messages.forEach((message, messageIndex) => {
    if (message.kind !== "text") return;

    const classification = classifyTextMessage(message);

    classification.roomAnchors.forEach((anchor, anchorIndex) => {
      rooms.push({
        id: [
          segment.id,
          String(message.msgId || message.cliMsgId || messageIndex),
          anchorIndex,
        ].join(":"),
        messageId: String(
          message.msgId || message.cliMsgId || ""
        ).trim(),
        messageIndex,
        timestamp: messageTimestamp(message),
        senderUid: String(message.fromUid || "").trim(),
        markerText: anchor.markerText,
        roomCode: anchor.roomCode,
        descriptionTexts: [],
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
    firstMedia?.firstMessageIndex ??
    Math.max(0, segment.messages.length - 1);

  return {
    id: `${segment.id}:synthetic-room`,
    messageId: String(
      firstMedia?.messageIds[0] ||
        lastMessage?.msgId ||
        lastMessage?.cliMsgId ||
        ""
    ).trim(),
    messageIndex,
    timestamp:
      firstMedia?.firstTimestamp ||
      messageTimestamp(lastMessage) ||
      messageTimestamp(firstMessage),
    senderUid:
      firstMedia?.senderUid || dominantSender(segment.messages),
    markerText: "",
    roomCode: "",
    descriptionTexts: [],
  } satisfies RoomAnchor;
}

function nearestPreviousRoom(
  rooms: RoomAnchor[],
  messageIndex: number
) {
  return [...rooms]
    .filter((room) => room.messageIndex <= messageIndex)
    .sort((a, b) => b.messageIndex - a.messageIndex)[0];
}

function nearestNextRoom(
  rooms: RoomAnchor[],
  messageIndex: number
) {
  return [...rooms]
    .filter((room) => room.messageIndex > messageIndex)
    .sort((a, b) => a.messageIndex - b.messageIndex)[0];
}

function distributeText(params: {
  segment: BuildingSegment;
  rooms: RoomAnchor[];
  inferredBias: "before" | "after";
}) {
  const firstRoomIndex =
    params.rooms[0]?.messageIndex ?? Number.MAX_SAFE_INTEGER;
  const buildingTexts = [...params.segment.buildingTexts];

  params.segment.messages.forEach((message, messageIndex) => {
    if (message.kind !== "text") return;

    const classification = classifyTextMessage(message);
    if (classification.separator) return;

    const candidateTexts = uniqueTexts(classification.otherLines);

    for (const text of candidateTexts) {
      if (!text || isNoiseText(text)) continue;

      /*
       * Text trước phòng đầu tiên thường là quy mô/chính sách tòa nhà,
       * kể cả khi không có nhãn Điện/Nước/Cọc ở đầu dòng.
       */
      if (messageIndex < firstRoomIndex) {
        buildingTexts.push(text);
        continue;
      }

      const previous = nearestPreviousRoom(
        params.rooms,
        messageIndex
      );
      const next = nearestNextRoom(params.rooms, messageIndex);

      const target =
        previous ||
        (params.inferredBias === "before" ? next : undefined) ||
        next;

      if (target) {
        target.descriptionTexts.push(text);
      } else {
        buildingTexts.push(text);
      }
    }
  });

  return uniqueTexts(buildingTexts);
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
    const hasMedia = bundles.length > 0;
    const hasText = segment.messages.some(
      (message) =>
        message.kind === "text" && Boolean(cleanText(message.text))
    );

    const mayCreate =
      (hasMedia && options.allowMediaOnly !== false) ||
      (hasText && options.allowTextOnly !== false);

    if (!mayCreate) return [];

    rooms = [makeSyntheticRoom({ segment, bundles })];
  }

  const assignment = assignMediaToRooms({
    rooms,
    bundles,
    options,
  });

  const buildingTexts = distributeText({
    segment,
    rooms,
    inferredBias: assignment.inferredBias,
  });

  const houseInfoText = buildingTexts.join("\n").trim();
  const result: SemanticRoomPreview[] = [];

  for (const room of rooms) {
    const assigned =
      assignment.assignedByRoomId.get(room.id) || [];
    const albums = assigned
      .map((bundle) => bundle.album)
      .filter((album): album is SemanticAlbumPreview =>
        Boolean(album)
      );

    const imageUrls = Array.from(
      new Set(albums.flatMap((album) => album.imageUrls))
    );
    const imageMessageIds = Array.from(
      new Set(albums.flatMap((album) => album.imageMessageIds))
    );
    const videoBundles = assigned.filter(
      (bundle) => bundle.kind === "video"
    );
    const videoMessageIds = Array.from(
      new Set(videoBundles.flatMap((bundle) => bundle.messageIds))
    );
    const videoUrls = Array.from(
      new Set(
        videoBundles.flatMap((bundle) => bundle.videoUrls || [])
      )
    );
    const videoThumbUrls = Array.from(
      new Set(
        videoBundles.flatMap(
          (bundle) => bundle.videoThumbUrls || []
        )
      )
    );
    const videos = flattenVideoPayloads(videoBundles);

    const warnings = new Set<string>(segment.warnings);

    if (bundles.length > 0 && hadRealRoomMarker) {
      warnings.add(`SEMANTIC_MEDIA_BIAS:${assignment.inferredBias}`);
    }

    for (const warning of
      assignment.warningsByRoomId.get(room.id) || []) {
      warnings.add(warning);
    }

    if (!hadRealRoomMarker) {
      warnings.add("NO_ROOM_MARKER");
      warnings.add("ROOM_CODE_MISSING");
    }

    if (!houseInfoText) {
      warnings.add("NO_HOUSE_INFO");
    }

    if (imageUrls.length === 0) {
      warnings.add("NO_IMAGES");
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
          ].join(":")
        );
      }
    }

    if (videoBundles.length > 0 && videos.length === 0) {
      warnings.add(
        `VIDEO_SOURCE_URL_MISSING:${videoBundles.length}`
      );
    }

    if (assignment.unassignedBundles.length > 0) {
      warnings.add(
        `UNASSIGNED_MEDIA:${assignment.unassignedBundles.length}`
      );
    }

    const descriptionTexts = uniqueTexts(
      room.descriptionTexts
    );
    const markerText = cleanText(room.markerText);
    const markerMessageId =
      room.messageId ||
      assigned[0]?.messageIds[0] ||
      segment.messages[0]?.msgId ||
      "";
    const markerTimestamp =
      room.timestamp ||
      assigned[0]?.firstTimestamp ||
      messageTimestamp(segment.messages[0]);
    const senderUid =
      room.senderUid ||
      assigned.find((bundle) => bundle.senderUid)?.senderUid ||
      dominantSender(segment.messages);

    const sourceHash = sha256(
      [
        "indexeddb-semantic-room-v1",
        groupName,
        groupId,
        segment.knownAddressKey,
        markerMessageId,
        room.roomCode,
        markerText,
        ...imageMessageIds,
        ...videoMessageIds,
      ].join("|")
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
      })
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
    maxMediaGapMs:
      params.parserOptions?.maxMediaGapMs || params.maxGapMs,
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
    const sender = String(message.fromUid || "").trim() ||
      "__UNKNOWN_SENDER__";
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
      })
    )
    .sort((a, b) => b.markerTimestamp - a.markerTimestamp);
}
