import { isExactGroupNameMatch } from "../zalo-import/group-allowlist";

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
};

export function selectControlledStagingRooms<T extends StagingRoomCandidate>(input: {
  rooms: T[];
  cutoffMs: number;
  endMs: number;
  maxMessages: number;
  maxRooms: number;
}) {
  const groups = new Map<string, T[]>();
  let excludedUntrusted = 0;

  const sorted = [...input.rooms].sort(
    (left, right) =>
      Number(right.markerTimestamp) - Number(left.markerTimestamp)
  );

  for (const room of sorted) {
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

    const messageRooms = groups.get(messageId) ?? [];
    messageRooms.push(room);
    groups.set(messageId, messageRooms);
  }

  const selected: T[] = [];
  let selectedMessages = 0;
  let limitedMessages = 0;
  let limitedRooms = 0;

  for (const messageRooms of groups.values()) {
    if (selectedMessages >= input.maxMessages) {
      limitedMessages += 1;
      continue;
    }

    if (selected.length + messageRooms.length > input.maxRooms) {
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
    excludedUntrusted,
    limitedMessages,
    limitedRooms,
  };
}
