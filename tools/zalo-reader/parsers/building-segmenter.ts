import type {
  BuildingSegment,
  SemanticIndexedDbMessage,
  SemanticParserOptions,
} from "./types";

import { classifyTextMessage } from "./message-classifier";
import {
  isVideoMessage,
  messageTimestamp,
  sortMessages,
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
  const {
    current,
    nextAddressKey,
    nextIsProjectHeader,
    boundaryMode,
  } = params;

  if (current.messages.length === 0) return false;
  if (boundaryMode === "separator") return false;

  const hasRoomOrMedia = segmentHasRoomOrMedia(current);

  if (nextAddressKey) {
    if (!current.knownAddressKey) {
      /*
       * Mẫu:
       * CẬP NHẬT DỰ ÁN DUY TRÌ: địa chỉ
       * 31 Ký Hoà Quận 5
       *
       * Hai message này vẫn là cùng một tòa nhà vì segment hiện tại
       * chưa có phòng/media và chưa biết địa chỉ.
       */
      return hasRoomOrMedia;
    }

    return nextAddressKey !== current.knownAddressKey;
  }

  if (nextIsProjectHeader) {
    /*
     * Một tiêu đề dự án mạnh luôn là ranh giới mới khi segment hiện tại
     * đã có bất kỳ dữ liệu có nghĩa nào. Không yêu cầu phải thấy phòng/media,
     * vì lịch sử quét có thể bắt đầu giữa một bài đăng cũ và chỉ còn form tòa nhà.
     *
     * Ví dụ cần tách:
     *   [form cũ chưa thấy marker]
     *   HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3:
     */
    return (
      hasRoomOrMedia ||
      current.knownAddressKey.length > 0 ||
      current.buildingTexts.length > 0
    );
  }

  /*
   * Có những form mở tòa nhà mới không dùng tiêu đề "Dự án":
   *   Khai Trương CHDV cao cấp
   *   📌Địa chỉ: 90/88F Nguyễn Đình Chiểu - Quận 1
   *
   * Nếu segment hiện tại đã có phòng/media, một form tòa nhà mạnh
   * tiếp theo phải mở segment mới, kể cả addressKey chưa đọc được.
   */
  return hasRoomOrMedia;
}

export function splitIntoBuildingSegments(params: {
  messages: SemanticIndexedDbMessage[];
  options?: SemanticParserOptions;
}) {
  const messages = sortMessages(params.messages);
  const options = params.options || {};
  const boundaryMode =
    options.buildingBoundary || "address-or-separator";
  const boundaryGapMs = Math.max(
    60_000,
    Number(options.boundaryGapMs || 45 * 60 * 1000)
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
      message.kind === "text"
        ? classifyTextMessage(message)
        : null;

    if (classification?.separator) {
      if (boundaryMode !== "address") {
        flush();
      }
      continue;
    }

    const splitForBuilding = Boolean(
      classification?.buildingStart &&
        shouldSplitForBuildingStart({
          current,
          nextAddressKey: classification.addressKey,
          nextIsProjectHeader: classification.projectHeader,
          boundaryMode,
        })
    );

    const splitForLargeGap = Boolean(
      current.messages.length > 0 &&
        timestamp > 0 &&
        lastTimestamp > 0 &&
        timestamp - lastTimestamp > boundaryGapMs &&
        (classification?.buildingStart ||
          classification?.roomAnchors.length)
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
