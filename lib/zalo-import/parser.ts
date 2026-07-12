export type ParsedZaloRoom = {
  roomPayload: Record<string, any>;
  detailPayload: Record<string, any>;
  confidenceScore: number;
  sourceFieldMap: Record<string, any>;
};

export function removeVietnameseTone(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeForCompare(input: string) {
  return removeVietnameseTone(input)
    .toLowerCase()
    .replace(/[,\n\r\t]+/g, " ")
    .replace(/[|;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDistrict(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const s = normalizeForCompare(raw);

  const qNum = s.match(/\b(?:q|quan)?\s*(\d{1,2})\b/);
  if (qNum?.[1]) return `Quận ${Number(qNum[1])}`;

  const map: Record<string, string> = {
    "binh thanh": "Bình Thạnh",
    "go vap": "Gò Vấp",
    "phu nhuan": "Phú Nhuận",
    "tan binh": "Tân Bình",
    "tan phu": "Tân Phú",
    "thu duc": "Thủ Đức",
    "binh tan": "Bình Tân",
  };

  return map[s] || raw;
}

export function normalizeWard(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const cleaned = raw
    .replace(
      /\b(?:phường|phuong|p(?:\.|(?=\s|\d)))\s*[:\-]?\s*/gi,
      ""
    )
    .replace(/[,:;|/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^\d{1,2}$/.test(cleaned)) {
    return String(Number(cleaned));
  }

  return cleaned;
}

export function normalizeRoomCode(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const withoutLabel = raw
    .replace(
      /\b(?:mã\s*phòng|ma\s*phong|phòng\s*mã|phong\s*ma|phòng|phong|room|mã|ma)\b/gi,
      " "
    )
    .replace(/^[\s:|/\-–—]+|[\s:|/\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalized = normalizeForCompare(withoutLabel)
    .replace(/[._/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /^(?:tret|tang tret|ground|ground floor)$/.test(
      normalized
    )
  ) {
    return "Trệt";
  }

  if (
    /^(?:lung|tang lung|mezzanine)$/.test(
      normalized
    )
  ) {
    return "Lửng";
  }

  if (
    /^(?:san thuong|tang thuong|rooftop)$/.test(
      normalized
    )
  ) {
    return "Sân thượng";
  }

  if (/^(?:penthouse|penhouse)$/.test(normalized)) {
    return "Penthouse";
  }

  const floorMatch = normalized.match(
    /^(?:lau|tang|floor)\s*(\d{1,2})$/
  );

  if (floorMatch?.[1]) {
    return `L${Number(floorMatch[1])}`;
  }

  return removeVietnameseTone(withoutLabel)
    .replace(/[\s:._/\-–—]+/g, "")
    .toUpperCase();
}

/**
 * Đọc dạng tiền triệu viết liền:
 *
 * 3tr5   → 3.500.000
 * 3tr50  → 3.500.000
 * 3tr500 → 3.500.000
 * 3tr05  → 3.050.000
 * 3tr050 → 3.050.000
 *
 * Chỉ nhận phần sau "tr" khi viết liền.
 * Vì vậy:
 *
 * 8tr 48m2
 * → chỉ là 8.000.000, không bị hiểu thành 8.480.000.
 */
function parseCompactMillionToVnd(
  input: string
): number | null {
  const normalized =
    removeVietnameseTone(
      String(input || "")
    )
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  if (!normalized) {
    return null;
  }

  /*
   * Có thể có khoảng trắng trước "tr":
   * 3 tr500
   *
   * Nhưng không cho khoảng trắng giữa "tr" và 500,
   * tránh nhận nhầm "8tr 48m2".
   */
  const match =
    normalized.match(
      /\b(\d+)\s*(?:tr|trieu)(\d{1,3})(?:k)?\b/i
    );

  if (
    !match?.[1] ||
    !match?.[2]
  ) {
    return null;
  }

  const wholeMillions =
    Number(match[1]);

  const fractionDigits =
    match[2];

  /*
   * "5"   → 0.5
   * "50"  → 0.50
   * "500" → 0.500
   * "05"  → 0.05
   */
  const fractionMillions =
    Number(
      `0.${fractionDigits}`
    );

  if (
    !Number.isFinite(
      wholeMillions
    ) ||
    !Number.isFinite(
      fractionMillions
    )
  ) {
    return null;
  }

  return Math.round(
    (
      wholeMillions +
      fractionMillions
    ) *
      1_000_000
  );
}

export function normalizeMoneyToVnd(
  input?: string | null
) {
  const raw =
    String(input || "").trim();

  if (!raw) {
    return null;
  }

  const normalized =
    removeVietnameseTone(raw)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  /*
   * ============================
   * 1. DẠNG 3tr5 / 3tr500
   * ============================
   *
   * Phải kiểm tra trước các dạng khác.
   */
  const compactMillion =
    parseCompactMillionToVnd(
      normalized
    );

  if (compactMillion != null) {
    return compactMillion;
  }

  /*
   * ============================
   * 2. DẠNG 3,5tr / 3.5tr / 8tr
   * ============================
   */
  const decimalMillionMatch =
    normalized.match(
      /\b(\d+(?:[.,]\d+)?)\s*(?:tr|trieu)\b/i
    );

  if (
    decimalMillionMatch?.[1]
  ) {
    const numeric =
      Number(
        decimalMillionMatch[1]
          .replace(",", ".")
      );

    if (
      Number.isFinite(numeric)
    ) {
      return Math.round(
        numeric * 1_000_000
      );
    }
  }

  /*
   * ============================
   * 3. DẠNG 50k / 500 nghìn
   * ============================
   */
  const thousandMatch =
    normalized.match(
      /\b(\d+(?:[.,]\d+)?)\s*(?:k|nghin|ngan)\b/i
    );

  if (thousandMatch?.[1]) {
    const numeric =
      Number(
        thousandMatch[1]
          .replace(",", ".")
      );

    if (
      Number.isFinite(numeric)
    ) {
      return Math.round(
        numeric * 1_000
      );
    }
  }

  /*
   * ============================
   * 4. DẠNG 3.500.000đ
   * ============================
   *
   * Hỗ trợ:
   * - 3.500.000
   * - 3,500,000
   * - 150.000đ
   */
  const groupedVndMatch =
    normalized.match(
      /\b(\d{1,3}(?:[.,]\d{3})+)\s*(?:d|dong)?\b/i
    );

  if (groupedVndMatch?.[1]) {
    const numeric =
      Number(
        groupedVndMatch[1]
          .replace(/[.,]/g, "")
      );

    if (
      Number.isFinite(numeric)
    ) {
      return Math.round(
        numeric
      );
    }
  }

  /*
   * ============================
   * 5. SỐ NGUYÊN THÔNG THƯỜNG
   * ============================
   */
  const plainNumberMatch =
    normalized.match(
      /\b\d+\b/
    );

  if (!plainNumberMatch?.[0]) {
    return null;
  }

  const numeric =
    Number(
      plainNumberMatch[0]
    );

  if (!Number.isFinite(numeric)) {
    return null;
  }

  /*
   * Giữ hành vi cũ:
   * "Giá 8" → 8.000.000.
   */
  if (numeric < 1000) {
    return Math.round(
      numeric * 1_000_000
    );
  }

  return Math.round(numeric);
}

function titleCaseStreet(input: string) {
  const keepUpper = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (keepUpper.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}


type ExtractedAddressParts = {
  houseNumber: string;
  address: string;
  ward: string;
  district: string;
};

function normalizeRoomTypeFromText(
  input: string
) {
  const normalized =
    normalizeForCompare(input);

  if (!normalized) return "";

  if (/\bduplex\b/.test(normalized)) {
    return "Duplex";
  }

  if (/\bloft\b/.test(normalized)) {
    return "Loft";
  }

  if (/\b(?:penthouse|penhouse)\b/.test(normalized)) {
    return "Penthouse";
  }

  if (/\bstudio\b/.test(normalized)) {
    return "Studio";
  }

  const bedroomMatch =
    normalized.match(
      /\b([1-9])\s*(?:pn|phong ngu|bedroom|br)\b/
    );

  if (bedroomMatch?.[1]) {
    return `${Number(bedroomMatch[1])}PN`;
  }

  return "";
}

function extractRoomCodeFromMarker(
  markerText: string
) {
  const text = String(markerText || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!text) return "";

  const codeToken =
  "(?:" +
  "trệt|tret|" +
  "lửng|lung|" +
  "sân\\s*thượng|san\\s*thuong|" +
  "tầng\\s*thượng|tang\\s*thuong|" +
  "penthouse|penhouse|" +
  "lầu\\s*\\d{1,2}|lau\\s*\\d{1,2}|" +
  "tầng\\s*\\d{1,2}|tang\\s*\\d{1,2}|" +
  "[A-Z]{1,3}\\.?\\d{1,4}[A-Z]?|" +
  "\\d{2,4}[A-Z]?" +
  ")";

  const explicitPatterns = [
    new RegExp(
      `\\b(?:mã\\s*phòng|ma\\s*phong|phòng\\s*mã|phong\\s*ma|mã|ma|phòng|phong|room)\\s*[:\\-]?\\s*(${codeToken})\\b`,
      "i"
    ),

    new RegExp(
      `\\b(?:trống|trong|còn\\s*trống|con\\s*trong)\\s*(?:(?:phòng|phong)\\s*)?(?:(?:mã|ma)\\s*)?[:\\-]?\\s*(${codeToken})\\b`,
      "i"
    ),

    new RegExp(
      `^\\s*(${codeToken})\\s*(?=(?:[-–—:|]\\s*)?(?:giá|gia|\\d+(?:[.,]\\d+)?\\s*(?:tr|triệu|trieu|k)))`,
      "i"
    ),
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeRoomCode(match[1]);
    }
  }

  return "";
}

function extractWardFromBuildingText(
  input: string
) {
  const text = String(input || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!text) return "";

  /*
   * Phường số: P14, P.14, Phường 14.
   * Chỉ nhận tối đa 2 chữ số để không nhầm P303/P202 là phường.
   */
  const numericMatch = text.match(
    /(?:^|[\s,;|/()])(?:phường|phuong|p(?:\.|(?=\s|\d)))\s*[:\-]?\s*(\d{1,2})(?!\d)(?=\s*(?:[,;|/)\n]|\s+-\s+|q\.?\s*\d{1,2}\b|quận\b|quan\b|$))/i
  );

  if (numericMatch?.[1]) {
    return normalizeWard(numericMatch[1]);
  }

  /*
   * Phường tên: P An Đông, Phường Chợ Lớn...
   * Dừng trước quận hoặc dấu phân cách.
   */
  const namedMatch = text.match(
    /(?:^|[\s,;|/()])(?:phường|phuong|p(?:\.|(?=\s|\d)))\s*[:\-]?\s*([A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+){0,4}?)(?=\s*(?:[,;|/)\n]|\s+-\s+|q\.?\s*\d{1,2}\b|quận\b|quan\b|$))/i
  );

  if (namedMatch?.[1]) {
    return normalizeWard(namedMatch[1]);
  }

  return "";
}

function extractAddressParts(
  input: string
): ExtractedAddressParts {
  const rawText = String(input || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  const result: ExtractedAddressParts = {
    houseNumber: "",
    address: "",
    ward: "",
    district: "",
  };

  if (!rawText) return result;

  const districtMatch = rawText.match(
    /\b(?:q\.?|quận|quan)\s*[:\-]?\s*(\d{1,2}|bình thạnh|binh thanh|gò vấp|go vap|phú nhuận|phu nhuan|tân bình|tan binh|tân phú|tan phu|thủ đức|thu duc|bình tân|binh tan)\b/i
  );

  if (districtMatch?.[1]) {
    result.district =
      normalizeDistrict(districtMatch[1]);
  }

  result.ward =
    extractWardFromBuildingText(
      rawText
    );

  const lines = rawText
    .split("\n")
    .map((line) => cleanListPrefix(line))
    .filter(Boolean);

  let addressCandidate = "";

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const normalized = normalizeForCompare(line);

    if (
      /^(?:dia chi(?: du an)?|vi tri|dc)\b/.test(
        normalized
      )
    ) {
      const afterLabel = line
        .replace(
          /^(?:địa\s*chỉ(?:\s*dự\s*án)?|dia\s*chi(?:\s*du\s*an)?|vị\s*trí|vi\s*tri|đc|dc)\s*[:\-]?\s*/i,
          ""
        )
        .trim();

      if (
        /^\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*\s+\S+/.test(
          afterLabel
        )
      ) {
        addressCandidate = afterLabel;
        break;
      }

      for (
        let nextIndex = index + 1;
        nextIndex < Math.min(lines.length, index + 4);
        nextIndex++
      ) {
        if (
          /^\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*\s+\S+/.test(
            lines[nextIndex]
          )
        ) {
          addressCandidate = lines[nextIndex];
          break;
        }
      }

      if (addressCandidate) break;
    }
  }

  if (!addressCandidate) {
    addressCandidate =
      lines.find((line) =>
        /^\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*\s+[A-Za-zÀ-ỹ]/.test(
          line
        )
      ) || "";
  }

  if (!addressCandidate) {
    return result;
  }

  const segments = addressCandidate
    .replace(
      /\b(?:q\.?|quận|quan)\s*[:\-]?\s*(?:\d{1,2}|bình thạnh|binh thanh|gò vấp|go vap|phú nhuận|phu nhuan|tân bình|tan binh|tân phú|tan phu|thủ đức|thu duc|bình tân|binh tan)\b.*$/i,
      ""
    )
    .split(/\s*(?:,|;|\||\s+-\s+)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const streetSegment = segments[0] || "";

  if (!result.ward && segments.length > 1) {
    const possibleWard = segments[1].trim();

    const explicitWard = possibleWard.match(
      /^(?:phường|phuong|p(?:\.|(?=\s|\d)))\s*[:\-]?\s*(\d{1,2}|[A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+){0,4})$/i
    );

    if (explicitWard?.[1]) {
      result.ward =
        normalizeWard(explicitWard[1]);
    } else if (/^\d{1,2}$/.test(possibleWard)) {
      result.ward =
        normalizeWard(possibleWard);
    }
  }

  const streetMatch = streetSegment.match(
    /^(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)*)(?:\s+)(.+)$/i
  );

  if (!streetMatch?.[1] || !streetMatch?.[2]) {
    return result;
  }

  const street = streetMatch[2]
    .replace(
      /\b(?:phường|phuong|p(?:\.|(?=\s|\d)))\s*[:\-]?\s*(?:\d{1,2}|[A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+){0,4})$/i,
      ""
    )
    .replace(
      /\b(?:phòng|phong|room|giá|gia|trống|trong|còn|con)\b.*$/i,
      ""
    )
    .replace(/[,:;|\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (street.length >= 2) {
    result.houseNumber = streetMatch[1].trim();
    result.address = titleCaseStreet(street);
  }

  return result;
}

function isRoomTypeOnlyText(
  normalized: string
) {
  return /^(?:loai phong\s*[:\-]?\s*)?(?:studio|duplex|loft|penthouse|penhouse|[1-9]\s*(?:pn|phong ngu|bedroom|br))$/.test(
    normalized
  );
}

function getCleanZaloLines(
  rawText: string
) {
  return String(rawText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line.trim()
    )
    .filter(Boolean);
}

function cleanListPrefix(
  input: string
) {
  return String(input || "")
    .replace(
      /^[\s+\-–—•*📌📍📢🚩]+/,
      ""
    )
    .trim();
}

function uniqueTextLines(
  values: string[]
) {
  const output: string[] = [];
  const existed =
    new Set<string>();

  for (const value of values) {
    const cleaned =
      cleanListPrefix(value);

    if (!cleaned) {
      continue;
    }

    const key =
      normalizeForCompare(
        cleaned
      );

    if (
      !key ||
      existed.has(key)
    ) {
      continue;
    }

    existed.add(key);
    output.push(cleaned);
  }

  return output;
}

function looksLikeRoomMarkerText(
  input: string
) {
  const normalized =
    normalizeForCompare(
      input
    );

  if (!normalized) {
    return false;
  }

  const hasRoomSignal =
    /\b(ma|ma phong|phong|room|trong|trong san)\b/.test(
      normalized
    );

  const hasRoomTypeSignal =
    /\b(studio|duplex|loft|penthouse|penhouse|[1-9]\s*(?:pn|phong ngu|bedroom|br))\b/.test(
      normalized
    );

  /*
   * Hỗ trợ marker không có chữ "phòng":
   *
   * 203 giá 8tr
   * G001 giá 8tr
   * Trệt giá 9tr
   * Lầu 1 giá 8tr
   */
  const startsWithRoomCode =
    /^(?:(?:trong|con trong)\s+)?(?:ma\s+)?(?:tret|lung|san\s+thuong|tang\s+thuong|penthouse|penhouse|lau\s*\d{1,2}|tang\s*\d{1,2}|[a-z]{1,3}\.?\d{1,4}[a-z]?|\d{2,4}[a-z]?)\b/.test(
      normalized
    );

  const hasPrice =
    /\b(?:gia|gia thue)\s*[:\-]?\s*\d/.test(
      normalized
    ) ||
    /\b\d+\s*(?:tr|trieu)\d{0,3}\b/.test(
      normalized
    ) ||
    /\b\d+(?:[.,]\d+)?\s*(?:k|nghin|ngan)\b/.test(
      normalized
    ) ||
    /\b\d{1,3}(?:[.,]\d{3})+\s*(?:d|dong)?\b/.test(
      normalized
    );

  return (
    (
      hasRoomSignal ||
      startsWithRoomCode ||
      hasRoomTypeSignal
    ) &&
    hasPrice
  );
}

function splitBuildingAndRoomText(
  rawText: string
) {
  const fullText =
    String(rawText || "")
      .replace(/\r\n?/g, "\n")
      .trim();

  if (!fullText) {
    return {
      fullText: "",
      houseInfoText: "",
      markerText: "",
    };
  }

  /*
   * Reader đang nối:
   *
   * houseInfoText
   *
   * markerText
   */
  const paragraphs =
    fullText
      .split(/\n{2,}/)
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  for (
    let index =
      paragraphs.length - 1;
    index >= 0;
    index--
  ) {
    if (
      !looksLikeRoomMarkerText(
        paragraphs[index]
      )
    ) {
      continue;
    }

    return {
      fullText,

      houseInfoText:
        paragraphs
          .slice(0, index)
          .join("\n\n")
          .trim(),

      markerText:
        paragraphs
          .slice(index)
          .join("\n\n")
          .trim(),
    };
  }

  /*
   * Fallback khi không có dòng trống
   * giữa form tòa nhà và marker phòng.
   */
  const lines =
    fullText
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  for (
    let index =
      lines.length - 1;
    index >= 0;
    index--
  ) {
    if (
      !looksLikeRoomMarkerText(
        lines[index]
      )
    ) {
      continue;
    }

    return {
      fullText,

      houseInfoText:
        lines
          .slice(0, index)
          .join("\n")
          .trim(),

      markerText:
        lines
          .slice(index)
          .join("\n")
          .trim(),
    };
  }

  /*
   * Không tách được thì giữ tương thích
   * với dữ liệu cũ.
   */
  return {
    fullText,
    houseInfoText: fullText,
    markerText: fullText,
  };
}

/**
 * Chuyển một token tiền cụ thể sang VND.
 *
 * Ví dụ:
 * - 50k       → 50.000
 * - 50.000đ   → 50.000
 * - 1,5tr     → 1.500.000
 * - 2 triệu   → 2.000.000
 */
function parseFeeMoneyToken(
  input: string
): number | null {
  /*
   * Dùng chung logic tiền với giá phòng.
   *
   * Hỗ trợ:
   * - 50k
   * - 50.000đ
   * - 1,5tr
   * - 3tr5
   * - 3tr500
   */
  return normalizeMoneyToVnd(
    input
  );
}

function extractFeeAmounts(
  input: string
) {
  const normalized =
    removeVietnameseTone(
      String(input || "")
    )
      .toLowerCase()
      .replace(/\s+/g, " ");

  /*
   * Thứ tự:
   *
   * 1. 3tr5 / 3tr500
   * 2. 3,5tr / 8tr
   * 3. 500k
   * 4. 3.500.000đ
   *
   * Không cho khoảng trắng sau "tr" trong dạng compact,
   * để "8tr 48m2" chỉ lấy 8tr.
   */
  const matches =
    normalized.match(
      /(?:\d+\s*(?:tr|trieu)\d{1,3}(?:k)?\b)|(?:\d+(?:[.,]\d+)?\s*(?:tr|trieu)\b)|(?:\d+(?:[.,]\d+)?\s*(?:k|nghin|ngan)\b)|(?:\d{1,3}(?:[.,]\d{3})+\s*(?:d|dong)?\b)/gi
    ) || [];

  const values:
    number[] = [];

  for (const match of matches) {
    const value =
      parseFeeMoneyToken(
        match
      );

    if (
      value != null &&
      value > 0
    ) {
      values.push(value);
    }
  }

  return values;
}

function pickServiceFeeFromZaloText(
  rawText: string
): number | null {
  const lines =
    getCleanZaloLines(
      rawText
    );

  const moneyToken =
    "(?:" +
    "\\d+\\s*(?:tr|trieu)\\d{1,3}(?:k)?\\b|" +
    "\\d+(?:[.,]\\d+)?\\s*(?:tr|trieu|k|nghin|ngan)\\b|" +
    "\\d{1,3}(?:[.,]\\d{3})+\\s*(?:d|dong)?\\b" +
    ")";

  const pattern = new RegExp(
    `(?:^|[\\s,;|])(?:ph[ií]\\s*)?(?:dich\\s*vu|dv|quan\\s*ly|ql|service(?:\\s*fee)?)\\s*(?:/\\s*(?:phong|thang|nguoi))?\\s*[:\\-]?\\s*(${moneyToken})`,
    "i"
  );

  for (const line of lines) {
    const normalized =
      removeVietnameseTone(line)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const match = normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const value =
      parseFeeMoneyToken(
        match[1]
      );

    if (value != null && value >= 0) {
      return value;
    }
  }

  return null;
}

type ParsedOtherFees = {
  totalValue: number | null;
  note: string;
};

/**
 * Các phí không có field riêng:
 * - Phí wifi
 * - Phí internet/mạng
 * - Phí giặt
 * - Phí rác
 * - Phí vệ sinh
 *
 * Không lấy:
 * - Điện
 * - Nước
 * - Dịch vụ
 * - Gửi xe
 */
function pickOtherFeesFromZaloText(
  rawText: string
): ParsedOtherFees {
  const lines =
    getCleanZaloLines(
      rawText
    );

  const pickedLines:
    string[] = [];

  let totalValue = 0;
  let hasAmount = false;

  for (const line of lines) {
    const normalized =
      normalizeForCompare(
        line
      );

    const hasOtherFeeSignal =
      /\bphi\s*(wifi|internet|mang|giat|rac|ve sinh)\b/.test(
        normalized
      ) ||
      /^(wifi|internet|mang|rac|ve sinh|giat)\s*[:\-]/.test(
        normalized
      );

    if (!hasOtherFeeSignal) {
      continue;
    }

    /*
     * Bảo vệ thêm, không lấy nhầm các field đã có riêng.
     */
    if (
      /\b(phi\s*(?:dich vu|dv|quan ly|ql)|dich vu|dv|quan ly|ql|service|dien|nuoc|giu xe|gui xe|parking)\b/.test(
        normalized
      )
    ) {
      continue;
    }

    const amounts =
      extractFeeAmounts(
        line
      );

    /*
     * Chỉ lấy dòng có số tiền.
     */
    if (
      amounts.length === 0
    ) {
      continue;
    }

    pickedLines.push(line);

    totalValue +=
      amounts.reduce(
        (
          total,
          value
        ) =>
          total + value,
        0
      );

    hasAmount = true;
  }

  return {
    totalValue:
      hasAmount
        ? totalValue
        : null,

    note:
      uniqueTextLines(
        pickedLines
      ).join("\n"),
  };
}

/**
 * Lấy tiện ích chưa có field boolean riêng.
 *
 * Ví dụ:
 * - Camera an ninh 24/24
 * - Giờ giấc tự do
 * - Bảo vệ
 * - Nội thất: máy lạnh, tủ lạnh...
 * - PCCC
 * - Lễ tân
 */
function pickOtherAmenitiesFromZaloText(
  rawText: string
) {
  const lines =
    getCleanZaloLines(
      rawText
    );

  const picked:
    string[] = [];

  for (const line of lines) {
    const normalizedLine =
      normalizeForCompare(
        line
      );

    /*
     * Nội thất phải giữ nguyên cả dòng.
     *
     * Ví dụ:
     * Nội thất: máy lạnh, tủ lạnh, tủ quần áo, nệm
     */
    if (
      /\bnoi that\b/.test(
        normalizedLine
      )
    ) {
      picked.push(line);
      continue;
    }

    /*
     * Một dòng có thể chứa:
     *
     * Tòa nhà thang bộ,
     * camera an ninh 24/24,
     * giờ giấc tự do
     *
     * Chỉ lấy các phần thuộc tiện ích khác.
     */
    const parts =
      line
        .split(/[,;|]+/)
        .map((part) =>
          cleanListPrefix(
            part
          )
        )
        .filter(Boolean);

    for (const part of parts) {
      const normalizedPart =
        normalizeForCompare(
          part
        );

      const isOtherAmenity =
        /\bcamera\b/.test(
          normalizedPart
        ) ||
        /\ban ninh\b/.test(
          normalizedPart
        ) ||
        /\bgio giac tu do\b/.test(
          normalizedPart
        ) ||
        /\btu do gio giac\b/.test(
          normalizedPart
        ) ||
        /\bra vao tu do\b/.test(
          normalizedPart
        ) ||
        /\bbao ve\b/.test(
          normalizedPart
        ) ||
        /\bpccc\b/.test(
          normalizedPart
        ) ||
        /\bphong chay\b/.test(
          normalizedPart
        ) ||
        /\ble tan\b/.test(
          normalizedPart
        ) ||
        /\bkhoa cong\b/.test(
          normalizedPart
        );

      if (!isOtherAmenity) {
        continue;
      }

      /*
       * Những tiện ích đã có field riêng không đưa
       * vào other_amenities nếu đứng riêng.
       */
      const onlyStructuredAmenity =
        /^(co\s+)?(thang may|thang bo|may giat chung|may giat rieng|ham xe|gui xe)$/.test(
          normalizedPart
        );

      if (
        onlyStructuredAmenity
      ) {
        continue;
      }

      picked.push(part);
    }
  }

  return uniqueTextLines(
    picked
  ).join("\n");
}

function pickDescriptionFromRoomMarker(
  markerText: string
): string {
  const lines =
    getCleanZaloLines(
      markerText
    );

  const picked:
    string[] = [];

  for (const originalLine of lines) {
    const normalized =
      normalizeForCompare(
        originalLine
      );

    if (!normalized) {
      continue;
    }

    /*
     * Không đưa phân loại phòng, giá hoặc hoa hồng
     * vào phần mô tả.
     */
    if (
      isRoomTypeOnlyText(normalized) ||
      /^(?:gia|gia thue)\b/.test(normalized) ||
      /^(?:hoa hong|hh|commission)\b/.test(normalized) ||
      /\b(?:hoa hong|commission)\b/.test(normalized) ||
      /^(?:(?:khong co|ko co|co|khong|ko)\s+)?(?:may giat|mg|giat chung|giat rieng|may say|say chung|say rieng|thang may|thang bo|khoa van tay|gui xe|giu xe|ham xe)\b/.test(
        normalized
      )
    ) {
      continue;
    }

    /*
     * Bỏ những dòng chỉ chứa field riêng.
     */
    if (
      /^(ma|ma phong|phong|room)\s*[:\-]/.test(
        normalized
      )
    ) {
      continue;
    }

    if (
      /^(gia|gia thue)\s*[:\-]/.test(
        normalized
      )
    ) {
      continue;
    }

    if (
      /^(trong|trong san|phong trong|phong trong san)$/.test(
        normalized
      )
    ) {
      continue;
    }

    if (
      /^(lien he|zalo|phone|sdt|dan khach)/.test(
        normalized
      )
    ) {
      continue;
    }

    /*
     * Ngắn hạn đã có field riêng.
     */
    if (
      /\b(nhan|co nhan|cho thue|ho tro)\s*(khach\s*)?ngan han\b/.test(
        normalized
      ) ||
      /\bngan han\s*[:\-]?\s*(co|nhan|ok|duoc)\b/.test(
        normalized
      )
    ) {
      continue;
    }

    let cleaned =
      originalLine
        /*
         * Bỏ trạng thái.
         */
        .replace(
          /\b(?:trống sẵn|trống|available)\b/gi,
          " "
        )

        /*
         * Bỏ mã phòng có nhãn:
         * mã P601, phòng G01, mã Trệt, mã Lầu 1...
         */
        .replace(
          /\b(?:mã\s*phòng|ma\s*phong|phòng\s*mã|phong\s*ma|mã|ma|phòng|phong|room)\s*[:\-]?\s*(?:(?:trệt|tret|lửng|lung|sân\s*thượng|san\s*thuong|tầng\s*thượng|tang\s*thuong|penthouse|penhouse)\b|(?:lầu|lau|tầng|tang)\s*\d{1,2}\b|[A-Z]{1,3}\.?\d{1,4}[A-Z]?\b|\d{2,4}[A-Z]?\b)/gi,
          " "
        )

        /*
         * Bỏ mã đứng đầu marker nhưng không có chữ "mã":
         * G01 giá 7tr, Lầu 1 giá 8tr, 202 giá 6tr...
         */
        .replace(
            /^\s*(?:(?:trệt|tret|lửng|lung|sân\s*thượng|san\s*thuong|tầng\s*thượng|tang\s*thuong|penthouse|penhouse)\b|(?:lầu|lau|tầng|tang)\s*\d{1,2}\b|[A-Z]{1,3}\.?\d{1,4}[A-Z]?\b|\d{2,4}[A-Z]?\b)\s*(?=(?:[-–—:|]\s*)?(?:giá|gia|\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|k)))/i,
            " "
          )

        /*
         * Bỏ giá có chữ "giá".
         */
        .replace(
          /\b(?:giá thuê|gia thue|giá|gia)\s*[:\-]?\s*(?:\d+\s*(?:tr|triệu|trieu)\d{1,3}|\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|k|nghìn|ngan|ngàn)|\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?)/gi,
          " "
        )

        /*
         * Bỏ giá không có chữ "giá":
         * Trống mã 101 - 8tr 48m2...
         */
        .replace(
          /(?:^|\s)[\-–—|:]?\s*(?:\d+\s*(?:tr|triệu|trieu)\d{1,3}|\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|k|nghìn|ngan|ngàn)|\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?)(?=\s|$)/gi,
          " "
        )

        /*
         * Bỏ phân loại phòng khỏi mô tả.
         * Nếu cùng dòng còn nội dung thật như "có ban công"
         * thì phần nội dung đó vẫn được giữ lại.
         */
        .replace(
          /\b(?:studio|duplex|loft|penthouse|penhouse|[1-9]\s*(?:pn|phòng\s*ngủ|phong\s*ngu|bedroom|br))\b/gi,
          " "
        )

        /*
         * Hoa hồng có field chính sách riêng, không đưa vào mô tả.
         */
        .replace(
          /\b(?:hoa\s*hồng|hoa\s*hong|commission|hh)\b.*$/gi,
          " "
        )

        .replace(
          /^[\s:|/\-–—]+/,
          ""
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (!cleaned) {
      continue;
    }

    const cleanedNormalized =
      normalizeForCompare(
        cleaned
      );

    if (
      /^(trong|trong san)$/.test(
        cleanedNormalized
      ) ||
      isRoomTypeOnlyText(cleanedNormalized) ||
      /^(?:gia|gia thue|hoa hong|hh|commission)\b/.test(
        cleanedNormalized
      )
    ) {
      continue;
    }

    picked.push(cleaned);
  }

  return uniqueTextLines(
    picked
  ).join("\n");
}

function isPolicySignal(
  normalized: string
) {
  return (
    /\bcoc\b/.test(
      normalized
    ) ||
    /\bhuy coc\b/.test(
      normalized
    ) ||
    /\bhoan coc\b/.test(
      normalized
    ) ||
    /\bbo sung coc\b/.test(
      normalized
    ) ||
    /\bhoa hong\b/.test(
      normalized
    ) ||
    /\bthanh toan\b/.test(
      normalized
    )
  );
}

function isPolicyContinuation(
  line: string,
  normalized: string
) {
  return (
    /^[+\-–—•*]/.test(
      line.trim()
    ) ||
    /%/.test(line) ||
    /\bhop dong\b/.test(
      normalized
    ) ||
    /\bhd\s*\d/.test(
      normalized
    ) ||
    /\btien nha\b/.test(
      normalized
    ) ||
    /\bthang dau\b/.test(
      normalized
    ) ||
    /\bchuyen khoan\b/.test(
      normalized
    ) ||
    /\bgiao dich thanh cong\b/.test(
      normalized
    ) ||
    /\b50\s*\/\s*50\b/.test(
      normalized
    )
  );
}

function isNonPolicySectionStart(
  normalized: string
) {
  const cleaned =
    normalized
      .replace(
        /^[+\-–—•*\s]+/,
        ""
      )
      .trim();

  return (
    /^(dia chi|so nha|toa nha|quy mo|ket cau)/.test(
      cleaned
    ) ||
    /^(dien|nuoc|dich vu|dv|quan ly|ql|phi dich vu|phi dv|phi quan ly|phi ql|service)/.test(
      cleaned
    ) ||
    /^(xe|giu xe|gui xe|ham xe)/.test(
      cleaned
    ) ||
    /^(thu cung|pet|noi that)/.test(
      cleaned
    ) ||
    /^(camera|gio giac|bao ve|pccc)/.test(
      cleaned
    ) ||
    /^(lien he|dan khach|zalo|phone)/.test(
      cleaned
    ) ||
    /^(phong|ma phong|trong|gia phong)/.test(
      cleaned
    )
  );
}

/**
 * Lấy các section liên quan:
 * - Cọc
 * - Hoa hồng
 * - Thanh toán
 *
 * Có thể lấy nhiều section không nằm liền nhau.
 */
function pickPolicyFromZaloText(
  rawText: string
): string {
  const lines =
    getCleanZaloLines(
      rawText
    );

  const picked:
    string[] = [];

  let capturing = false;

  for (const line of lines) {
    const normalized =
      normalizeForCompare(
        line
      );

    const directSignal =
      isPolicySignal(
        normalized
      );

    /*
     * Gặp Cọc / Hoa hồng / Thanh toán:
     * bắt đầu hoặc tiếp tục section chính sách.
     */
    if (directSignal) {
      capturing = true;
      picked.push(line);
      continue;
    }

    if (!capturing) {
      continue;
    }

    /*
     * Gặp section dữ liệu khác:
     * kết thúc section chính sách hiện tại.
     *
     * Nếu phía sau lại gặp "Hoa hồng", "Cọc"...
     * directSignal sẽ bật lại capturing.
     */
    if (
      isNonPolicySectionStart(
        normalized
      )
    ) {
      capturing = false;
      continue;
    }

    /*
     * Lấy các dòng con như:
     * + Hợp đồng 6 tháng: 50%
     * + Hợp đồng 12 tháng: 80%
     * - Giao dịch thành công khi...
     */
    if (
      isPolicyContinuation(
        line,
        normalized
      )
    ) {
      picked.push(line);
      continue;
    }

    capturing = false;
  }

  return uniqueTextLines(
    picked
  ).join("\n");
}

function defaultRoomPayload(
  markerText: string,
  houseInfoText: string
): Record<string, any> {
  return {
    room_code: "",
    room_type: "",
    house_number: "",
    address: "",
    ward: "",
    district: "",
    price: null,
    status: "Trống",

    /*
     * Chỉ lấy mô tả từ dữ liệu riêng của phòng.
     */
    description:
      pickDescriptionFromRoomMarker(
        markerText
      ),

    link_zalo: "",
    zalo_phone: "",

    /*
     * Chỉ lấy chính sách từ form tòa nhà.
     */
    chinh_sach:
      pickPolicyFromZaloText(
        houseInfoText
      ),
  };
}

function defaultDetailPayload(): Record<string, any> {
  return {
    electric_fee_value: null,
    electric_fee_unit: "kWh",

    water_fee_value: null,
    water_fee_unit: "người/tháng",

    service_fee_value: null,
    service_fee_unit: "phòng/tháng",

    parking_fee_value: null,
    parking_fee_unit: "chiếc",

    other_fee_value: null,
    other_fee_note: "",

    has_elevator: false,
    has_stairs: false,
    /*
     * Mặc định mọi phòng có máy giặt chung.
     * Phần nhận diện phía dưới sẽ tắt mặc định này
     * khi tin Zalo nói rõ máy giặt riêng hoặc không có máy giặt.
     */
    shared_washer: true,
    private_washer: false,
    shared_dryer: false,
    private_dryer: false,
    has_parking: true,
    has_basement: false,
    fingerprint_lock: false,

    allow_pet: false,
    allow_cat: false,
    allow_dog: false,
    no_pet: false,

    short_term: false,
    long_term: true,

    other_amenities: "",
    detail_json: null,
  };
}

export function parseZaloRoomText(
  rawText: string
): ParsedZaloRoom {
  const {
    fullText,
    houseInfoText,
    markerText,
  } =
    splitBuildingAndRoomText(
      rawText
    );

  const text =
    fullText;

  const textNoTone =
    normalizeForCompare(
      text
    );

  const houseTextNoTone =
    normalizeForCompare(
      houseInfoText
    );

  const markerTextNoTone =
    normalizeForCompare(
      markerText
    );

  const roomPayload =
    defaultRoomPayload(
      markerText,
      houseInfoText
    );

  const detailPayload =
    defaultDetailPayload();

  const sourceFieldMap:
    Record<string, any> = {};

  /*
 * ============================
 * CÁC PHÍ KHÁC
 * ============================
 */
const otherFees =
  pickOtherFeesFromZaloText(
    houseInfoText
  );

if (
  otherFees.totalValue != null
) {
  detailPayload.other_fee_value =
    otherFees.totalValue;

  sourceFieldMap.other_fee_value =
    "Tin Zalo";
}

if (otherFees.note) {
  detailPayload.other_fee_note =
    otherFees.note;

  sourceFieldMap.other_fee_note =
    "Tin Zalo";
}

/*
 * ============================
 * CÁC TIỆN ÍCH KHÁC
 * ============================
 */
const otherAmenities =
  pickOtherAmenitiesFromZaloText(
    houseInfoText
  );

if (otherAmenities) {
  detailPayload.other_amenities =
    otherAmenities;

  sourceFieldMap.other_amenities =
    "Tin Zalo";
}

  const detectedRoomType =
    normalizeRoomTypeFromText(
      markerText
    );

  if (detectedRoomType) {
    roomPayload.room_type =
      detectedRoomType;

    sourceFieldMap.room_type =
      "Tin Zalo";
  }

  const detectedRoomCode =
    extractRoomCodeFromMarker(
      markerText
    );

  if (detectedRoomCode) {
    roomPayload.room_code =
      detectedRoomCode;

    sourceFieldMap.room_code =
      "Tin Zalo";
  }

  /*
 * Mẫu số tiền hỗ trợ:
 *
 * 3tr5
 * 3tr500
 * 3,5tr
 * 3.5tr
 * 8tr
 * 8500k
 * 8.000.000đ
 *
 * Dạng 3tr500 phải đứng trước 3tr,
 * nếu không regex sẽ chỉ lấy "3tr".
 */
const explicitPriceMatch =
  markerText.match(
    /(?:giá|gia)\s*[:\-]?\s*((?:\d+\s*(?:tr|triệu|trieu)\d{1,3}(?:k)?\b)|(?:\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|k|nghìn|ngan|ngàn)\b)|(?:\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?))/i
  );

  /*
  * Full text hiện có dạng:
  *
  * thông tin tòa nhà
  * +
  * marker phòng
  *
  * Marker phòng nằm sau cùng, vì vậy khi không có chữ "giá",
  * lấy token tiền cuối cùng để tránh lấy nhầm tiền cọc ở form nhà.
  */
  const fallbackPriceMatches:
    RegExpMatchArray[] =
    Array.from(
      markerText.matchAll(
        /(?:\d+\s*(?:tr|triệu|trieu)\d{1,3}(?:k)?\b)|(?:\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu|k|nghìn|ngan|ngàn)\b)|(?:\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:đ|d|đồng|dong)?)/gi
      )
    );

  const lastFallbackMatch:
    RegExpMatchArray | undefined =
    fallbackPriceMatches[
      fallbackPriceMatches.length - 1
    ];

  const lastFallbackPrice =
    lastFallbackMatch?.[0] ?? "";

  const priceToken =
    String(
      explicitPriceMatch?.[1] ||
        lastFallbackPrice ||
        ""
    ).trim();

  if (priceToken) {
    roomPayload.price =
      normalizeMoneyToVnd(
        priceToken
      );

    if (
      roomPayload.price != null
    ) {
      sourceFieldMap.price =
        "Tin Zalo";
    }
  }

  /*
   * ============================
   * ĐỊA CHỈ TÒA NHÀ
   * ============================
   *
   * Chỉ đọc từ phần thông tin tòa nhà để tránh
   * lấy nhầm mã phòng hoặc giá làm số nhà.
   */
  const addressParts =
    extractAddressParts(
      houseInfoText || text
    );

  if (addressParts.houseNumber) {
    roomPayload.house_number =
      addressParts.houseNumber;

    sourceFieldMap.house_number =
      "Tin Zalo";
  }

  if (addressParts.address) {
    roomPayload.address =
      addressParts.address;

    sourceFieldMap.address =
      "Tin Zalo";
  }

  if (addressParts.ward) {
    roomPayload.ward =
      addressParts.ward;

    sourceFieldMap.ward =
      "Tin Zalo";
  }

  if (addressParts.district) {
    roomPayload.district =
      addressParts.district;

    sourceFieldMap.district =
      "Tin Zalo";
  }

  const phoneMatch = text.match(/(?:\+?84|0)(?:\d[\s.-]?){8,10}\d/);
  if (phoneMatch?.[0]) {
    roomPayload.zalo_phone = phoneMatch[0].replace(/[^\d+]/g, "");
    sourceFieldMap.zalo_phone = "Tin Zalo";
  }

  const electricMatch = text.match(/(?:điện|dien)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (electricMatch?.[0]) {
    detailPayload.electric_fee_value = normalizeMoneyToVnd(electricMatch[0]);
    sourceFieldMap.electric_fee_value = "Tin Zalo";
  }

  const waterMatch = text.match(/(?:nước|nuoc)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (waterMatch?.[0]) {
    detailPayload.water_fee_value = normalizeMoneyToVnd(waterMatch[0]);
    sourceFieldMap.water_fee_value = "Tin Zalo";
  }

  const serviceFee =
    pickServiceFeeFromZaloText(
      houseInfoText
    );

  if (serviceFee != null) {
    detailPayload.service_fee_value =
      serviceFee;

    sourceFieldMap.service_fee_value =
      "Tin Zalo";
  }

  const parkingMatch = text.match(/(?:xe|giữ xe|giu xe|parking)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (parkingMatch?.[0]) {
    detailPayload.parking_fee_value = normalizeMoneyToVnd(parkingMatch[0]);
    sourceFieldMap.parking_fee_value = "Tin Zalo";
  }

  if (/đã\s*thuê|da\s*thue|hết\s*phòng|het\s*phong/i.test(text)) {
    roomPayload.status = "Đã thuê";
    sourceFieldMap.status = "Tin Zalo";
  } else if (/trống|con trong|còn trống|available/i.test(textNoTone)) {
    roomPayload.status = "Trống";
    sourceFieldMap.status = "Tin Zalo";
  }

    if (/thang máy|thang may|có thang máy|co thang may/i.test(textNoTone)) {
    detailPayload.has_elevator = true;
    sourceFieldMap.has_elevator = "Tin Zalo";
  }

  if (/thang bộ|thang bo|cầu thang bộ|cau thang bo/i.test(textNoTone)) {
    detailPayload.has_stairs = true;
    sourceFieldMap.has_stairs = "Tin Zalo";
  }

  if (/vân tay|van tay|khóa vân tay|khoa van tay|fingerprint/i.test(textNoTone)) {
    detailPayload.fingerprint_lock = true;
    sourceFieldMap.fingerprint_lock = "Tin Zalo";
  }

  const parkingOutside =
  /\b(gui|giu|de)\s*xe\s*(ben\s*)?ngoai\b/.test(
    houseTextNoTone
  ) ||
  /\bxe\s*(gui|de)\s*(ben\s*)?ngoai\b/.test(
    houseTextNoTone
  ) ||
  /\bkhong\s*(co\s*)?(cho\s*)?(gui|giu|de)\s*xe\b/.test(
    houseTextNoTone
  );

if (parkingOutside) {
  detailPayload.has_parking =
    false;

  detailPayload.has_basement =
    false;

  sourceFieldMap.has_parking =
    "Tin Zalo";

  sourceFieldMap.has_basement =
    "Tin Zalo";
} else {
  /*
   * Các trường hợp còn lại mặc định gửi xe Có.
   */
  detailPayload.has_parking =
    true;

  const basementDenied =
    /\b(khong|ko)\s*(co\s*)?(ham xe|tang ham)\b/.test(
      houseTextNoTone
    );

  const basementAllowed =
    !basementDenied &&
    /\b(ham xe|ham de xe|tang ham)\b/.test(
      houseTextNoTone
    );

  detailPayload.has_basement =
    basementAllowed;

  if (
    basementDenied ||
    basementAllowed
  ) {
    sourceFieldMap.has_basement =
      "Tin Zalo";
  }
}

  const washerDenied =
    /\b(?:khong|ko)\s*(?:co\s*)?(?:may\s*)?giat\b/.test(
      textNoTone
    ) ||
    /\bkhong\s*co\s*may\s*giat\b/.test(
      textNoTone
    );

  const privateWasherMentioned =
    /\b(?:may giat rieng|mg rieng|giat rieng)\b/.test(
      textNoTone
    );

  const sharedWasherMentioned =
    /\b(?:may giat chung|mg chung|giat chung)\b/.test(
      textNoTone
    );

  if (washerDenied) {
    detailPayload.shared_washer = false;
    detailPayload.private_washer = false;

    sourceFieldMap.shared_washer =
      "Tin Zalo";

    sourceFieldMap.private_washer =
      "Tin Zalo";
  } else {
    if (privateWasherMentioned) {
      detailPayload.private_washer = true;

      /*
       * Tin chỉ nói máy giặt riêng thì tắt mặc định máy giặt chung.
       * Nếu tin nói rõ có cả hai, shared_washer sẽ được bật lại bên dưới.
       */
      if (!sharedWasherMentioned) {
        detailPayload.shared_washer = false;
      }

      sourceFieldMap.private_washer =
        "Tin Zalo";

      sourceFieldMap.shared_washer =
        "Tin Zalo";
    }

    if (sharedWasherMentioned) {
      detailPayload.shared_washer = true;

      sourceFieldMap.shared_washer =
        "Tin Zalo";
    }
  }

  if (/máy sấy riêng|may say rieng|sấy riêng|say rieng/i.test(textNoTone)) {
    detailPayload.private_dryer = true;
    sourceFieldMap.private_dryer = "Tin Zalo";
  }

  if (/máy sấy chung|may say chung|sấy chung|say chung/i.test(textNoTone)) {
    detailPayload.shared_dryer = true;
    sourceFieldMap.shared_dryer = "Tin Zalo";
  }

  const shortTermText =
  normalizeForCompare(
    [
      houseInfoText,
      markerText,
    ].join("\n")
  );

const shortTermDenied =
  /\b(khong|ko)\s*(nhan|cho thue|ho tro)?\s*(khach\s*)?ngan han\b/.test(
    shortTermText
  ) ||
  /\bngan han\s*[:\-]?\s*(khong|ko)\b/.test(
    shortTermText
  );

const shortTermAllowed =
  !shortTermDenied &&
  (
    /\b(nhan|co nhan|cho thue|ho tro)\s*(khach\s*)?ngan han\b/.test(
      shortTermText
    ) ||
    /\bngan han\s*[:\-]?\s*(nhan|co|ok|duoc)\b/.test(
      shortTermText
    )
  );

if (shortTermAllowed) {
  detailPayload.short_term =
    true;

  sourceFieldMap.short_term =
    "Tin Zalo";
}

if (shortTermDenied) {
  detailPayload.short_term =
    false;

  sourceFieldMap.short_term =
    "Tin Zalo";
}

  if (/dài hạn|dai han|hợp đồng dài|hop dong dai|hd dài|hd dai/i.test(textNoTone)) {
    detailPayload.long_term = true;
    sourceFieldMap.long_term = "Tin Zalo";
  }

  const petDenied =
  /\b(khong|ko|cam)\s*(cho\s*)?(nuoi\s*)?(pet|thu cung|meo|cho)\b/.test(
    houseTextNoTone
  ) ||
  /\b(no pet|khong pet)\b/.test(
    houseTextNoTone
  );

const petConditional =
  /\b(pet|thu cung)\b.*\b(hoi chu|tuy chu|xet duyet)\b/.test(
    houseTextNoTone
  );

const genericPetAllowed =
  !petDenied &&
  !petConditional &&
  (
    /\b(pet|thu cung)\s*[:\-]?\s*(cho|ok|duoc|nhan|co)\b/.test(
      houseTextNoTone
    ) ||
    /\bcho\s+nuoi\s+(?:\d+\s*)?(pet|thu cung)\b/.test(
      houseTextNoTone
    ) ||
    /\bduoc\s+nuoi\s+(?:\d+\s*)?(pet|thu cung)\b/.test(
      houseTextNoTone
    ) ||
    /\bnuoi\s+(?:\d+\s*)?(pet|thu cung)\b/.test(
      houseTextNoTone
    ) ||
    /\b(pet|thu cung)\b.*\b(nho|duoi\s*\d+\s*kg)\b/.test(
      houseTextNoTone
    )
  );

const catAllowed =
  !petDenied &&
  /\b(?:cho\s+nuoi|duoc\s+nuoi|nuoi)\s+meo\b/.test(
    houseTextNoTone
  );

const dogAllowed =
  !petDenied &&
  /\b(?:cho\s+nuoi|duoc\s+nuoi|nuoi)\s+cho\b/.test(
    houseTextNoTone
  );

if (petDenied) {
  detailPayload.allow_pet =
    false;

  detailPayload.allow_cat =
    false;

  detailPayload.allow_dog =
    false;

  detailPayload.no_pet =
    true;

  sourceFieldMap.allow_pet =
    "Tin Zalo";

  sourceFieldMap.allow_cat =
    "Tin Zalo";

  sourceFieldMap.allow_dog =
    "Tin Zalo";

  sourceFieldMap.no_pet =
    "Tin Zalo";
} else if (genericPetAllowed) {
  /*
   * Pet chung được phép:
   * mặc định cả mèo và chó đều Có.
   */
  detailPayload.allow_pet =
    true;

  detailPayload.allow_cat =
    true;

  detailPayload.allow_dog =
    true;

  detailPayload.no_pet =
    false;

  sourceFieldMap.allow_pet =
    "Tin Zalo";

  sourceFieldMap.allow_cat =
    "Tin Zalo";

  sourceFieldMap.allow_dog =
    "Tin Zalo";
} else {
  if (catAllowed) {
    detailPayload.allow_pet =
      true;

    detailPayload.allow_cat =
      true;

    detailPayload.no_pet =
      false;

    sourceFieldMap.allow_cat =
      "Tin Zalo";
  }

  if (dogAllowed) {
    detailPayload.allow_pet =
      true;

    detailPayload.allow_dog =
      true;

    detailPayload.no_pet =
      false;

    sourceFieldMap.allow_dog =
      "Tin Zalo";
  }
}

    if (roomPayload.description) {
    sourceFieldMap.description = "Tin Zalo";
  }

  if (roomPayload.chinh_sach) {
    sourceFieldMap.chinh_sach = "Tin Zalo";
  }

  const filledCount = [
  roomPayload.room_code,
  roomPayload.house_number,
  roomPayload.address,
  roomPayload.district,
  roomPayload.price,
  roomPayload.zalo_phone,

  detailPayload.electric_fee_value,
  detailPayload.water_fee_value,
  detailPayload.service_fee_value,

  detailPayload.other_fee_value,
  detailPayload.other_fee_note,
  detailPayload.other_amenities,

  roomPayload.chinh_sach,
].filter(Boolean).length;

  return {
    roomPayload,
    detailPayload,
    confidenceScore: Math.min(0.9, 0.25 + filledCount * 0.08),
    sourceFieldMap,
  };
}