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

  const s = normalizeForCompare(raw)
    .replace(
      /^(?:q(?:uan)?|quan|huyen|tp|thanh pho)\s*[:.\-]?\s*/,
      ""
    )
    .trim();

  const qNum = s.match(
    /^(?:q|quan)?\s*(\d{1,2})$/
  );

  if (qNum?.[1]) {
    return `Quận ${Number(qNum[1])}`;
  }

  const map: Record<string, string> = {
    "binh thanh": "Bình Thạnh",
    "go vap": "Gò Vấp",
    "phu nhuan": "Phú Nhuận",
    "tan binh": "Tân Bình",
    "tan phu": "Tân Phú",
    "thu duc": "Thủ Đức",
    "binh tan": "Bình Tân",
    "binh chanh": "Bình Chánh",
    "nha be": "Nhà Bè",
    "hoc mon": "Hóc Môn",
    "cu chi": "Củ Chi",
    "can gio": "Cần Giờ",
  };

  return map[s] || raw;
}

export function normalizeWard(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const cleaned = raw
    .replace(
      /\b(?:phường|phuong|p(?:\.|(?=\s|\d))|xã|xa|x(?:\.|(?=\s))|thị\s*trấn|thi\s*tran|tt\.?)\s*[:\-]?\s*/gi,
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

export function normalizeRoomCode(
  input?: string | null
) {
  const raw =
    String(input || "").trim();

  if (!raw) return "";

  const withoutLabel = raw
    /*
     * "P." có dấu chấm thường là nhãn viết tắt của "Phòng":
     * P. G01 → G01
     * P. 301 → 301
     *
     * Không xóa P trong P1/P2/P301 vì đó có thể là mã thật.
     */
    .replace(
      /^\s*p\s*\.\s*(?=[a-z0-9])/i,
      ""
    )
    .replace(
      /\b(?:mã\s*phòng|ma\s*phong|phòng\s*mã|phong\s*ma|phòng|phong|room|mã|ma)\b/gi,
      " "
    )
    .replace(
      /^[\s:|/\-–—]+|[\s:|/\-–—]+$/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  const normalized =
    normalizeForCompare(
      withoutLabel
    )
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

  if (
    /^(?:penthouse|penhouse)$/.test(
      normalized
    )
  ) {
    return "Penthouse";
  }

  const floorMatch =
    normalized.match(
      /^(?:lau|tang|floor)\s*(\d{1,2})$/
    );

  if (floorMatch?.[1]) {
    return `L${Number(
      floorMatch[1]
    )}`;
  }

  return removeVietnameseTone(
    withoutLabel
  )
    .replace(
      /[\s:._/\-–—]+/g,
      ""
    )
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

function normalizeKnownStreetName(
  input: string
) {
  const compact =
    normalizeForCompare(
      input
    )
      .replace(/[.\s_\-]+/g, "")
      .trim();

  /*
   * Chuẩn hóa các cách viết tắt thường gặp của
   * đường Cách Mạng Tháng 8.
   *
   * Hỗ trợ cả CMT8 và CHT8 vì dữ liệu Zalo
   * có thể bị gõ sai hoặc viết tắt không đồng nhất.
   */
  const cachMangThang8Aliases =
    new Set([
      "cmt8",
      "cmt08",
      "cht8",
      "cht08",
      "cachmangt8",
      "cachmangthang8",
      "cachmangthangtam",
    ]);

  if (
    cachMangThang8Aliases.has(
      compact
    )
  ) {
    return "Cách Mạng Tháng 8";
  }

  return "";
}

function titleCaseStreet(input: string) {
  const knownStreetName =
    normalizeKnownStreetName(
      input
    );

  if (knownStreetName) {
    return knownStreetName;
  }

  const keepUpper =
    new Map<string, string>([
      ["kdc", "KDC"],
      ["kdt", "KĐT"],
      ["ql", "QL"],
      ["dt", "ĐT"],
      ["tl", "TL"],
      ["kp", "KP"],
      ["tp", "TP"],
    ]);

  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const knownToken =
        normalizeKnownStreetName(
          word
        );

      if (knownToken) {
        return knownToken;
      }

      const normalizedWord =
        normalizeForCompare(
          word
        )
          .replace(
            /[^a-z0-9]/g,
            ""
          );

      const upperToken =
        keepUpper.get(
          normalizedWord
        );

      if (upperToken) {
        return upperToken;
      }

      /*
       * Giữ nguyên/viết hoa các token có số:
       * 3/2, 5A, 12B...
       */
      if (/\d/.test(word)) {
        return word.toUpperCase();
      }

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
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
  const text =
    String(markerText || "")
      .replace(/\r\n?/g, "\n")
      .trim();

  if (!text) return "";

  const baseCode =
    "(?:" +
    "[A-Z]{1,3}\\s*\\.?\\s*\\d{1,4}[A-Z]?|" +
    "\\d{2,4}[A-Z]?" +
    ")";

  const codeToken =
    "(?:" +
    "trệt|tret|" +
    "lửng|lung|" +
    "sân\\s*thượng|san\\s*thuong|" +
    "tầng\\s*thượng|tang\\s*thuong|" +
    "penthouse|penhouse|" +
    "lầu\\s*\\d{1,2}|lau\\s*\\d{1,2}|" +
    "tầng\\s*\\d{1,2}|tang\\s*\\d{1,2}|" +
    "(?:P\\s*\\.\\s*)?" +
    baseCode +
    ")";

  const priceToken =
    "(?:" +
    "giá|gia|" +
    "\\d+(?:[.,]\\d+)?\\s*(?:tr|triệu|trieu|k)|" +
    "\\d{1,3}(?:[.,]\\d{3})+" +
    ")";

  const floorToken =
    "(?:" +
    "trệt|tret|" +
    "lửng|lung|" +
    "sân\\s*thượng|san\\s*thuong|" +
    "tầng\\s*thượng|tang\\s*thuong|" +
    "lầu\\s*\\d{1,2}|lau\\s*\\d{1,2}|" +
    "tầng\\s*\\d{1,2}|tang\\s*\\d{1,2}" +
    ")";

  const explicitPatterns = [
    new RegExp(
      `\\b(?:mã\\s*phòng|ma\\s*phong|phòng\\s*mã|phong\\s*ma|mã|ma|phòng|phong|room)\\s*[:\\-]?\\s*(${codeToken})\\b`,
      "i"
    ),

    /*
     * Trống sẵn 301 giá 3tr
     * Còn trống P2 giá 5tr
     */
    new RegExp(
      `\\b(?:trống|trong|còn\\s*trống|con\\s*trong)\\s*(?:sẵn|san)?\\s*(?:(?:phòng|phong)\\s*)?(?:(?:mã|ma)\\s*)?[:\\-]?\\s*(${codeToken})\\b`,
      "i"
    ),

    /*
     * Mã đứng đầu nhưng giữa mã và giá có mô tả:
     * P. G01 (CS+Duplex+2 giường ngủ): 10.000.000đ
     */
    new RegExp(
      `^\\s*(${codeToken})(?!\\s*[/])(?=[\\s\\S]{0,140}${priceToken})`,
      "i"
    ),

    /*
     * Giá đứng trước mã tầng:
     * Giá 13tr ... Tầng 3
     */
    new RegExp(
      `${priceToken}[\\s\\S]{0,100}\\b(${floorToken})\\b`,
      "i"
    ),
  ];

  for (const pattern of explicitPatterns) {
    const match =
      text.match(pattern);

    if (match?.[1]) {
      return normalizeRoomCode(
        match[1]
      );
    }
  }

  return "";
}


const MIN_ROOM_PRICE_VND =
  2_000_000;

const MAX_ROOM_PRICE_VND =
  50_000_000;

/**
 * Chỉ dùng giới hạn này cho GIÁ THUÊ PHÒNG.
 *
 * Không áp dụng cho:
 * - điện;
 * - nước;
 * - dịch vụ;
 * - giữ xe;
 * - phí khác.
 *
 * Các khoản phí nhỏ như 200k vẫn được parser đọc
 * vào field phí tương ứng, nhưng không thể trở thành
 * room_payload.price.
 */
function isValidRoomPriceVnd(
  value: number | null
) {
  return (
    value != null &&
    Number.isFinite(value) &&
    value >=
      MIN_ROOM_PRICE_VND &&
    value <=
      MAX_ROOM_PRICE_VND
  );
}

const ROOM_PRICE_TOKEN_SOURCE =
  "(?:" +
  /*
   * 6tr2, 6tr200, 6 triệu 2...
   * Phải đứng trước dạng 6tr.
   */
  "\\d+\\s*(?:tr|triệu|trieu)\\d{1,3}(?:k)?\\b|" +

  /*
   * 6tr, 6,2tr, 6.2 triệu.
   */
  "\\d+(?:[.,]\\d+)?\\s*(?:tr|triệu|trieu)\\b|" +

  /*
   * 6200k.
   * 200k cũng được nhận thành token nhưng sẽ bị
   * loại bởi khoảng giá 2-50 triệu.
   */
  "\\d+(?:[.,]\\d+)?\\s*(?:k|nghìn|ngan|ngàn)\\b|" +

  /*
   * 6.200.000đ, 6,200,000.
   */
  "\\d{1,3}(?:[.,]\\d{3}){1,2}\\s*(?:đ|d|đồng|dong)?\\b|" +

  /*
   * 6200000đ.
   */
  "\\d{7,8}\\s*(?:đ|d|đồng|dong)\\b" +
  ")";

function getRoomPriceTokens(
  input: string
) {
  const pattern =
    new RegExp(
      ROOM_PRICE_TOKEN_SOURCE,
      "gi"
    );

  return Array.from(
    String(input || "")
      .matchAll(pattern)
  )
    .map((match) =>
      String(
        match[0] || ""
      ).trim()
    )
    .filter(Boolean);
}

function parseValidRoomPriceToken(
  token: string
) {
  const value =
    normalizeMoneyToVnd(
      token
    );

  return isValidRoomPriceVnd(
    value
  )
    ? value
    : null;
}

function isBlockedRoomPriceLine(
  input: string
) {
  const normalized =
    normalizeForCompare(
      input
    );

  return /^(?:phi|phi dich vu|dich vu|dien|nuoc|xe|giu xe|gui xe|parking|coc|coc toi thieu|hoa hong|hh|commission|giam gia|khuyen mai|thuong nong)\b/.test(
    normalized
  );
}

function isLikelyRoomPriceLine(
  input: string
) {
  const normalized =
    normalizeForCompare(
      input
    );

  if (
    !normalized ||
    isBlockedRoomPriceLine(
      input
    )
  ) {
    return false;
  }

  const hasVacancy =
    /\b(?:trong|trong san|phong trong|con trong|dang trong|available)\b/.test(
      normalized
    );

  const startsWithRoomCode =
    /^(?:(?:trong|con trong|phong trong)\s+)?(?:phong\s+|ma\s+|ma phong\s+|room\s+)?(?:tret|lung|san\s+thuong|tang\s+thuong|penthouse|penhouse|lau\s*\d{1,2}|tang\s*\d{1,2}|[a-z]{1,3}\.?\d{1,4}[a-z]?|\d{2,4}[a-z]?)\b/.test(
      normalized
    );

  const hasRoomLabel =
    /\b(?:ma phong|phong|room)\b/.test(
      normalized
    );

  return (
    hasVacancy ||
    startsWithRoomCode ||
    hasRoomLabel
  );
}

function pickValidRoomPriceFromLine(
  line: string
) {
  if (
    !line ||
    isBlockedRoomPriceLine(
      line
    )
  ) {
    return null;
  }

  /*
   * Ưu tiên token ngay sau nhãn "giá".
   */
  const explicitPattern =
    new RegExp(
      `(?:giá\\s*thuê|gia\\s*thue|giá\\s*phòng|gia\\s*phong|giá|gia)\\s*[:\\-]?\\s*(${ROOM_PRICE_TOKEN_SOURCE})`,
      "i"
    );

  const explicitMatch =
    line.match(
      explicitPattern
    );

  if (
    explicitMatch?.[1]
  ) {
    const explicitValue =
      parseValidRoomPriceToken(
        explicitMatch[1]
      );

    if (
      explicitValue != null
    ) {
      return explicitValue;
    }
  }

  /*
   * Sau đó duyệt tất cả token trên chính dòng phòng.
   *
   * Ví dụ:
   * 103: 6tr2 15/7 trống
   *
   * Chỉ "6tr2" là token tiền.
   * "15/7" là ngày và không đi qua regex tiền.
   */
  for (
    const token of
    getRoomPriceTokens(line)
  ) {
    const value =
      parseValidRoomPriceToken(
        token
      );

    if (
      value != null
    ) {
      return value;
    }
  }

  return null;
}

function extractRoomPriceFromMarker(
  markerText: string
) {
  const lines =
    getCleanZaloLines(
      markerText
    );

  /*
   * Vòng 1:
   * Chỉ đọc những dòng có tín hiệu phòng/mã phòng/trống.
   *
   * Đây là vòng quan trọng nhất để không lấy:
   * - Cọc 2tr;
   * - Dịch vụ 200k/phòng;
   * - Giảm giá 300k.
   */
  for (const line of lines) {
    if (
      !isLikelyRoomPriceLine(
        line
      )
    ) {
      continue;
    }

    const value =
      pickValidRoomPriceFromLine(
        line
      );

    if (
      value != null
    ) {
      return value;
    }
  }

  /*
   * Vòng 2:
   * Hỗ trợ marker được tách riêng:
   *
   * Giá: 6tr2
   *
   * nhưng vẫn bỏ các section phí/cọc/hoa hồng.
   */
  for (const line of lines) {
    if (
      isBlockedRoomPriceLine(
        line
      )
    ) {
      continue;
    }

    const normalized =
      normalizeForCompare(
        line
      );

    if (
      !/^(?:gia|gia thue|gia phong)\b/.test(
        normalized
      )
    ) {
      continue;
    }

    const value =
      pickValidRoomPriceFromLine(
        line
      );

    if (
      value != null
    ) {
      return value;
    }
  }

  /*
   * Vòng 3:
   * Fallback cuối cho marker rất ngắn chỉ có token giá.
   *
   * Vẫn bắt buộc giá trong khoảng 2-50 triệu.
   */
  for (const line of lines) {
    const value =
      pickValidRoomPriceFromLine(
        line
      );

    if (
      value != null
    ) {
      return value;
    }
  }

  return null;
}

function extractWardFromBuildingText(
  input: string
) {
  const text = String(input || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!text) return "";

  const wardLabel =
    "(?:" +
    "phường|phuong|" +
    "p(?:\\.|(?=\\s|\\d))|" +
    "xã|xa|" +
    "x(?:\\.|(?=\\s))|" +
    "thị\\s*trấn|thi\\s*tran|" +
    "tt\\.?" +
    ")";

  /*
   * Phường/xã số: P14, P.14, Phường 14.
   * Chỉ nhận tối đa 2 chữ số để không nhầm P303/P202 là mã phòng.
   */
  const numericMatch = text.match(
    new RegExp(
      `(?:^|[\\s,;|/()])${wardLabel}\\s*[:\\-]?\\s*(\\d{1,2})(?!\\d)(?=\\s*(?:[,;|/()\\n]|\\s*[-–—]\\s*|q\\.?\\s*\\d{1,2}\\b|quận\\b|quan\\b|huyện\\b|huyen\\b|$))`,
      "i"
    )
  );

  if (numericMatch?.[1]) {
    return normalizeWard(
      numericMatch[1]
    );
  }

  /*
   * Phường/xã tên:
   * P An Đông, Phường Chợ Lớn, Xã Bình Hưng...
   */
  const namedMatch = text.match(
    new RegExp(
      `(?:^|[\\s,;|/()])${wardLabel}\\s*[:\\-]?\\s*([A-Za-zÀ-ỹ]+(?:\\s+[A-Za-zÀ-ỹ]+){0,4}?)(?=\\s*(?:[,;|/()\\n]|\\s*[-–—]\\s*|q\\.?\\s*\\d{1,2}\\b|quận\\b|quan\\b|huyện\\b|huyen\\b|$))`,
      "i"
    )
  );

  if (namedMatch?.[1]) {
    return normalizeWard(
      namedMatch[1]
    );
  }

  return "";
}

function extractAddressParts(
  input: string
): ExtractedAddressParts {
  const rawText =
    String(input || "")
      .replace(/\r\n?/g, "\n")
      .trim();

  const result:
    ExtractedAddressParts = {
      houseNumber: "",
      address: "",
      ward: "",
      district: "",
    };

  if (!rawText) {
    return result;
  }

  /*
   * Quận/huyện có tên tại TP.HCM.
   * Quận số chỉ được nhận khi có nhãn Q/Quận để tránh
   * hiểu nhầm số đường, số phòng hoặc ngày tháng.
   */
  const namedDistrictSource =
    "(?:" +
    "bình\\s*thạnh|binh\\s*thanh|" +
    "gò\\s*vấp|go\\s*vap|" +
    "phú\\s*nhuận|phu\\s*nhuan|" +
    "tân\\s*bình|tan\\s*binh|" +
    "tân\\s*phú|tan\\s*phu|" +
    "thủ\\s*đức|thu\\s*duc|" +
    "bình\\s*tân|binh\\s*tan|" +
    "bình\\s*chánh|binh\\s*chanh|" +
    "nhà\\s*bè|nha\\s*be|" +
    "hóc\\s*môn|hoc\\s*mon|" +
    "củ\\s*chi|cu\\s*chi|" +
    "cần\\s*giờ|can\\s*gio" +
    ")";

  const districtSource =
    `(?:\\d{1,2}|${namedDistrictSource})`;

  const districtPattern =
    new RegExp(
      `\\b(?:q\\.?|quận|quan|huyện|huyen|tp\\.?|thành\\s*phố|thanh\\s*pho)\\s*[:\\-]?\\s*(${districtSource})\\b`,
      "i"
    );

  /*
   * Fallback chỉ nhận quận/huyện không nhãn khi nó nằm
   * ở cuối một đoạn địa chỉ và thuộc whitelist rõ ràng.
   *
   * Ví dụ:
   * Bình Hưng - Bình Chánh
   */
  const unlabeledDistrictSuffixPattern =
    new RegExp(
      `(?:^|[,;|]|\\s[-–—]\\s)\\s*(${namedDistrictSource})\\s*$`,
      "i"
    );

  const wardLabelSource =
    "(?:" +
    "phường|phuong|" +
    "p(?:\\.|(?=\\s|\\d))|" +
    "xã|xa|" +
    "x(?:\\.|(?=\\s))|" +
    "thị\\s*trấn|thi\\s*tran|" +
    "tt\\.?" +
    ")";

  const wardPattern =
    new RegExp(
      `(?:^|[\\s,;|/()])${wardLabelSource}\\s*[:\\-]?\\s*(\\d{1,2}|[A-Za-zÀ-ỹ]+(?:\\s+[A-Za-zÀ-ỹ]+){0,4}?)(?=\\s*(?:[,;|/()\\n]|\\s*[-–—]\\s*|q\\.?\\s*\\d{1,2}\\b|quận\\b|quan\\b|huyện\\b|huyen\\b|tp\\.?\\b|$))`,
      "i"
    );

  const houseNumberSource =
    "\\d+[A-Za-z]{0,4}" +
    "(?:(?:\\/|-)\\d+[A-Za-z]{0,4})*";

  const houseAndStreetPattern =
    new RegExp(
      `^(${houseNumberSource})\\s+([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ0-9.'’/\\s-]{1,140})$`,
      "i"
    );

  const lines =
    rawText
      .split("\n")
      .map((line) =>
        cleanListPrefix(line)
      )
      .filter(Boolean);

  function isPlausibleWardCandidate(
    value: string
  ) {
    const cleaned =
      normalizeWard(value);

    if (
      !cleaned ||
      cleaned.length < 2 ||
      cleaned.length > 45 ||
      /\d/.test(cleaned) ||
      !/^[A-Za-zÀ-ỹ'’\s-]+$/.test(
        cleaned
      )
    ) {
      return false;
    }

    const normalized =
      normalizeForCompare(
        cleaned
      );

    if (
      /^(?:duong|hem|ngo|kdc|khu dan cu|kdt|khu do thi|quoc lo|tinh lo|xa lo|cao toc|kp|khu pho|ap|thon)\b/.test(
        normalized
      )
    ) {
      return false;
    }

    const wordCount =
      cleaned
        .split(/\s+/)
        .filter(Boolean)
        .length;

    return (
      wordCount >= 1 &&
      wordCount <= 5
    );
  }

  function analyzeLocationTail(
    inputCandidate: string
  ) {
    let working =
      String(
        inputCandidate || ""
      )
        .replace(/\r\n?/g, "\n")
        .replace(
          /\b(?:hotline|liên hệ|lien he|sđt|sdt|phone|zalo|phòng|phong|room|giá|gia|trống|trong)\b.*$/i,
          ""
        )
        .replace(/\s+/g, " ")
        .replace(
          /[\s,;|\-–—]+$/g,
          ""
        )
        .trim();

    let district = "";
    let ward = "";

    let districtStart = -1;

    const explicitDistrict =
      working.match(
        districtPattern
      );

    if (
      explicitDistrict?.[1] &&
      typeof explicitDistrict.index ===
        "number"
    ) {
      district =
        normalizeDistrict(
          explicitDistrict[1]
        );

      districtStart =
        explicitDistrict.index;
    } else {
      const unlabeledDistrict =
        working.match(
          unlabeledDistrictSuffixPattern
        );

      if (
        unlabeledDistrict?.[1] &&
        typeof unlabeledDistrict.index ===
          "number"
      ) {
        district =
          normalizeDistrict(
            unlabeledDistrict[1]
          );

        districtStart =
          unlabeledDistrict.index;
      }
    }

    const beforeDistrict =
      districtStart >= 0
        ? working
            .slice(
              0,
              districtStart
            )
            .replace(
              /[\s,;|\-–—]+$/g,
              ""
            )
            .trim()
        : working;

    const explicitWard =
      beforeDistrict.match(
        wardPattern
      );

    let wardStart = -1;

    if (
      explicitWard?.[1] &&
      typeof explicitWard.index ===
        "number"
    ) {
      ward =
        normalizeWard(
          explicitWard[1]
        );

      wardStart =
        explicitWard.index;
    } else if (district) {
      const beforeParts =
        beforeDistrict
          .split(
            /\s*(?:,|;|\||\s[-–—]\s)\s*/
          )
          .map((part) =>
            cleanListPrefix(part)
          )
          .filter(Boolean);

      const possibleWard =
        beforeParts[
          beforeParts.length - 1
        ] || "";

      const hasSeparateWardPart =
        beforeParts.length >= 2;

      const isLocationOnlyLine =
        beforeParts.length === 1 &&
        /(?:,|;|\||\s[-–—]\s)/.test(
          working
        ) &&
        !/\d/.test(
          beforeParts[0] || ""
        );

      if (
        (
          hasSeparateWardPart ||
          isLocationOnlyLine
        ) &&
        isPlausibleWardCandidate(
          possibleWard
        )
      ) {
        ward =
          normalizeWard(
            possibleWard
          );

        wardStart =
          beforeDistrict
            .lastIndexOf(
              possibleWard
            );
      }
    }

    if (districtStart >= 0) {
      working =
        working
          .slice(
            0,
            districtStart
          )
          .trim();
    }

    if (wardStart >= 0) {
      working =
        working
          .slice(
            0,
            wardStart
          )
          .trim();
    } else if (ward) {
      const escapedWard =
        ward.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      working =
        working.replace(
          new RegExp(
            `(?:[,;|]|\\s[-–—]\\s)\\s*${escapedWard}\\s*$`,
            "i"
          ),
          ""
        );
    }

    working =
      working
        .replace(
          districtPattern,
          ""
        )
        .replace(
          wardPattern,
          ""
        )
        .replace(
          /[\s,:;|\-–—]+$/g,
          ""
        )
        .replace(/\s+/g, " ")
        .trim();

    return {
      cleanedAddress:
        working,

      ward,
      district,
    };
  }

  /*
   * Lấy quận/phường toàn cục trước.
   * Ưu tiên nhãn rõ ràng, sau đó mới dùng location tail.
   */
  const explicitDistrictInText =
    rawText.match(
      districtPattern
    );

  if (
    explicitDistrictInText?.[1]
  ) {
    result.district =
      normalizeDistrict(
        explicitDistrictInText[1]
      );
  }

  result.ward =
    extractWardFromBuildingText(
      rawText
    );

  if (
    !result.district ||
    !result.ward
  ) {
    for (const line of lines) {
      const location =
        analyzeLocationTail(
          line
        );

      if (
        !result.district &&
        location.district
      ) {
        result.district =
          location.district;
      }

      if (
        !result.ward &&
        location.ward
      ) {
        result.ward =
          location.ward;
      }

      if (
        result.district &&
        result.ward
      ) {
        break;
      }
    }
  }

  function parseAddressCandidate(
    inputCandidate: string
  ) {
    let candidate =
      String(
        inputCandidate || ""
      )
        .replace(
          /^(?:địa\s*chỉ(?:\s*dự\s*án)?|dia\s*chi(?:\s*du\s*an)?|vị\s*trí|vi\s*tri|đc|dc)\s*[:\-]?\s*/i,
          ""
        )
        .trim();

    const location =
      analyzeLocationTail(
        candidate
      );

    candidate =
      location.cleanedAddress
        /*
         * 553, Lê Văn Thọ
         * → 553 Lê Văn Thọ
         */
        .replace(
          new RegExp(
            `^(${houseNumberSource})\\s*[,;]\\s*(?=[A-Za-zÀ-ỹ])`,
            "i"
          ),
          "$1 "
        )
        .replace(
          /[\s,:;|\-–—]+$/g,
          ""
        )
        .replace(/\s+/g, " ")
        .trim();

    const streetMatch =
      candidate.match(
        houseAndStreetPattern
      );

    if (
      !streetMatch?.[1] ||
      !streetMatch?.[2]
    ) {
      return false;
    }

    const street =
      streetMatch[2].trim();

    const normalizedStreet =
      normalizeForCompare(
        street
      );

    if (
      street.length < 2 ||
      /^(?:gia|dien|nuoc|dich vu|phi|coc|hoa hong|phong|room|trong)\b/.test(
        normalizedStreet
      )
    ) {
      return false;
    }

    result.houseNumber =
      streetMatch[1].trim();

    result.address =
      titleCaseStreet(
        street
      );

    if (location.ward) {
      result.ward =
        location.ward;
    }

    if (location.district) {
      result.district =
        location.district;
    }

    return true;
  }

  /*
   * 1. Ưu tiên dòng có nhãn rõ ràng:
   * Địa chỉ: 553 Lê Văn Thọ, P14, Q Gò Vấp
   */
  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line =
      lines[index];

    const normalized =
      normalizeForCompare(
        line
      );

    if (
      !/^(?:dia chi(?: du an)?|vi tri|dc)\b/.test(
        normalized
      )
    ) {
      continue;
    }

    if (
      parseAddressCandidate(
        line
      )
    ) {
      return result;
    }

    /*
     * Hỗ trợ:
     * Địa chỉ:
     * 151 Đường Số 5...
     */
    for (
      let nextIndex =
        index + 1;
      nextIndex <
        Math.min(
          lines.length,
          index + 4
        );
      nextIndex++
    ) {
      if (
        parseAddressCandidate(
          lines[nextIndex]
        )
      ) {
        return result;
      }
    }
  }

  /*
   * 2. Dòng đầy đủ bắt đầu bằng số nhà:
   * 151 Đường Số 5 KDC Trung Sơn,
   * Bình Hưng - Bình Chánh
   */
  for (const line of lines) {
    if (
      new RegExp(
        `^${houseNumberSource}(?:\\s|[,;])+[A-Za-zÀ-ỹ]`,
        "i"
      ).test(line) &&
      parseAddressCandidate(
        line
      )
    ) {
      return result;
    }
  }

  /*
   * 3. Fallback cho địa chỉ bị tách bằng dấu phẩy hoặc xuống dòng:
   *
   * 553, Lê Văn Thọ, P14, Q Gò Vấp
   * 553
   * Lê Văn Thọ
   * P14
   * Q Gò Vấp
   */
  const explicitDistrictMatch =
    rawText.match(
      districtPattern
    );

  if (
    explicitDistrictMatch &&
    typeof explicitDistrictMatch.index ===
      "number"
  ) {
    const textBeforeDistrict =
      rawText.slice(
        Math.max(
          0,
          explicitDistrictMatch.index -
            300
        ),
        explicitDistrictMatch.index
      );

    const segments =
      textBeforeDistrict
        .split(
          /\s*(?:,|;|\||\n|\s[-–—]\s)\s*/
        )
        .map((part) =>
          cleanListPrefix(part)
        )
        .filter(Boolean);

    while (
      segments.length > 0 &&
      new RegExp(
        `^${wardLabelSource}\\s*`,
        "i"
      ).test(
        segments[
          segments.length - 1
        ]
      )
    ) {
      segments.pop();
    }

    for (
      let index =
        segments.length - 1;
      index >= 0;
      index--
    ) {
      if (
        parseAddressCandidate(
          segments[index]
        )
      ) {
        return result;
      }

      if (
        index > 0 &&
        new RegExp(
          `^${houseNumberSource}$`,
          "i"
        ).test(
          segments[index - 1]
        ) &&
        /^[A-Za-zÀ-ỹ]/.test(
          segments[index]
        ) &&
        parseAddressCandidate(
          `${segments[index - 1]} ${segments[index]}`
        )
      ) {
        return result;
      }
    }
  }

  return result;
}


export type ZaloBuildingCandidate = {
  houseNumber: string;
  address: string;
  ward: string;
  district: string;
  label: string;
};

/**
 * Tìm các địa chỉ tòa nhà khác nhau xuất hiện trong một đoạn tin.
 *
 * Mục đích chính:
 * - chặn thao tác "phân tích lại" khi Admin vẫn dán lẫn
 *   thông tin của nhiều tòa nhà;
 * - không để parser tự chọn địa chỉ đầu tiên rồi ghép với
 *   marker/ảnh của một phòng khác.
 *
 * Các địa chỉ lặp lại của cùng một tòa nhà chỉ được tính một lần.
 */
export function detectZaloBuildingCandidates(
  input: string
): ZaloBuildingCandidate[] {
  const rawText = String(input || "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!rawText) {
    return [];
  }

  const lines = rawText
    .split("\n")
    .map((line) =>
      String(line || "")
        .replace(
          /^[^0-9A-Za-zÀ-ỹĐđ]+/,
          ""
        )
        .trim()
    )
    .filter(Boolean);

  const candidateTexts: string[] = [];

  const addressLabelPattern =
    /(?:địa\s*chỉ(?:\s*dự\s*án)?|dia\s*chi(?:\s*du\s*an)?|vị\s*trí|vi\s*tri|đc|dc)\s*[:\-]/i;

  const houseNumberAtStartPattern =
    /^\d+[A-Za-z]{0,4}(?:(?:\/|-)\d+[A-Za-z]{0,4})*\s+[A-Za-zÀ-ỹĐđ]/i;

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    const line = lines[index];

    if (
      addressLabelPattern.test(line) ||
      houseNumberAtStartPattern.test(line)
    ) {
      candidateTexts.push(line);
    }

    /*
     * Hỗ trợ dạng:
     *
     * Địa chỉ:
     * 151 Đường Số 5...
     */
    if (
      addressLabelPattern.test(line)
    ) {
      candidateTexts.push(
        lines
          .slice(
            index,
            Math.min(
              lines.length,
              index + 3
            )
          )
          .join("\n")
      );
    }
  }

  /*
   * Một số tin để địa chỉ trong một paragraph dài.
   * Duyệt thêm paragraph để không bỏ sót.
   */
  for (
    const paragraph of rawText
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
  ) {
    if (
      addressLabelPattern.test(
        paragraph
      )
    ) {
      candidateTexts.push(
        paragraph
      );
    }
  }

  const unique =
    new Map<
      string,
      ZaloBuildingCandidate
    >();

  for (const candidateText of candidateTexts) {
    const parsed =
      extractAddressParts(
        candidateText
      );

    if (
      !parsed.houseNumber ||
      !parsed.address
    ) {
      continue;
    }

    /*
     * Dedupe theo số nhà + tên đường.
     * Quận/phường có thể thiếu ở một lần nhắc lại,
     * nhưng vẫn là cùng một tòa nhà.
     */
    const key =
      normalizeForCompare(
        [
          parsed.houseNumber,
          parsed.address,
        ].join(" ")
      );

    if (!key) {
      continue;
    }

    const candidate:
      ZaloBuildingCandidate = {
      houseNumber:
        parsed.houseNumber,
      address:
        parsed.address,
      ward:
        parsed.ward,
      district:
        parsed.district,
      label: [
        parsed.houseNumber,
        parsed.address,
        parsed.ward
          ? `P.${parsed.ward}`
          : "",
        parsed.district,
      ]
        .filter(Boolean)
        .join(", "),
    };

    const existing =
      unique.get(key);

    if (!existing) {
      unique.set(
        key,
        candidate
      );
      continue;
    }

    /*
     * Nếu lần nhắc sau có đủ phường/quận hơn,
     * bổ sung vào candidate đã có.
     */
    unique.set(
      key,
      {
        ...existing,
        ward:
          existing.ward ||
          candidate.ward,
        district:
          existing.district ||
          candidate.district,
        label: [
          existing.houseNumber,
          existing.address,
          existing.ward ||
          candidate.ward
            ? `P.${
                existing.ward ||
                candidate.ward
              }`
            : "",
          existing.district ||
          candidate.district,
        ]
          .filter(Boolean)
          .join(", "),
      }
    );
  }

  return Array.from(
    unique.values()
  );
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

  const roomCodeToken =
    "(?:" +
    "tret|lung|" +
    "san\\s+thuong|tang\\s+thuong|" +
    "penthouse|penhouse|" +
    "lau\\s*\\d{1,2}|tang\\s*\\d{1,2}|" +
    "(?:p\\s*\\.\\s*)?[a-z]{0,3}\\s*\\.?\\s*\\d{1,4}[a-z]?|" +
    "\\d{2,4}[a-z]?" +
    ")";

  const startsWithRoomCode =
    !/^\d+[a-z]?(?:\/\d+[a-z]?)+\b/.test(
      normalized
    ) &&
    new RegExp(
      `^(?:(?:trong|con\\s+trong)\\s+)?(?:ma\\s+)?${roomCodeToken}\\b`,
      "i"
    ).test(normalized);

  const hasFloorCode =
    /\b(?:tret|lung|san\s+thuong|tang\s+thuong|lau\s*\d{1,2}|tang\s*\d{1,2})\b/.test(
      normalized
    );

  const hasPrice =
    extractRoomPriceFromMarker(
      input
    ) != null;

  return (
    (
      hasRoomSignal ||
      startsWithRoomCode ||
      hasRoomTypeSignal ||
      hasFloorCode
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

const MIN_SERVICE_FEE_VND =
  100_000;

const MAX_SERVICE_FEE_VND =
  600_000;

function isValidServiceFeeVnd(
  value: number | null
) {
  return (
    value != null &&
    Number.isFinite(value) &&
    value >=
      MIN_SERVICE_FEE_VND &&
    value <=
      MAX_SERVICE_FEE_VND
  );
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
    "\\d{1,3}(?:[.,]\\d{3})+\\s*(?:d|dong)?\\b|" +
    "\\d{5,6}\\s*(?:d|dong)?\\b" +
    ")";

  /*
   * Nhận các nhãn thực tế thường xuất hiện trong tin Zalo:
   *
   * - Phí quản lý / Quản lý
   * - Qly / QL
   * - Phí dịch vụ / Dịch vụ
   * - Phí DV / DV
   * - Service fee
   *
   * Cho phép có thêm từ "chung", "tòa nhà" hoặc đơn vị
   * trước số tiền, ví dụ: "QLy chung 200k/p".
   */
  const serviceLabel =
    "(?:" +
    "(?:phi\\s*)?" +
    "(?:" +
    "dich\\s*vu|" +
    "dv|" +
    "quan\\s*ly|" +
    "qly|" +
    "ql|" +
    "service(?:\\s*fee)?" +
    ")" +
    ")";

  const optionalQualifier =
    "(?:\\s+(?:chung|toa\\s*nha|hang\\s*thang))?";

  const optionalUnitBeforeAmount =
    "(?:\\s*/\\s*(?:phong|p|thang|nguoi|ng))?";

  const pattern = new RegExp(
    `(?:^|[\\s,;|])${serviceLabel}${optionalQualifier}${optionalUnitBeforeAmount}\\s*[:=\\-]?\\s*(${moneyToken})`,
    "i"
  );

  for (const line of lines) {
    const normalized =
      removeVietnameseTone(line)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const match =
      normalized.match(
        pattern
      );

    if (!match?.[1]) {
      continue;
    }

    const value =
      parseFeeMoneyToken(
        match[1]
      );

    /*
     * Phí dịch vụ hợp lệ chỉ nằm trong khoảng
     * 100.000đ đến 600.000đ.
     *
     * Khoản ngoài khoảng này bị bỏ qua để tránh lấy nhầm:
     * - giá phòng;
     * - tiền cọc;
     * - tiền điện, nước;
     * - khoản tiền khác.
     */
    if (
      isValidServiceFeeVnd(
        value
      )
    ) {
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
const detectedRoomPrice =
  extractRoomPriceFromMarker(
    markerText
  );

if (
  detectedRoomPrice != null
) {
  roomPayload.price =
    detectedRoomPrice;

  sourceFieldMap.price =
    "Tin Zalo";
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

  /*
   * Phí dịch vụ có thể nằm trong:
   * - phần thông tin tòa nhà; hoặc
   * - phần mô tả riêng của phòng sau marker.
   *
   * Vì vậy phải quét toàn bộ nội dung gốc của record,
   * không chỉ riêng houseInfoText.
   */
  const serviceFee =
    pickServiceFeeFromZaloText(
      text
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

  /*
   * Điểm sơ bộ chỉ phản ánh dữ liệu text parser đọc được.
   * Điểm chất lượng cuối cùng được tính ở API import sau khi:
   * - resolve dữ liệu cùng nhà;
   * - upload ảnh/video;
   * - kiểm tra readerIssues;
   * - kiểm tra phòng trùng.
   */
  let preliminaryScore = 0;

  if (roomPayload.room_code) {
    preliminaryScore += 20;
  }

  if (
    roomPayload.house_number &&
    roomPayload.address
  ) {
    preliminaryScore += 20;
  } else if (
    roomPayload.house_number ||
    roomPayload.address
  ) {
    preliminaryScore += 8;
  }

  if (roomPayload.district) {
    preliminaryScore += 10;
  }

  if (
    isValidRoomPriceVnd(
      Number(roomPayload.price)
    )
  ) {
    preliminaryScore += 20;
  }

  if (roomPayload.room_type) {
    preliminaryScore += 10;
  }

  if (roomPayload.status) {
    preliminaryScore += 5;
  }

  if (
    roomPayload.zalo_phone ||
    roomPayload.link_zalo
  ) {
    preliminaryScore += 5;
  }

  if (
    detailPayload.electric_fee_value != null
  ) {
    preliminaryScore += 3;
  }

  if (
    detailPayload.water_fee_value != null
  ) {
    preliminaryScore += 3;
  }

  if (
    detailPayload.service_fee_value != null
  ) {
    preliminaryScore += 2;
  }

  if (
    roomPayload.chinh_sach ||
    detailPayload.other_amenities
  ) {
    preliminaryScore += 2;
  }

  return {
    roomPayload,
    detailPayload,
    confidenceScore:
      Math.min(100, preliminaryScore) /
      100,
    sourceFieldMap,
  };
}
