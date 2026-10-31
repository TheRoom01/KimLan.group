import type {
  MediaBundle,
  RoomAnchor,
  SemanticParserOptions,
} from "./types";

type ResolvedBias = "before" | "after";

type AssignmentMode =
  | "alternating-before"
  | "alternating-after"
  | "batch-before"
  | "batch-after"
  | "mixed-before"
  | "mixed-after";

type Candidate = {
  room: RoomAnchor;
  roomIndex: number;
  score: number;
  crossedMarkers: number;
  indexGap: number;
  timeGapMs: number;
  correctSide: boolean;
};

function resolveBias(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options: SemanticParserOptions;
}): ResolvedBias {
  if (params.options.mediaBias === "before") {
    return "before";
  }

  if (params.options.mediaBias === "after") {
    return "after";
  }

  const rooms = [...params.rooms].sort(
    (a, b) => a.messageIndex - b.messageIndex
  );

  const bundles = [...params.bundles].sort(
    (a, b) =>
      a.firstMessageIndex - b.firstMessageIndex
  );

  const firstRoom = rooms[0];
  const firstBundle = bundles[0];
  const lastRoom = rooms[rooms.length - 1];
  const lastBundle = bundles[bundles.length - 1];

  if (
    firstRoom &&
    firstBundle &&
    firstBundle.firstMessageIndex < firstRoom.messageIndex
  ) {
    return "before";
  }

  if (
    lastRoom &&
    lastBundle &&
    lastBundle.lastMessageIndex > lastRoom.messageIndex
  ) {
    return "after";
  }

  return "after";
}

function detectMode(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  bias: ResolvedBias;
}): AssignmentMode {
  const roomCount = params.rooms.length;
  const bundleCount = params.bundles.length;

  const roomIndexes = params.rooms.map(
    (room) => room.messageIndex
  );

  const bundleIndexes = params.bundles.map(
    (bundle) => bundle.firstMessageIndex
  );

  const countsAreClose =
    Math.abs(roomCount - bundleCount) <= 1;

  if (
    countsAreClose &&
    roomIndexes.length > 0 &&
    bundleIndexes.length > 0 &&
    Math.max(...roomIndexes) < Math.min(...bundleIndexes)
  ) {
    return "batch-after";
  }

  if (
    countsAreClose &&
    roomIndexes.length > 0 &&
    bundleIndexes.length > 0 &&
    Math.max(...bundleIndexes) < Math.min(...roomIndexes)
  ) {
    return "batch-before";
  }

  const events = [
    ...params.rooms.map((room) => ({
      kind: "room" as const,
      index: room.messageIndex,
    })),
    ...params.bundles.map((bundle) => ({
      kind: "bundle" as const,
      index: bundle.firstMessageIndex,
    })),
  ].sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return a.kind === "room" ? -1 : 1;
  });

  let alternatingTransitions = 0;

  for (let index = 1; index < events.length; index++) {
    if (events[index - 1].kind !== events[index].kind) {
      alternatingTransitions += 1;
    }
  }

  const alternatingRatio =
    events.length <= 1
      ? 0
      : alternatingTransitions / (events.length - 1);

  if (
    countsAreClose &&
    alternatingRatio >= 0.75
  ) {
    return params.bias === "before"
      ? "alternating-before"
      : "alternating-after";
  }

  return params.bias === "before"
    ? "mixed-before"
    : "mixed-after";
}

function expectedPairs(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  mode: AssignmentMode;
}) {
  const result = new Map<string, string>();

  const rooms = [...params.rooms].sort(
    (a, b) => a.messageIndex - b.messageIndex
  );

  const bundles = [...params.bundles].sort(
    (a, b) =>
      a.firstMessageIndex - b.firstMessageIndex
  );

  if (
    params.mode === "batch-after" ||
    params.mode === "batch-before"
  ) {
    const pairCount = Math.min(
      rooms.length,
      bundles.length
    );

    for (let index = 0; index < pairCount; index++) {
      result.set(bundles[index].id, rooms[index].id);
    }

    return result;
  }

  if (params.mode === "alternating-after") {
    for (const bundle of bundles) {
      const previousRooms = rooms.filter(
        (room) =>
          room.messageIndex <= bundle.firstMessageIndex
      );

      const target =
        previousRooms[previousRooms.length - 1];

      if (target) {
        result.set(bundle.id, target.id);
      }
    }

    return result;
  }

  if (params.mode === "alternating-before") {
    for (const bundle of bundles) {
      const target = rooms.find(
        (room) =>
          room.messageIndex >= bundle.lastMessageIndex
      );

      if (target) {
        result.set(bundle.id, target.id);
      }
    }
  }

  return result;
}

