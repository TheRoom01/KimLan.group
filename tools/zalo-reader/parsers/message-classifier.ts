import type {
  ClassifiedTextMessage,
  SemanticIndexedDbMessage,
} from "./types";

import {
  cleanText,
  extractAddressKey,
  extractRoomCode,
  isNoiseText,
  isProjectHeaderText,
  isRoomMarkerLine,
  isSeparatorText,
  looksLikeBuildingLine,
  looksLikeBuildingStart,
  splitTextLines,
} from "./utils";

export function classifyTextMessage(
  message: SemanticIndexedDbMessage
): ClassifiedTextMessage {
  const cleanedText = cleanText(message.text);
  const separator = isSeparatorText(cleanedText);

  if (!cleanedText || separator) {
    return {
      cleanedText,
      buildingStart: false,
      projectHeader: false,
      addressKey: "",
      roomAnchors: [],
      buildingLines: [],
      otherLines: [],
      separator,
    };
  }

  const projectHeader = isProjectHeaderText(cleanedText);
  const addressKey = extractAddressKey(cleanedText);
  const wholeMessageLooksLikeBuilding =
    looksLikeBuildingStart(cleanedText);
  const roomAnchors: ClassifiedTextMessage["roomAnchors"] = [];
  const buildingLines: string[] = [];
  const otherLines: string[] = [];
  const lines = splitTextLines(cleanedText);
  const firstMarkerLineIndex = lines.findIndex(isRoomMarkerLine);

  lines.forEach((line, lineIndex) => {
    if (isRoomMarkerLine(line)) {
      roomAnchors.push({
        markerText: line,
        roomCode: extractRoomCode(line),
      });
      return;
    }

    /*
     * Khi một message chứa cả form tòa nhà và marker phòng,
     * mọi dòng trước marker đầu tiên vẫn là dữ liệu tòa nhà.
     * Đây là kiểu:
     *   Địa chỉ / Điện / Nước / Chính sách
     *   P.101 - 9tr
     */
    const beforeFirstMarker =
      firstMarkerLineIndex >= 0 && lineIndex < firstMarkerLineIndex;

    if (
      looksLikeBuildingLine(line) ||
      (wholeMessageLooksLikeBuilding && beforeFirstMarker)
    ) {
      buildingLines.push(line);
      return;
    }

    if (!isNoiseText(line)) {
      otherLines.push(line);
    }
  });

  /*
   * Form tòa nhà không có marker trong cùng message:
   * giữ toàn bộ các dòng có nghĩa làm dữ liệu tòa nhà.
   */
  if (wholeMessageLooksLikeBuilding && roomAnchors.length === 0) {
    for (const line of lines) {
      if (!isNoiseText(line) && !buildingLines.includes(line)) {
        buildingLines.push(line);
      }
    }
  }

  return {
    cleanedText,
    buildingStart:
      projectHeader ||
      Boolean(addressKey) ||
      wholeMessageLooksLikeBuilding,
    projectHeader,
    addressKey,
    roomAnchors,
    buildingLines,
    otherLines,
    separator: false,
  };
}
