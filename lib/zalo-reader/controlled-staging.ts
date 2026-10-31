import { isExactGroupNameMatch } from "../zalo-import/group-allowlist";
import { createHash } from "node:crypto";

export function makeTestPendingIdentity(groupId: string, messageId: string) {
  if (!groupId.trim() || !messageId.trim()) throw new Error("Test import requires group/message ID");
  const hash = (kind: string) => createHash("sha256").update(JSON.stringify(["zalo-test-pending-v1", kind, groupId, messageId])).digest("hex");
  const uuid = (kind: string) => {
    const value = hash(kind);
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
  };
  return { sourceHash: hash("source"), batchId: uuid("batch"), pendingId: uuid("pending") };
}

export const CONTROLLED_ZALO_GROUP_ID = "g1986619726266954037";
export const CONTROLLED_ZALO_GROUP_NAME = "Giỏ Hàng Căn Hộ Q1,Q3,Q10 🏠";

export function isControlledZaloTarget(input: {
  groupId: unknown;
  groupName: unknown;
}) {
  return (
    String(input.groupId ?? "").trim() === CONTROLLED_ZALO_GROUP_ID &&
    isExactGroupNameMatch(input.groupName, CONTROLLED_ZALO_GROUP_NAME)
  );
}

export function shouldAutoPublishZaloImport(input: {
  stagingOnly: boolean;
  eligible: boolean;
  enabled: boolean;
  dryRun: boolean;
}) {
  return (
    !input.stagingOnly &&
    input.eligible &&
    input.enabled &&
    !input.dryRun
  );
}

export type StagingRoomCandidate = {
  markerMessageId?: unknown;
  markerTimestamp?: unknown;
  sourceHash?: unknown;
  warnings?: string[];
};

export function selectControlledStagingRooms<T extends StagingRoomCandidate>(input: {
  rooms: T[];
  cutoffMs: number;
  endMs: number;
  maxMessages: number;
  maxRooms: number;
  importedSourceHashes?: ReadonlySet<string>;
  allowReimportForTesting?: boolean;
  testImportToPending?: boolean;
  testNewSourcesOnly?: boolean;
}) {
  const groups = new Map<string, T[]>();
  const seenSourceHashes = new Set<string>();
  let excludedUntrusted = 0;
  let excludedAlreadyImported = 0;
  let excludedDuplicateSources = 0;
  let excludedUnanchored = 0;

  const sorted = [...input.rooms].sort(
    (left, right) =>
      Number(right.markerTimestamp) - Number(left.markerTimestamp)
  );

  for (const room of sorted) {
    if (!isAnchoredImportCandidate(room)) {
      excludedUnanchored += 1;
      continue;
    }
    const messageId = String(room.markerMessageId ?? "").trim();
    const timestamp = Number(room.markerTimestamp);
    if (
      !messageId ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < input.cutoffMs ||
      timestamp > input.endMs
    ) {
      excludedUntrusted += 1;
      continue;
    }

    const sourceHash = String(room.sourceHash ?? "").trim();
    if (!input.allowReimportForTesting && (!input.testImportToPending || input.testNewSourcesOnly) && sourceHash && input.importedSourceHashes?.has(sourceHash)) {
      excludedAlreadyImported += 1;
      continue;
    }
    if (sourceHash && seenSourceHashes.has(sourceHash)) {
      excludedDuplicateSources += 1;
      continue;
    }
    if (sourceHash) seenSourceHashes.add(sourceHash);

    const messageRooms = groups.get(messageId) ?? [];
    messageRooms.push(room);
    groups.set(messageId, messageRooms);
  }

  const selected: T[] = [];
  let selectedMessages = 0;
  let limitedMessages = 0;
  let limitedRooms = 0;
  let excludedMultiRoomSources = 0;

  for (const messageRooms of groups.values()) {
    if (input.testImportToPending && messageRooms.length > 1) {
      excludedMultiRoomSources += 1;
      continue;
    }
    if (selectedMessages >= Math.min(input.maxMessages, input.testImportToPending ? 10 : Infinity)) {
      limitedMessages += 1;
      continue;
    }

    if (selected.length + messageRooms.length > Math.min(input.maxRooms, input.testImportToPending ? 10 : Infinity)) {
      limitedRooms += 1;
      continue;
    }

    selected.push(...messageRooms);
    selectedMessages += 1;
  }

  return {
    rooms: selected,
    selectedMessages,
    selectedRooms: selected.length,
    selectedImportedRooms: selected.filter((room) =>
      input.importedSourceHashes?.has(String(room.sourceHash ?? "").trim())
    ).length,
    selectedNewRooms: selected.filter((room) =>
      !input.importedSourceHashes?.has(String(room.sourceHash ?? "").trim())
    ).length,
    excludedUntrusted,
    excludedAlreadyImported,
    excludedDuplicateSources,
    excludedUnanchored,
    limitedMessages,
    limitedRooms,
    excludedMultiRoomSources,
  };
}

export function isAnchoredImportCandidate(room: StagingRoomCandidate) {
  return !room.warnings?.some((warning) =>
    warning === "ROOM_MARKER_MISSING" || warning === "NO_ROOM_MARKER"
  );
}
