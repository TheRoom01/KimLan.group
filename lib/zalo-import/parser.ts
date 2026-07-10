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

  return raw
    .replace(/\b(?:p\.?|phường|phuong)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRoomCode(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const x = raw
    .replace(/\b(?:phòng|phong|room|mã|ma)\b/gi, "")
    .replace(/[:\-\s]+/g, "")
    .replace(/^P(?=\d)/i, "P.")
    .toUpperCase();

  return x;
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

  /*
   * Hỗ trợ marker không có chữ "phòng":
   *
   * 203 giá 8tr
   * G001 giá 8tr
   */
  const startsWithRoomCode =
    /^(?:[a-z]?\d{2,4}[a-z]?|[a-z]\d{2,4}|[a-z0-9]+[-/][a-z0-9-]+)\b/.test(
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
      startsWithRoomCode
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
      /\b(phi\s*dich vu|dien|nuoc|giu xe|gui xe|parking)\b/.test(
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
         * Bỏ mã phòng.
         */
        .replace(
          /\b(?:mã|ma|phòng|phong|room)\s*[:\-]?\s*[A-Z0-9][A-Z0-9./_-]*\b/gi,
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
    /^(dien|nuoc|dich vu|service)/.test(
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
    shared_washer: false,
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

  const codeMatch =
    markerText.match(
      /\b(?:mã|ma|phòng|phong|room)\s*[:\-]?\s*([A-Z0-9][A-Z0-9./_-]{1,30})\b/i
    ) ||
    markerText.match(
      /\b([A-Z]\.?\d{2,4}[A-Z]?)\b/i
    );

  if (codeMatch?.[1]) {
    roomPayload.room_code = normalizeRoomCode(codeMatch[1]);
    sourceFieldMap.room_code = "Tin Zalo";
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
  text.match(
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

  const districtMatch =
    text.match(/\b(?:q\.?|quận|quan)\s*([0-9]{1,2}|bình thạnh|binh thanh|gò vấp|go vap|phú nhuận|phu nhuan|tân bình|tan binh|tân phú|tan phu|thủ đức|thu duc|bình tân|binh tan)\b/i);

  if (districtMatch?.[1]) {
    roomPayload.district = normalizeDistrict(districtMatch[1]);
    sourceFieldMap.district = "Tin Zalo";
  }

  const wardMatch = text.match(/\b(?:p\.?|phường|phuong)\s*([0-9]{1,3}|[A-Za-zÀ-ỹ\s]{3,30})(?=,|\n|\.|\-|q\.?|quận|quan|$)/i);
  if (wardMatch?.[1]) {
    roomPayload.ward = normalizeWard(wardMatch[1]);
    sourceFieldMap.ward = "Tin Zalo";
  }

  const addressMatch =
    text.match(/\b(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)\s+([A-Za-zÀ-ỹ\s]+?)(?=,|\n|\.|\s+q\.?|\s+quận|\s+quan|$)/i);

  if (addressMatch?.[1] && addressMatch?.[2]) {
    const street = addressMatch[2]
      .replace(/\b(?:phòng|phong|room|giá|gia|trống|trong|còn|con)\b.*$/i, "")
      .trim();

    if (street.length >= 3) {
      roomPayload.house_number = addressMatch[1].trim();
      roomPayload.address = titleCaseStreet(street);
      sourceFieldMap.house_number = "Tin Zalo";
      sourceFieldMap.address = "Tin Zalo";
    }
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

  const serviceMatch = text.match(/(?:dịch vụ|dich vu|service)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (serviceMatch?.[0]) {
    detailPayload.service_fee_value = normalizeMoneyToVnd(serviceMatch[0]);
    sourceFieldMap.service_fee_value = "Tin Zalo";
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

  if (/máy giặt riêng|may giat rieng|mg riêng|mg rieng/i.test(textNoTone)) {
    detailPayload.private_washer = true;
    sourceFieldMap.private_washer = "Tin Zalo";
  }

  if (/máy giặt chung|may giat chung|giặt chung|giat chung/i.test(textNoTone)) {
    detailPayload.shared_washer = true;
    sourceFieldMap.shared_washer = "Tin Zalo";
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