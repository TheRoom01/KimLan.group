import {
  cleanText,
  hasRoomPrice,
  stableText,
  stripLeadingDecorations,
} from "./utils";
import { extractStructuredRoomCodeField, normalizeRoomCode as normalizeSourceRoomCode } from "../../../lib/zalo-import/parser";

export type Phase2RoomMarkerAnalysis = {
  markerText: string;
  roomCode: string;
  roomCodes: string[];
  explicitRoomForm: boolean;
  markerLineIndex: number;
};

function priceStartIndex(input: string) {
  const patterns = [
    /\b\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?\b/i,
    /\b\d+\s*(?:tr|triệu)\d{0,3}\b/i,
    /\b\d+(?:[.,]\d+)?\s*(?:tr|triệu)\b/i,
    /\b\d+(?:[.,]\d+)?\s*k\b/i,
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
  const raw = cleanText(input);
  const floor = raw.match(/^lầu\s*(\d{1,2})$/i);
  if (floor?.[1]) return `Lầu ${Number(floor[1])}`;
  if (/^trệt$/i.test(raw)) return "Trệt";

  const dottedP = raw.match(/^p\s*\.\s*([a-z]?\d{2,4}[a-z]?)$/i);
  if (dottedP?.[1]) return `P.${dottedP[1].toUpperCase()}`;

  const compactP = raw.match(/^p\s*([a-z]?\d{2,4}[a-z]?)$/i);
  if (compactP?.[1]) return `P${compactP[1].toUpperCase()}`;

  return raw.replace(/[.\s]+/g, "").toUpperCase();
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
    /^(?:phong|ma phong|ma)\s*[,.:;\-]*\s*(.*)$/i
  );
  if (!match?.[1]) return [];
  return extractRoomCodesFromLine(match[1]);
}

const ROOM_CODE_PATTERN =
  /(?:p\s*\.\s*[a-z]?\d{2,4}[a-z]?|p\s*[a-z]?\d{2,4}[a-z]?|[a-z]{1,2}\d{2,4}[a-z]?|\d{2,4}[a-z]?|lầu\s*\d{1,2}|trệt)/gi;

function extractRoomCodesFromLine(input: string) {
  const line = cleanText(input);
  const field = extractStructuredRoomCodeField(line);
  if (field !== null) {
    if (!field) return [];
    const known = Array.from(field.matchAll(ROOM_CODE_PATTERN));
    const residue = field.replace(ROOM_CODE_PATTERN, "").replace(/[\s+,/&_–—-]+/g, "");
    if (residue || !known.length) return [normalizeSourceRoomCode(field)];
  }
  const priceIndex = priceStartIndex(line);
  let beforePrice = priceIndex >= 0 ? line.slice(0, priceIndex) : line;
  let afterPrice = priceIndex >= 0 ? line.slice(priceIndex + (line.slice(priceIndex).match(ROOM_PRICE_PREFIX)?.[0].length || 0)) : "";

  // Do not interpret a date such as 1/11 as a numeric room code.
  beforePrice = beforePrice.replace(/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/, "");
  afterPrice = afterPrice.split(/\b(?:trống|còn\s*trống|đã\s*thuê|hết\s*phòng|available)\b/i)[0] || "";

  const labelled = line.match(/(?:mã\s*phòng|mã|phòng)\s*[:\-]?\s*([^\n]*)/i);
  if (labelled?.[1]) {
    const labelledEnd = labelled[1].split(/\b(?:trống|đã\s*thuê|hết\s*phòng|available)\b/i)[0] || "";
    const labelledCodes = Array.from(labelledEnd.matchAll(ROOM_CODE_PATTERN)).map((item) => item[0]);
    if (labelledCodes.length) return normalizeRoomCodeList(labelledCodes);
  }

  const postPriceWithoutAmounts = afterPrice.replace(
    new RegExp(ROOM_PRICE_PREFIX.source, "gi"),
    " "
  );
  const postCodes = Array.from(postPriceWithoutAmounts.matchAll(ROOM_CODE_PATTERN)).map((item) => item[0]);
  const preCodeMatches = Array.from(beforePrice.matchAll(ROOM_CODE_PATTERN));

  // Bare numeric room codes require a room-type or availability cue before
  // them; this avoids mistaking building/address numbers for room identifiers.
  const roomCuePattern = /\b(?:studio|[1-9]\s*pn|trống(?:\s*sẵn)?|còn\s*trống|đã\s*thuê|hết\s*phòng)\b/gi;
  const cueEnds = Array.from(beforePrice.matchAll(roomCuePattern)).map(
    (match) => (match.index || 0) + match[0].length
  );
  const numericCodesStart = cueEnds.length ? Math.max(...cueEnds) : Number.POSITIVE_INFINITY;
  const safePreCodes = preCodeMatches
    .filter((match) => /^(?:p\s*\.?|[a-z])/i.test(match[0]))
    .map((match) => match[0]);
  for (const match of preCodeMatches) {
    if (/^\d{2,4}[a-z]?$/i.test(match[0]) && (match.index || 0) >= numericCodesStart) {
      safePreCodes.push(match[0]);
    }
  }

  // A standalone numeric marker before price remains valid when it occupies
  // the entire prefix (for example, `202 - 9tr`).
  const barePrefix = beforePrice.trim().match(/^(\d{2,4}[a-z]?)\s*[-:.,]?\s*$/i);
  if (barePrefix?.[1]) safePreCodes.push(barePrefix[1]);

  const codes = [...safePreCodes, ...postCodes];
  return normalizeRoomCodeList(codes);
}

const ROOM_PRICE_PREFIX = /\b\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?\b|\b\d+\s*(?:tr|triệu)\d{0,3}\b|\b\d+(?:[.,]\d+)?\s*(?:tr|triệu|k)\b/i;

function normalizeRoomCodeList(rawCodes: string[]) {
  const codes = Array.from(new Set(rawCodes.map(normalizeRoomCode).filter(Boolean)));
  const floors = codes.filter((code) => /^(?:Lầu \d+|Trệt)$/i.test(code));
  const roomCodes = codes.filter((code) => !floors.includes(code));

  if (roomCodes.length === 1 && floors.length === 1) {
    return [`${roomCodes[0]} _ ${floors[0]}`];
  }

  return codes;
}

function extractCodesBeforePrice(line: string) {
  const cleanLine = cleanText(line);
  const explicitCodes = extractExplicitLabeledRoomCodes(cleanLine);
  if (explicitCodes.length > 0) return explicitCodes;
  return extractRoomCodesFromLine(cleanLine);
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

    return extractRoomCodesFromLine(rawValue);
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
      /\btrống(?:\s+sẵn)?\b/i.test(line) ||
      /\b(?:available|phong|ma phong|lau|tang|tret|lung|studio|duplex|[1-9]\s*pn)\b/.test(
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
