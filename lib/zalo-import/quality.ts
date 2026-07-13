export type ZaloImportIssueLike = {
  level?: string | null;
  stage?: string | null;
  message?: string | null;
  index?: number | null;
  sourceUrl?: string | null;
};

export type ZaloQualityBreakdownItem = {
  label: string;
  score: number;
  max: number;
  reason: string;
};

export type ZaloQualityBlocker = {
  code: string;
  message: string;
};

export type ZaloAutoImportSettings = {
  enabled: boolean;
  dryRun: boolean;
  minScore: number;
  minImages: number;
  allowedGroups: string[];
  allowedGroup: boolean;
  ownerId: string;
};

export type ZaloImportQuality = {
  version: "quality-v1";
  score: number;
  score_fraction: number;
  eligible: boolean;
  breakdown: Record<
    | "room_code"
    | "address"
    | "district"
    | "price"
    | "media"
    | "media_binding"
    | "room_type"
    | "status"
    | "fees"
    | "contact"
    | "policy",
    ZaloQualityBreakdownItem
  >;
  blockers: ZaloQualityBlocker[];
  warnings: string[];
  auto_import: {
    enabled: boolean;
    dry_run: boolean;
    min_score: number;
    min_images: number;
    allowed_group: boolean;
    owner_id_configured: boolean;
    would_publish: boolean;
    published: boolean;
    published_room_id: string | null;
    publish_error: string | null;
  };
};

const MIN_ROOM_PRICE_VND = 2_000_000;
const MAX_ROOM_PRICE_VND = 50_000_000;

function removeVietnameseTone(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeText(input: unknown) {
  return removeVietnameseTone(
    String(input ?? "")
  )
    .toLowerCase()
    .replace(/[\r\n\t,;:|]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValue(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    return false;
  }

  return true;
}

function hasAnyValue(
  payload: Record<string, any>,
  fields: string[]
) {
  return fields.some((field) =>
    hasValue(payload?.[field])
  );
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, Math.round(parsed))
  );
}

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean
) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized =
    String(value).trim().toLowerCase();

  if (
    ["1", "true", "yes", "on"].includes(
      normalized
    )
  ) {
    return true;
  }

  if (
    ["0", "false", "no", "off"].includes(
      normalized
    )
  ) {
    return false;
  }

  return fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function makeBreakdownItem(
  label: string,
  score: number,
  max: number,
  reason: string
): ZaloQualityBreakdownItem {
  return {
    label,
    score: Math.max(0, Math.min(max, score)),
    max,
    reason,
  };
}

function issueHaystack(
  issues: ZaloImportIssueLike[]
) {
  return issues.map((issue) => ({
    ...issue,
    normalized: normalizeText(
      [
        issue.stage,
        issue.message,
      ]
        .filter(Boolean)
        .join(" ")
    ),
  }));
}

function matchesAny(
  input: string,
  patterns: RegExp[]
) {
  return patterns.some((pattern) =>
    pattern.test(input)
  );
}

export function readZaloAutoImportSettings(
  groupName: string
): ZaloAutoImportSettings {
  const enabled = parseBooleanEnv(
    process.env.ZALO_AUTO_IMPORT_ENABLED,
    false
  );

  const dryRun = parseBooleanEnv(
    process.env.ZALO_AUTO_IMPORT_DRY_RUN,
    true
  );

  const minScore = clampInt(
    process.env.ZALO_AUTO_IMPORT_MIN_SCORE,
    1,
    100,
    95
  );

  const minImages = clampInt(
    process.env.ZALO_AUTO_IMPORT_MIN_IMAGES,
    0,
    50,
    3
  );

  const allowedGroups = uniqueStrings(
    String(
      process.env.ZALO_AUTO_IMPORT_ALLOWED_GROUPS ||
        ""
    )
      .split(",")
      .map((item) => item.trim())
  );

  const normalizedGroup = normalizeText(groupName);

  const allowedGroup =
    allowedGroups.includes("*") ||
    allowedGroups.some(
      (item) =>
        normalizeText(item) === normalizedGroup
    );

  const ownerId = String(
    process.env.ZALO_AUTO_IMPORT_OWNER_ID || ""
  ).trim();

  return {
    enabled,
    dryRun,
    minScore,
    minImages,
    allowedGroups,
    allowedGroup,
    ownerId,
  };
}