function candidateMetrics(params: {
  rooms: RoomAnchor[];
  room: RoomAnchor;
  roomIndex: number;
  bundle: MediaBundle;
  bias: ResolvedBias;
  mode: AssignmentMode;
  expectedRoomId?: string;
  options: SemanticParserOptions;
}): Candidate | null {
  const bundleBeforeRoom =
    params.bundle.lastMessageIndex <=
    params.room.messageIndex;

  const bundleAfterRoom =
    params.room.messageIndex <=
    params.bundle.firstMessageIndex;

  const correctSide =
    params.bias === "before"
      ? bundleBeforeRoom
      : bundleAfterRoom;

  const indexGap = bundleBeforeRoom
    ? Math.max(
        0,
        params.room.messageIndex -
          params.bundle.lastMessageIndex
      )
    : Math.max(
        0,
        params.bundle.firstMessageIndex -
          params.room.messageIndex
      );

  const roomTime = Number(
    params.room.timestamp || 0
  );

  const bundleTimes = [
    Number(params.bundle.firstTimestamp || 0),
    Number(params.bundle.lastTimestamp || 0),
  ].filter((value) => value > 0);

  const timeGapMs =
    roomTime > 0 && bundleTimes.length > 0
      ? Math.min(
          ...bundleTimes.map((value) =>
            Math.abs(value - roomTime)
          )
        )
      : 0;

  const maxGapMs = Math.max(
    60_000,
    Number(
      params.options.maxMediaGapMs ||
        30 * 60 * 1000
    )
  );

  if (timeGapMs > maxGapMs) {
    return null;
  }

  const lowerIndex = Math.min(
    params.room.messageIndex,
    params.bundle.firstMessageIndex
  );

  const upperIndex = Math.max(
    params.room.messageIndex,
    params.bundle.lastMessageIndex
  );

  const crossedMarkers = params.rooms.filter(
    (room, index) =>
      index !== params.roomIndex &&
      room.messageIndex > lowerIndex &&
      room.messageIndex < upperIndex
  ).length;

  const roomSender = String(
    params.room.senderUid || ""
  ).trim();

  const bundleSender = String(
    params.bundle.senderUid || ""
  ).trim();

  let score = 0;

  if (roomSender && bundleSender) {
    score +=
      roomSender === bundleSender
        ? 45
        : -45;
  }

  score += correctSide ? 30 : -18;

  if (
    params.expectedRoomId &&
    params.expectedRoomId === params.room.id
  ) {
    score +=
      params.mode.startsWith("batch")
        ? 100
        : 75;
  } else if (params.expectedRoomId) {
    score -= 20;
  }

  if (indexGap <= 1) {
    score += 22;
  } else if (indexGap <= 3) {
    score += 14;
  } else if (indexGap <= 6) {
    score += 7;
  } else {
    score -= Math.min(18, indexGap);
  }

  if (timeGapMs <= 0 || timeGapMs <= 2 * 60 * 1000) {
    score += 22;
  } else if (timeGapMs <= 5 * 60 * 1000) {
    score += 14;
  } else if (timeGapMs <= 15 * 60 * 1000) {
    score += 7;
  }

  const expectedBatchPair =
    params.mode.startsWith("batch") &&
    params.expectedRoomId === params.room.id;

  if (!expectedBatchPair) {
    score -= crossedMarkers * 38;
  }

  return {
    room: params.room,
    roomIndex: params.roomIndex,
    score,
    crossedMarkers,
    indexGap,
    timeGapMs,
    correctSide,
  };
}

export function assignPhase2MediaToRooms(params: {
  rooms: RoomAnchor[];
  bundles: MediaBundle[];
  options: SemanticParserOptions;
}) {
  const assignedByRoomId =
    new Map<string, MediaBundle[]>();

  const warningsByRoomId =
    new Map<string, Set<string>>();

  const unassignedBundles: MediaBundle[] = [];

  for (const room of params.rooms) {
    assignedByRoomId.set(room.id, []);
    warningsByRoomId.set(room.id, new Set());
  }

  const rooms = [...params.rooms].sort(
    (a, b) => a.messageIndex - b.messageIndex
  );

  const bundles = [...params.bundles].sort(
    (a, b) =>
      a.firstMessageIndex - b.firstMessageIndex
  );

  // Room facts only flow forward: anchor -> following media.
  const resolvedBias: ResolvedBias = "after";

  const assignmentMode = detectMode({
    rooms,
    bundles,
    bias: resolvedBias,
  });

  const maxGapMs = Math.max(
    60_000,
    Number(params.options.maxMediaGapMs || 30 * 60 * 1000),
  );

  for (const bundle of bundles) {
    const previousRooms = rooms.filter(
      (room) => room.messageIndex <= bundle.firstMessageIndex,
    );
    const targetRoom = previousRooms[previousRooms.length - 1];

    if (!targetRoom) {
      unassignedBundles.push(bundle);
      const nextRoom = rooms.find(
        (room) => room.messageIndex >= bundle.lastMessageIndex,
      );
      if (nextRoom) {
        warningsByRoomId.get(nextRoom.id)?.add(
          `MEDIA_BEFORE_ROOM_ANCHOR_REVIEW_REQUIRED:${bundle.id}`,
        );
      }
      continue;
    }

    const roomTimestamp = Number(targetRoom.timestamp || 0);
    const mediaTimestamp = Number(bundle.firstTimestamp || 0);
    const timeGapMs = mediaTimestamp - roomTimestamp;
    const roomSender = String(targetRoom.senderUid || "").trim();
    const mediaSender = String(bundle.senderUid || "").trim();
    const hasStableOrder =
      roomTimestamp > 0 &&
      mediaTimestamp > 0 &&
      timeGapMs >= 0 &&
      timeGapMs <= maxGapMs;
    const sameSender =
      !roomSender || !mediaSender || roomSender === mediaSender;

    if (!hasStableOrder || !sameSender) {
      unassignedBundles.push(bundle);
      warningsByRoomId.get(targetRoom.id)?.add(
        `FORWARD_MEDIA_ORDER_REVIEW_REQUIRED:${bundle.id}`,
      );
      continue;
    }

    assignedByRoomId.get(targetRoom.id)?.push(bundle);
  }

  return {
    assignedByRoomId,
    warningsByRoomId,
    unassignedBundles,
    resolvedBias,
    assignmentMode,
  };
}
