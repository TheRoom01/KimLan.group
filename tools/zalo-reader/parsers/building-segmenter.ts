import type {
  BuildingSegment,
  SemanticIndexedDbMessage,
  SemanticParserOptions,
} from "./types";

import { classifyTextMessage } from "./message-classifier";
import {
  cleanText,
  extractAddressKey,
  isProjectHeaderText,
  isSeparatorText,
  isVideoMessage,
  looksLikeBuildingStart,
  messageTimestamp,
  sortMessages,
  splitTextLines,
  uniqueTexts,
} from "./utils";

function makeSegment(index: number): BuildingSegment {
  return {
    id: `building-segment-${index}`,
    messages: [],
    sourceIndexes: [],
    buildingTexts: [],
    knownAddressKey: "",
    warnings: new Set<string>(),
  };
}

function segmentHasRoomOrMedia(segment: BuildingSegment) {
  return segment.messages.some((message) => {
    if (message.kind === "image" || isVideoMessage(message)) {
      return true;
    }

    if (message.kind !== "text") return false;
    return classifyTextMessage(message).roomAnchors.length > 0;
  });
}

function shouldSplitForBuildingStart(params: {
  current: BuildingSegment;
  nextAddressKey: string;
  nextIsProjectHeader: boolean;
  boundaryMode: SemanticParserOptions["buildingBoundary"];
}) {
  const { current, nextAddressKey, nextIsProjectHeader, boundaryMode } = params;

  if (current.messages.length === 0) return false;
  if (boundaryMode === "separator") return false;

  const hasRoomOrMedia = segmentHasRoomOrMedia(current);

  if (nextAddressKey) {
    if (!current.knownAddressKey) {
      return hasRoomOrMedia;
    }

    return nextAddressKey !== current.knownAddressKey;
  }

  if (nextIsProjectHeader) {
    return (
      hasRoomOrMedia ||
      current.knownAddressKey.length > 0 ||
      current.buildingTexts.length > 0
    );
  }

  return hasRoomOrMedia;
}

function isStrongBlockStartLine(input: string) {
  const text = cleanText(input);
  if (!text) return false;

  return (
    isProjectHeaderText(text) ||
    Boolean(extractAddressKey(text)) ||
    looksLikeBuildingStart(text) ||
    /^(?:dia chi|dc)\s*[:\-]/i.test(text)
  );
}

function cloneTextMessageIntoParts(
  message: SemanticIndexedDbMessage,
  sourceIndex: number,
) {
  const text = cleanText(message.text);
  if (!text) return [message];

  const lines = splitTextLines(text)
    .map((line) => cleanText(line))
    .filter(Boolean);

  if (lines.length <= 1) return [message];

  const parts: SemanticIndexedDbMessage[] = [];
  const baseId = String(message.msgId || message.cliMsgId || `msg-${sourceIndex}`);
  const baseCliId = String(message.cliMsgId || message.msgId || baseId);
  const orderBase = Number(
    message.domHydration?.order ?? sourceIndex * 1000,
  );

  let buffer: string[] = [];
  let partIndex = 0;

  const flush = () => {
    if (buffer.length === 0) return;

    const chunk = cleanText(buffer.join("\n"));
    buffer = [];

    if (!chunk) return;

    parts.push({
      ...message,
      text: chunk,
      msgId: `${baseId}::part${String(partIndex).padStart(3, "0")}`,
      cliMsgId: `${baseCliId}::part${String(partIndex).padStart(3, "0")}`,
      domHydration: {
        ...(message.domHydration || {}),
        order: orderBase + partIndex,
      },
    });

    partIndex += 1;
  };

  for (const line of lines) {
    if (isSeparatorText(line)) {
      flush();
      continue;
    }

    const startsNewBlock = isStrongBlockStartLine(line);

    if (startsNewBlock && buffer.length > 0) {
      flush();
    }

    buffer.push(line);
  }

  flush();

  return parts.length > 0 ? parts : [message];
}

function expandMessagesForBlockParsing(messages: SemanticIndexedDbMessage[]) {
  const expanded: SemanticIndexedDbMessage[] = [];

  messages.forEach((message, sourceIndex) => {
    if (message.kind !== "text") {
      expanded.push(message);
      return;
    }

    const parts = cloneTextMessageIntoParts(message, sourceIndex);
    expanded.push(...parts);
  });

  return expanded;
}

export function splitIntoBuildingSegments(params: {
  messages: SemanticIndexedDbMessage[];
  options?: SemanticParserOptions;
}) {
  const sortedOriginal = sortMessages(params.messages);
  const expandedMessages = expandMessagesForBlockParsing(sortedOriginal);
  const messages = sortMessages(expandedMessages);

  const options = params.options || {};
  const boundaryMode = options.buildingBoundary || "address-or-separator";
  const boundaryGapMs = Math.max(
    60_000,
    Number(options.boundaryGapMs || 45 * 60 * 1000),
  );

  const segments: BuildingSegment[] = [];
  let current = makeSegment(0);
  let lastTimestamp = 0;

  function flush() {
    if (current.messages.length === 0) return;

    current.buildingTexts = uniqueTexts(current.buildingTexts);
    segments.push(current);
    current = makeSegment(segments.length);
    lastTimestamp = 0;
  }

  for (let sourceIndex = 0; sourceIndex < messages.length; sourceIndex++) {
    const message = messages[sourceIndex];
    const timestamp = messageTimestamp(message);
    const classification =
      message.kind === "text" ? classifyTextMessage(message) : null;

    if (classification?.separator) {
      flush();
      continue;
    }

    const splitForBuilding = Boolean(
      classification?.buildingStart &&
        shouldSplitForBuildingStart({
          current,
          nextAddressKey: classification.addressKey,
          nextIsProjectHeader: classification.projectHeader,
          boundaryMode,
        }),
    );

    const splitForLargeGap = Boolean(
      boundaryMode !== "separator" &&
        current.messages.length > 0 &&
        timestamp > 0 &&
        lastTimestamp > 0 &&
        timestamp - lastTimestamp > boundaryGapMs &&
        (classification?.buildingStart || classification?.roomAnchors.length),
    );

    if (splitForBuilding || splitForLargeGap) {
      flush();
    }

    current.messages.push(message);
    current.sourceIndexes.push(sourceIndex);

    if (classification) {
      current.buildingTexts.push(...classification.buildingLines);

      /*
       * Các dòng chính sách không có nhãn mạnh nhưng xuất hiện trước
       * phòng đầu tiên vẫn thuộc dữ liệu tòa nhà.
       */
      if (!segmentHasRoomOrMedia(current)) {
        current.buildingTexts.push(...classification.otherLines);
      }

      if (classification.addressKey) {
        current.knownAddressKey = classification.addressKey;
      }
    }

    if (timestamp > 0) lastTimestamp = timestamp;
  }

  flush();
  return segments;
}