export function evaluateZaloImportQuality(params: {
  roomPayload: Record<string, any>;
  detailPayload: Record<string, any>;
  sourceFieldMap?: Record<string, any>;
  inheritedFieldMap?: Record<string, any>;
  matchedRoom?: any | null;
  importIssues?: ZaloImportIssueLike[];
  expectedImageCount: number;
  expectedVideoCount: number;
  importedImageCount: number;
  importedVideoCount: number;
  groupName: string;
  settings?: ZaloAutoImportSettings;
}): ZaloImportQuality {
  const room = params.roomPayload || {};
  const detail = params.detailPayload || {};
  const sourceFieldMap =
    params.sourceFieldMap || {};
  const inheritedFieldMap =
    params.inheritedFieldMap || {};
  const issues = Array.isArray(params.importIssues)
    ? params.importIssues
    : [];

  const settings =
    params.settings ||
    readZaloAutoImportSettings(
      params.groupName
    );

  const blockers: ZaloQualityBlocker[] = [];
  const warnings: string[] = [];

  function addBlocker(
    code: string,
    message: string
  ) {
    if (
      blockers.some(
        (item) => item.code === code
      )
    ) {
      return;
    }

    blockers.push({ code, message });
  }

  function addWarning(message: string) {
    const normalized = String(message || "").trim();
    if (!normalized) return;
    warnings.push(normalized);
  }

  const roomCode = String(
    room.room_code || ""
  ).trim();

  const houseNumber = String(
    room.house_number || ""
  ).trim();

  const address = String(
    room.address || ""
  ).trim();

  const district = String(
    room.district || ""
  ).trim();

  const price = Number(room.price);

  const priceValid =
    Number.isFinite(price) &&
    price >= MIN_ROOM_PRICE_VND &&
    price <= MAX_ROOM_PRICE_VND;

  const expectedImages = Math.max(
    0,
    Math.round(
      Number(params.expectedImageCount) || 0
    )
  );

  const expectedVideos = Math.max(
    0,
    Math.round(
      Number(params.expectedVideoCount) || 0
    )
  );

  const importedImages = Math.max(
    0,
    Math.round(
      Number(params.importedImageCount) || 0
    )
  );

  const importedVideos = Math.max(
    0,
    Math.round(
      Number(params.importedVideoCount) || 0
    )
  );

  const expectedMedia =
    expectedImages + expectedVideos;

  const importedMedia =
    importedImages + importedVideos;

  if (!roomCode) {
    addBlocker(
      "MISSING_ROOM_CODE",
      "Thiếu mã phòng."
    );
  }

  if (!houseNumber) {
    addBlocker(
      "MISSING_HOUSE_NUMBER",
      "Thiếu số nhà."
    );
  }

  if (!address) {
    addBlocker(
      "MISSING_ADDRESS",
      "Thiếu tên đường."
    );
  }

  if (!district) {
    addBlocker(
      "MISSING_DISTRICT",
      "Thiếu quận/huyện."
    );
  }

  if (!priceValid) {
    addBlocker(
      "INVALID_PRICE",
      "Giá phòng phải nằm trong khoảng 2.000.000–50.000.000 đồng."
    );
  }

  if (importedMedia <= 0) {
    addBlocker(
      "NO_MEDIA",
      "Không có ảnh hoặc video hợp lệ."
    );
  }

  if (
    expectedImages > 0 &&
    importedImages !== expectedImages
  ) {
    addBlocker(
      "IMAGE_IMPORT_INCOMPLETE",
      `Ảnh import không đầy đủ: dự kiến ${expectedImages}, đã lưu ${importedImages}.`
    );
  }

  if (
    expectedVideos > 0 &&
    importedVideos !== expectedVideos
  ) {
    addBlocker(
      "VIDEO_IMPORT_INCOMPLETE",
      `Video import không đầy đủ: dự kiến ${expectedVideos}, đã lưu ${importedVideos}.`
    );
  }

  if (params.matchedRoom) {
    addBlocker(
      "DUPLICATE_ROOM",
      "Phòng đã trùng số nhà + đường + quận + mã phòng."
    );
  }

  const normalizedIssues = issueHaystack(issues);

  const readerErrors = normalizedIssues.filter(
    (issue) =>
      String(issue.level || "").toLowerCase() ===
      "error"
  );

  if (readerErrors.length > 0) {
    addBlocker(
      "IMPORT_ERROR",
      `Reader/media có ${readerErrors.length} lỗi.`
    );
  }

  const hardIssuePatterns: Array<{
    code: string;
    message: string;
    patterns: RegExp[];
  }> = [
    {
      code: "MEDIA_ONLY",
      message:
        "Reader chỉ tìm thấy media nhưng không tìm thấy marker phòng.",
      patterns: [/\bmedia only\b/, /\bmedia_only\b/],
    },
    {
      code: "ROOM_CODE_MISSING",
      message:
        "Reader cảnh báo thiếu mã phòng.",
      patterns: [
        /\broom code missing\b/,
        /\broom_code_missing\b/,
      ],
    },
    {
      code: "NO_HOUSE_INFO",
      message:
        "Reader không tìm thấy thông tin tòa nhà.",
      patterns: [
        /\bno house info\b/,
        /\bno_house_info\b/,
      ],
    },
    {
      code: "ORPHAN_MEDIA",
      message:
        "Media mồ côi đã được gắn sang marker khác; cần duyệt thủ công.",
      patterns: [
        /\borphan media\b/,
        /\borphan_media\b/,
      ],
    },
    {
      code: "ALBUM_INCOMPLETE",
      message:
        "Album ảnh chưa đầy đủ.",
      patterns: [
        /\balbum incomplete\b/,
        /\balbum_incomplete\b/,
        /khong day du.*anh/,
        /anh.*khong day du/,
      ],
    },
  ];

  for (const issue of normalizedIssues) {
    for (const rule of hardIssuePatterns) {
      if (
        matchesAny(
          issue.normalized,
          rule.patterns
        )
      ) {
        addBlocker(rule.code, rule.message);
      }
    }

    if (
      matchesAny(issue.normalized, [
        /\bsoft timeline fallback\b/,
        /\bsoft_timeline_fallback\b/,
      ])
    ) {
      addWarning(
        "Reader đã dùng SOFT_TIMELINE_FALLBACK; cần theo dõi độ chính xác ghép phòng."
      );
    }

    if (
      String(issue.level || "").toLowerCase() ===
      "warning"
    ) {
      addWarning(
        String(issue.message || "").trim()
      );
    }
  }

  const inheritedFields = Object.keys(
    inheritedFieldMap
  ).filter((field) =>
    hasValue(inheritedFieldMap[field])
  );

  if (inheritedFields.length > 0) {
    addWarning(
      `Có ${inheritedFields.length} trường được tự điền từ phòng cùng nhà.`
    );
  }

  if (!settings.allowedGroup) {
    addBlocker(
      "GROUP_NOT_ALLOWED",
      "Nhóm Zalo chưa nằm trong ZALO_AUTO_IMPORT_ALLOWED_GROUPS."
    );
  }

  if (
    importedImages < settings.minImages
  ) {
    addBlocker(
      "MIN_IMAGES_NOT_MET",
      `Cần tối thiểu ${settings.minImages} ảnh để tự đăng; hiện có ${importedImages}.`
    );
  }

  if (!settings.ownerId) {
    addBlocker(
      "AUTO_OWNER_MISSING",
      "Chưa cấu hình ZALO_AUTO_IMPORT_OWNER_ID."
    );
  }

  const roomCodeScore = roomCode ? 15 : 0;

  let addressScore = 0;
  let addressReason = "Thiếu số nhà và tên đường.";

  if (houseNumber && address) {
    addressScore = 15;
    addressReason = "Có đủ số nhà và tên đường.";
  } else if (houseNumber || address) {
    addressScore = 7;
    addressReason =
      "Địa chỉ mới có một phần; cần đủ số nhà và tên đường.";
  }

  const districtScore = district ? 5 : 0;
  const priceScore = priceValid ? 15 : 0;

  let mediaScore = 0;
  let mediaReason = "Không có media hợp lệ.";

  if (importedMedia > 0) {
    if (expectedMedia <= 0) {
      mediaScore = 18;
      mediaReason =
        `Đã lưu ${importedMedia} media nhưng Reader không khai báo tổng dự kiến.`;
    } else {
      const ratio = Math.min(
        1,
        importedMedia / expectedMedia
      );

      mediaScore = Math.round(20 * ratio);
      mediaReason =
        `Đã lưu ${importedMedia}/${expectedMedia} media dự kiến.`;
    }
  }

  let mediaBindingScore = 10;
  let mediaBindingReason =
    "Không phát hiện cảnh báo ghép marker-media.";

  const hasSoftFallback = normalizedIssues.some(
    (issue) =>
      matchesAny(issue.normalized, [
        /\bsoft timeline fallback\b/,
        /\bsoft_timeline_fallback\b/,
      ])
  );

  const hasHardMediaBindingIssue = blockers.some(
    (blocker) =>
      [
        "MEDIA_ONLY",
        "ORPHAN_MEDIA",
        "ALBUM_INCOMPLETE",
        "IMAGE_IMPORT_INCOMPLETE",
        "VIDEO_IMPORT_INCOMPLETE",
      ].includes(blocker.code)
  );

  if (hasHardMediaBindingIssue) {
    mediaBindingScore = 0;
    mediaBindingReason =
      "Có lỗi/cảnh báo nghiêm trọng khi ghép marker-media.";
  } else if (hasSoftFallback) {
    mediaBindingScore = 5;
    mediaBindingReason =
      "Đã dùng SOFT_TIMELINE_FALLBACK.";
  } else if (
    normalizedIssues.some(
      (issue) =>
        String(issue.level || "").toLowerCase() ===
        "warning"
    )
  ) {
    mediaBindingScore = 8;
    mediaBindingReason =
      "Có cảnh báo Reader nhưng chưa phải lỗi nghiêm trọng.";
  }

  const roomType = String(
    room.room_type || ""
  ).trim();

  const roomTypeScore = roomType ? 5 : 0;

  const status = normalizeText(room.status);
  const statusValid =
    status.includes("trong") ||
    status.includes("da thue") ||
    status.includes("het phong");

  const statusScore = statusValid ? 5 : 0;

  const feeFields = [
    "electric_fee_value",
    "water_fee_value",
    "service_fee_value",
    "parking_fee_value",
    "other_fee_value",
  ];

  const feeCount = feeFields.filter((field) =>
    hasValue(detail[field])
  ).length;

  const feesScore = Math.min(5, feeCount);

  const hasContact =
    hasValue(room.zalo_phone) ||
    hasValue(room.link_zalo);

  const contactScore = hasContact ? 3 : 0;

  const policyFields = [
    "allow_pet",
    "allow_cat",
    "allow_dog",
    "no_pet",
    "short_term",
    "long_term",
  ];

  const hasPolicy =
    hasValue(room.chinh_sach) ||
    hasValue(detail.other_amenities) ||
    policyFields.some(
      (field) =>
        hasValue(sourceFieldMap[field]) ||
        hasValue(inheritedFieldMap[field])
    );

  const policyScore = hasPolicy ? 2 : 0;

  const breakdown: ZaloImportQuality["breakdown"] = {
    room_code: makeBreakdownItem(
      "Mã phòng",
      roomCodeScore,
      15,
      roomCode
        ? "Có mã phòng hợp lệ."
        : "Thiếu mã phòng."
    ),
    address: makeBreakdownItem(
      "Địa chỉ",
      addressScore,
      15,
      addressReason
    ),
    district: makeBreakdownItem(
      "Quận/huyện",
      districtScore,
      5,
      district
        ? `Đã nhận diện ${district}.`
        : "Thiếu quận/huyện."
    ),
    price: makeBreakdownItem(
      "Giá phòng",
      priceScore,
      15,
      priceValid
        ? "Giá nằm trong khoảng 2–50 triệu."
        : "Giá thiếu hoặc ngoài khoảng 2–50 triệu."
    ),
    media: makeBreakdownItem(
      "Ảnh/video",
      mediaScore,
      20,
      mediaReason
    ),
    media_binding: makeBreakdownItem(
      "Ghép marker-media",
      mediaBindingScore,
      10,
      mediaBindingReason
    ),
    room_type: makeBreakdownItem(
      "Loại phòng",
      roomTypeScore,
      5,
      roomType
        ? `Đã nhận diện ${roomType}.`
        : "Chưa nhận diện loại phòng."
    ),
    status: makeBreakdownItem(
      "Trạng thái",
      statusScore,
      5,
      statusValid
        ? "Có trạng thái phòng hợp lệ."
        : "Chưa nhận diện trạng thái phòng."
    ),
    fees: makeBreakdownItem(
      "Chi phí",
      feesScore,
      5,
      `Có ${feeCount}/5 nhóm phí chính.`
    ),
    contact: makeBreakdownItem(
      "Liên hệ",
      contactScore,
      3,
      hasContact
        ? "Có số Zalo/điện thoại hoặc link Zalo."
        : "Chưa có thông tin liên hệ."
    ),
    policy: makeBreakdownItem(
      "Chính sách/tiện ích",
      policyScore,
      2,
      hasPolicy
        ? "Có chính sách hoặc tiện ích."
        : "Chưa có chính sách/tiện ích."
    ),
  };

  const score = Object.values(breakdown).reduce(
    (sum, item) => sum + item.score,
    0
  );

  if (score < settings.minScore) {
    addBlocker(
      "SCORE_BELOW_THRESHOLD",
      `Điểm ${score}/100 thấp hơn ngưỡng tự đăng ${settings.minScore}/100.`
    );
  }

  const dedupedWarnings = uniqueStrings(warnings);
  const eligible = blockers.length === 0;

  return {
    version: "quality-v1",
    score,
    score_fraction: score / 100,
    eligible,
    breakdown,
    blockers,
    warnings: dedupedWarnings,
    auto_import: {
      enabled: settings.enabled,
      dry_run: settings.dryRun,
      min_score: settings.minScore,
      min_images: settings.minImages,
      allowed_group: settings.allowedGroup,
      owner_id_configured: Boolean(
        settings.ownerId
      ),
      would_publish: eligible,
      published: false,
      published_room_id: null,
      publish_error: null,
    },
  };
}
