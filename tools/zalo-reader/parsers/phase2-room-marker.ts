import {
  cleanText,
  hasRoomPrice,
  stableText,
  stripLeadingDecorations,
} from "./utils";

export type Phase2RoomMarkerAnalysis = {
  markerText: string;
  roomCode: string;
  roomCodes: string[];
  explicitRoomForm: boolean;
  markerLineIndex: number;
};

function priceStartIndex(input: string) {
  const patterns = [
    /\b\d+\s*(?:tr|triệu)\d{0,3}\b/i,
    /\b\d+(?:[.,]\d+)?\s*(?:tr|triệu)\b/i,
    /\b\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?\b/i,
  ];

  const indexes = patterns
    .map((pattern) => input.search(pattern))
    .filter((index) => index >= 0);

  return indexes.length > 0
    ? Math.min(...indexes)
    : -1;
}

function normalizeRoomCode(input: string) {
  return String(input || "")
    .replace(/[.\s]+/g, "")
    .toUpperCase();
}

function extractExplicitLabeledRoomCodes(line: string) {
  const normalized = stableText(line);

  /*
   * Ưu tiên mã nằm ngay sau nhãn ở đầu tin nhắn:
   * Phòng, 601: ...
   * Phòng P402 - ...
   * Mã phòng: 305
   * Mã 701: ...
   *
   * Dùng dấu ^ để không nhận nhầm "Giá phòng: 16.500.000".
   */
  const match = normalized.match(
    /^(?:phong|ma phong|ma)\s*[,.:;\-]*\s*((?:p\s*\.?\s*)?[a-z]{0,2}\d{2,4}[a-z]?)(?=\s*(?:[,.:;\-]|$))/i
  );

  if (!match?.[1]) {
    return [];
  }

  const code = normalizeRoomCode(match[1]);

  return code ? [code] : [];
}

function extractCodesBeforePrice(line: string) {
  const cleanLine = cleanText(line);

    const explicitCodes =
    extractExplicitLabeledRoomCodes(cleanLine);

  if (explicitCodes.length > 0) {
    return explicitCodes;
  }
  const priceIndex = priceStartIndex(cleanLine);

  if (priceIndex < 0) return [];

  const prefix = cleanLine
    .slice(0, priceIndex)
    .replace(
      /^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/,
      ""
    );

  const codes: string[] = [];

  for (const match of prefix.matchAll(
    /\bp\s*\.?\s*(\d{2,4}[a-z]?)\b/gi
  )) {
    const code = normalizeRoomCode(`P${match[1]}`);
    if (code) codes.push(code);
  }

  const withoutPCodes = prefix.replace(
    /\bp\s*\.?\s*\d{2,4}[a-z]?\b/gi,
    " "
  );

  for (const match of withoutPCodes.matchAll(
    /(?:^|[^\d/])([a-z]{0,2}\d{2,4}[a-z]?)(?=$|[^\d])/gi
  )) {
    const raw = normalizeRoomCode(match[1]);

    if (!raw) continue;
    if (/^\d{1}$/.test(raw)) continue;
    if (/^\d+PN$/i.test(raw)) continue;
    if (/^\d+M2$/i.test(raw)) continue;

    codes.push(raw);
  }

  return Array.from(new Set(codes));
}

function extractCodeFromRoomField(lines: string[]) {
  for (const line of lines) {
    const normalized = stripLeadingDecorations(line);

    const match = normalized.match(
      /^(?:ma phong|phong)\s*[:\-]\s*(.*)$/i
    );

    if (!match) continue;

    const rawValue = String(match[1] || "").trim();
    if (!rawValue) return [];

    const codes = Array.from(
      rawValue.matchAll(
        /(?:p\s*\.?\s*)?([a-z]{0,2}\d{2,4}[a-z]?)/gi
      )
    )
      .map((item) => normalizeRoomCode(item[1]))
      .filter(Boolean);

    return Array.from(new Set(codes));
  }

  return [];
}

function isExplicitRoomForm(lines: string[]) {
  const normalizedLines = lines.map((line) =>
    stripLeadingDecorations(line)
  );

  const hasPriceField = normalizedLines.some(
    (line) =>
      /^gia phong\s*[:\-]/i.test(line) &&
      hasRoomPrice(line)
  );

  if (!hasPriceField) return false;

  const formSignals = [
    /^ma phong\s*[:\-]/i,
    /^so tien coc\s*[:\-]/i,
    /^phi nhuong\s*[:\-]/i,
    /^han check\s*in\s*[:\-]/i,
    /^h(?:d|op dong) con lai\s*[:\-]/i,
    /^dia chi(?: du an)?\s*[:\-]/i,
  ];

  const signalCount = normalizedLines.filter((line) =>
    formSignals.some((pattern) => pattern.test(line))
  ).length;

  return signalCount >= 2;
}

function pricedMarkerLineIndexes(lines: string[]) {
  const result: number[] = [];

  lines.forEach((line, index) => {
    if (!hasRoomPrice(line)) return;

    const normalized = stableText(line);
    const codes = extractCodesBeforePrice(line);

    const hasRoomCue =
      codes.length > 0 ||
      /\b(?:trong|trong san|phong|ma phong|lau|tang|tret|lung|2pn|3pn|studio)\b/.test(
        normalized
      );

    if (hasRoomCue) {
      result.push(index);
    }
  });

  return result;
}

export function analyzePhase2RoomMarkerMessage(
  input: unknown
): Phase2RoomMarkerAnalysis | null {
  const markerText = cleanText(input);
  if (!markerText || !hasRoomPrice(markerText)) {
    return null;
  }

  const lines = markerText
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);

  const explicitRoomForm = isExplicitRoomForm(lines);

  if (explicitRoomForm) {
    const roomCodes = extractCodeFromRoomField(lines);

    return {
      markerText,
      roomCode: roomCodes.join("+"),
      roomCodes,
      explicitRoomForm: true,
      markerLineIndex: lines.findIndex((line) =>
        /^gia phong\s*[:\-]/i.test(
          stripLeadingDecorations(line)
        )
      ),
    };
  }

  const markerIndexes = pricedMarkerLineIndexes(lines);

  /*
   * Nhiều marker giá độc lập trong cùng message:
   * để classifier cũ xử lý từng dòng, tránh gộp nhiều phòng thành một.
   */
  if (markerIndexes.length !== 1) {
    return null;
  }

  const markerLineIndex = markerIndexes[0];
  const markerLine = lines[markerLineIndex];
  const roomCodes = extractCodesBeforePrice(markerLine);

  /*
   * Giữ thêm các dòng giá điều chỉnh ngay sau marker:
   * Chốt giảm / Giá chốt / Giảm còn...
   */
  const continuationLines = lines
    .slice(markerLineIndex + 1)
    .filter((line) => {
      const normalized = stableText(line);

      return (
        hasRoomPrice(line) &&
        /^(?:chot giam|gia chot|gia moi|giam con|chot con|gia sau giam)\b/.test(
          normalized
        )
      );
    });

  return {
    markerText: [markerLine, ...continuationLines]
      .join("\n")
      .trim(),
    roomCode: roomCodes.join("+"),
    roomCodes,
    explicitRoomForm: false,
    markerLineIndex,
  };
}
