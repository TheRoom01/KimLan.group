import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync =
  promisify(execFile);

type Config = {
  webBaseUrl: string;
  internalSecret: string;
  scanIntervalMs: number;
  maxMessagesPerGroup: number;
  maxImagesPerBatch: number;
  maxFollowingImageMessages: number;
  groups: string[];
  roomTextKeywords: string[];


    /**
   * Số ngày giữ lại các session debug.
   */
  debugRetentionDays?: number;

  /**
   * Số session debug tối đa được giữ lại.
   */
  debugMaxSessions?: number;

  networkDebug?: boolean;
  networkDebugOnly?: boolean;
  networkLogMaxBodyChars?: number;
  networkCaptureAllHttpBodies?: boolean;
  networkCaptureAllWebSocketFrames?: boolean;
  networkCaptureKeywords?: string[];

  /**
   * Khi true:
   * - Chỉ mở nhóm.
   * - Cuộn để Zalo tải tin nhắn.
   * - Xuất IndexedDB.
   /*
    * Khi indexedDbImportEnabled = false:
    * - Chỉ debug và tạo preview.
    *
    * Khi indexedDbImportEnabled = true:
    * - Gửi phòng vào API Chờ duyệt.
    * - Ghi sourceHash vào state sau khi thành công.
    *
   */
    indexedDbDebug?: boolean;
  indexedDbDebugOnly?: boolean;
  indexedDbSampleLimit?: number;
  indexedDbRecordMaxStringChars?: number;

   indexedDbGroupExport?: boolean;
  indexedDbGroupScanLimit?: number;
  indexedDbGroupMessageLimit?: number;

  /**
   * Lấy thêm message trước message đang hiển thị.
   * Đơn vị mili giây.
   */
  indexedDbGroupContextBeforeMs?: number;

  /**
   * Lấy thêm message sau message đang hiển thị.
   * Đơn vị mili giây.
   */
  indexedDbGroupContextAfterMs?: number;

  /**
   * Mỗi lần cuộn lên bao nhiêu phần chiều cao khung chat.
   *
   * 0.85 = cuộn lên 85% chiều cao khung chat.
   */
  indexedDbScrollStepRatio?: number;

  /**
   * Thời gian chờ sau mỗi lần cuộn để Zalo tải
   * và ghi message vào IndexedDB.
   */
  indexedDbScrollWaitMs?: number;

  /**
   * Thời gian chờ ổn định trước mỗi lần kiểm tra IndexedDB.
   */
  indexedDbScrollSettleMs?: number;

  /**
   * Số lần cuộn trong một batch trước khi đọc lại IndexedDB.
   */
  indexedDbScrollStepsPerBatch?: number;

  /**
   * Số batch tối đa, chỉ dùng làm giới hạn an toàn.
   */
  indexedDbScrollMaxBatches?: number;

  /**
   * Dừng cuộn khi phát hiện một phòng đã có trong state.json.
   */
  indexedDbStopOnKnownRoom?: boolean;

    /**
   * Tạo file preview phòng từ message IndexedDB.
   * Chưa gửi dữ liệu lên API.
   */
  indexedDbRoomPreview?: boolean;

  /**
   * Khoảng cách tối đa giữa ảnh và marker phòng.
   * Đơn vị mili giây.
   */
  indexedDbRoomPreviewMaxGapMs?: number;

  /**
 * Gửi các phòng đã ghép từ IndexedDB
 * vào API Zalo Import.
 *
 * API chỉ tạo bản Chờ duyệt,
 * chưa tạo phòng chính thức.
 */
indexedDbImportEnabled?: boolean;

  selectors: {
    searchBox: string;
    messageItems: string;
    messageText?: string;
    messageSender?: string;
    imageNodes: string;
  };
};

type Msg = {
  text: string;
  senderName: string;
  imageSrcs: string[];
  sourceHash: string;
  top: number;
};

type IndexedDbGroupRef = {
  groupId: string;
  databaseName: string;
};

type IndexedDbGroupMessage = {
  msgId: string;
  cliMsgId: string;
  msgType: number;
  kind: "text" | "image" | "other";
  text: string;
  imageUrls: string[];
  groupLayoutId:
    | string
    | number
    | null;
  imageIndex:
    | string
    | number
    | null;
  totalImages:
    | string
    | number
    | null;
  sendDttm: number;
  serverTime: number;
  fromUid: string;
  toUid: string;
  senderName: string;
  originMsgType: string;

    videoUrls: string[];
    videoThumbUrls: string[];

    /**
     * Một phần payload video để dò đúng tên field.
     * Đã giới hạn kích thước.
     */
    videoDebug?: any;
  };

type IndexedDbRoomPreviewAlbum = {
  albumKey: string;
  groupLayoutId:
    | string
    | number
    | null;
  expectedImageCount: number | null;
  actualImageCount: number;
  complete: boolean;
  imageMessageIds: string[];
  imageUrls: string[];
};

type IndexedDbClosedBuildingBlock = {
  blockId: string;
  blockIndex: number;

  startSeparatorMessageId: string;
  endSeparatorMessageId: string;

  messages: IndexedDbGroupMessage[];
};

type IndexedDbRoomPreview = {
  sourceHash: string;

  /*
   * Block tòa nhà mà phòng thuộc về.
   */
  buildingBlockId: string;
  buildingBlockIndex: number;

  groupId: string;
  senderUid: string;

  /*
   * Thông tin dùng chung của tòa nhà.
   */
  houseInfoText: string;

  /*
   * Chỉ text marker của phòng.
   * Không lấy mô tả sau marker.
   */
  markerText: string;

  fullText: string;

  markerMessageId: string;
  markerTimestamp: number;

  albums: IndexedDbRoomPreviewAlbum[];
  imageUrls: string[];
  imageMessageIds: string[];

  hasVideo: boolean;
  videoMessageIds: string[];
  videoUrls: string[];
  videoThumbUrls: string[];

  videos: IndexedDbVideoPayload[];

  warnings: string[];
};

type IndexedDbVideoPayload = {
  sourceUrl: string;
  thumbnailUrl?: string;

  durationMs?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
};

type ReaderIssue = {
  level:
    | "warning"
    | "error";

  index:
    | number
    | null;

  message: string;

  sourceUrl?:
    | string
    | null;
};

type RoomUnit = {
  text: string;
  senderName: string;
  imageSrcs: string[];
  sourceHash: string;

  sourceMessageId?: string;
  sentAt?: string;

  videos?: IndexedDbVideoPayload[];

  /*
   * Tổng số media dự kiến theo dữ liệu IndexedDB,
   * có thể lớn hơn số URL thực tế thu được.
   */
  expectedImageCount?: number;
  expectedVideoCount?: number;

  /*
   * Lỗi Reader phát hiện trước khi gọi API.
   */
  readerIssues?: ReaderIssue[];
};

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "tools/zalo-reader/config.json");
const STATE_PATH = path.join(ROOT, "tools/zalo-reader/state.json");
const PROFILE_DIR = path.join(ROOT, ".zalo-reader/profile");

const ZALO_READER_RUNTIME_DIR =
  path.join(
    ROOT,
    ".zalo-reader"
  );

const NETWORK_ROOT_DIR =
  path.join(
    ZALO_READER_RUNTIME_DIR,
    "network"
  );

/*
 * Chứa snapshot mới nhất khi Reader chạy bình thường.
 * Các lần quét sau sẽ ghi đè file cũ.
 */
const LATEST_OUTPUT_DIR =
  path.join(
    ZALO_READER_RUNTIME_DIR,
    "latest"
  );

const NETWORK_SESSION_ID =
  new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

/*
 * Chỉ nên dùng khi bật networkDebug
 * hoặc indexedDbDebug.
 */
const NETWORK_LOG_DIR =
  path.join(
    NETWORK_ROOT_DIR,
    NETWORK_SESSION_ID
  );

function getDjxlExecutable() {
  const configuredPath = String(
    process.env.DJXL_PATH || ""
  ).trim();

  if (configuredPath) {
    if (!fs.existsSync(configuredPath)) {
      throw new Error(
        `DJXL_PATH không tồn tại: ${configuredPath}`
      );
    }

    return configuredPath;
  }

  return "djxl";
}

async function decodeJxlBufferToPng(
  sourceBuffer: Buffer
): Promise<Buffer> {
  const tempDirectory =
    await fs.promises.mkdtemp(
      path.join(
        os.tmpdir(),
        "kimlan-zalo-jxl-"
      )
    );

  const inputPath =
    path.join(
      tempDirectory,
      "source.jxl"
    );

  const outputPath =
    path.join(
      tempDirectory,
      "decoded.png"
    );

  try {
    await fs.promises.writeFile(
      inputPath,
      sourceBuffer
    );

    try {
      await execFileAsync(
        getDjxlExecutable(),
        [
          inputPath,
          outputPath,
        ],
        {
          windowsHide: true,
          timeout: 60_000,
          maxBuffer:
            10 * 1024 * 1024,
        }
      );
    } catch (error: any) {
      throw new Error(
        [
          "djxl không giải mã được ảnh.",

          error?.stderr
            ? String(error.stderr)
            : "",

          error?.message
            ? String(error.message)
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
    }

    const pngBuffer =
      await fs.promises.readFile(
        outputPath
      );

    if (pngBuffer.length === 0) {
      throw new Error(
        "djxl tạo ra file PNG rỗng"
      );
    }

    const isPng =
      pngBuffer.length >= 8 &&
      pngBuffer[0] === 0x89 &&
      pngBuffer[1] === 0x50 &&
      pngBuffer[2] === 0x4e &&
      pngBuffer[3] === 0x47 &&
      pngBuffer[4] === 0x0d &&
      pngBuffer[5] === 0x0a &&
      pngBuffer[6] === 0x1a &&
      pngBuffer[7] === 0x0a;

    if (!isPng) {
      throw new Error(
        "Kết quả từ djxl không phải PNG hợp lệ"
      );
    }

    return pngBuffer;
  } finally {
    await fs.promises
      .rm(
        tempDirectory,
        {
          recursive: true,
          force: true,
        }
      )
      .catch(() => {});
  }
}

function loadDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readConfig(): Config {
  loadDotEnvLocal();

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  config.webBaseUrl =
    process.env.ZALO_READER_WEB_BASE_URL ||
    config.webBaseUrl;

  config.internalSecret =
    process.env.ZALO_READER_INTERNAL_SECRET ||
    config.internalSecret;

  if (!config.internalSecret) {
    throw new Error("Missing ZALO_READER_INTERNAL_SECRET");
  }

  return config;
}

function readState(): Record<string, true> {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeState(state: Record<string, true>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function hash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sleep(
  milliseconds: number
): Promise<void> {
  const safeMilliseconds =
    Math.max(
      0,
      Number(milliseconds) || 0
    );

  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        safeMilliseconds
      );
    }
  );
}

function isRoomText(text: string, keywords: string[]) {
  const s = text.toLowerCase();
  return keywords.some((k) => s.includes(k.toLowerCase()));
}

/**
 * Dấu phân cách giữa hai tòa nhà.
 *
 * Mỗi dấu vừa:
 * - đóng block tòa nhà trước;
 * - mở block tòa nhà tiếp theo.
 *
 * Chấp nhận từ 5 dấu ➖ mỗi bên trở lên,
 * nhưng bắt buộc phải có /// ở giữa.
 */
function isBlockSeparator(text: string) {
  return isBuildingSeparatorText(text);
}

function isHouseInfoText(text: string) {
  const s = String(text || "").toLowerCase();

  return (
    s.includes("địa chỉ") ||
    s.includes("dia chi") ||
    s.includes("đường") ||
    s.includes("duong") ||
    s.includes("phường") ||
    s.includes("phuong") ||
    s.includes("quận") ||
    s.includes("quan") ||
    s.includes("chính sách tòa nhà") ||
    s.includes("chinh sach toa nha")
  );
}

function isRoomMarkerText(text: string) {
  const raw = String(text || "").trim();
  const s = raw.toLowerCase();

  if (!raw) return false;

  // Không coi form thông tin nhà dài là marker phòng
  if (isBuildingInfoText(raw)) {
    return false;
  }
  if (raw.length > 180) return false;

  const hasRoomWord =
    s.includes("trống") ||
    s.includes("trong") ||
    s.includes("mã") ||
    s.includes("ma") ||
    s.includes("phòng") ||
    s.includes("phong") ||
    /\b\d{2,4}\b/.test(s);

  const hasPrice =
    /\b\d+([.,]\d+)?\s*(tr|trieu|triệu)\b/i.test(s) ||
    /\b\d+\s*tr\d*\b/i.test(s) ||
    /\b\d{3,5}\s*k\b/i.test(s);

  return hasRoomWord && hasPrice;
}

function isNoiseMessage(text: string) {
  const t = String(text || "").trim();

  if (!t) return true;

  if (/^(\/-[a-zA-Z0-9_-]+|:\>|:o|:-\(\(|:-h|\s)+$/i.test(t)) {
    return true;
  }

  const lettersAndNumbers = t.replace(/[^\p{L}\p{N}]/gu, "");
  if (lettersAndNumbers.length < 3) return true;

  return false;
}

function makeStableText(text: string) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSafeDirectoryName(
  input: string
) {
  const normalized =
    makeStableText(input)
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 80);

  return (
    normalized ||
    "unknown-group"
  );
}

/**
 * Chế độ bình thường:
 * .zalo-reader/latest/{groupName}
 *
 * Chế độ debug:
 * .zalo-reader/network/{sessionId}/{groupName}
 */
function getReaderOutputDir(
  config: Config,
  groupName?: string
) {
  const useDebugSession =
    Boolean(
      config.networkDebug ||
      config.indexedDbDebug
    );

  const baseDirectory =
    useDebugSession
      ? NETWORK_LOG_DIR
      : LATEST_OUTPUT_DIR;

  const outputDirectory =
    groupName
      ? path.join(
          baseDirectory,
          makeSafeDirectoryName(
            groupName
          )
        )
      : baseDirectory;

  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true,
    }
  );

  return outputDirectory;
}

function cleanupOldNetworkSessions(
  config: Config
) {
  if (
    !fs.existsSync(
      NETWORK_ROOT_DIR
    )
  ) {
    return;
  }

  const rawRetentionDays =
    Number(
      config.debugRetentionDays ??
        7
    );

  const retentionDays =
    Math.max(
      1,
      Math.min(
        90,
        Number.isFinite(
          rawRetentionDays
        )
          ? rawRetentionDays
          : 7
      )
    );

  const rawMaxSessions =
    Number(
      config.debugMaxSessions ??
        10
    );

  const maxSessions =
    Math.max(
      1,
      Math.min(
        100,
        Number.isFinite(
          rawMaxSessions
        )
          ? Math.floor(
              rawMaxSessions
            )
          : 10
      )
    );

  const maxAgeMs =
    retentionDays *
    24 *
    60 *
    60 *
    1000;

  const now =
    Date.now();

  const sessions =
    fs.readdirSync(
      NETWORK_ROOT_DIR,
      {
        withFileTypes: true,
      }
    )
      .filter(
        (entry) =>
          entry.isDirectory()
      )
      .map((entry) => {
        const directoryPath =
          path.join(
            NETWORK_ROOT_DIR,
            entry.name
          );

        const stats =
          fs.statSync(
            directoryPath
          );

        return {
          name: entry.name,
          directoryPath,
          modifiedAt:
            stats.mtimeMs,
        };
      })
      .sort(
        (a, b) =>
          b.modifiedAt -
          a.modifiedAt
      );

  let deletedCount = 0;

  for (
    let index = 0;
    index < sessions.length;
    index++
  ) {
    const session =
      sessions[index];

    /*
     * Không xóa session hiện tại.
     */
    if (
      session.name ===
      NETWORK_SESSION_ID
    ) {
      continue;
    }

    const expiredByAge =
      now -
        session.modifiedAt >
      maxAgeMs;

    const exceededLimit =
      index >=
      maxSessions;

    if (
      !expiredByAge &&
      !exceededLimit
    ) {
      continue;
    }

    fs.rmSync(
      session.directoryPath,
      {
        recursive: true,
        force: true,
      }
    );

    deletedCount += 1;
  }

  if (deletedCount > 0) {
    console.log(
      `Đã dọn ${deletedCount} session debug cũ.`
    );
  }
}

const BUILDING_SEPARATOR_PATTERN =
  /^➖{5,}\/\/\/➖{5,}$/;

function normalizeBuildingSeparatorText(
  input: string
) {
  return String(input || "")
    .replace(/\s+/g, "")
    .trim();
}

function isBuildingSeparatorText(
  input: string
) {
  const compact =
    normalizeBuildingSeparatorText(
      input
    );

  return BUILDING_SEPARATOR_PATTERN.test(
    compact
  );
}

/**
 * Nhận diện các message chứa thông tin dùng chung
 * cho toàn bộ tòa nhà.
 *
 * Không dùng hàm này để nhận diện phòng.
 */
function isBuildingAmenityText(
  input: string
) {
  const normalized =
    makeStableText(input);

  if (!normalized) {
    return false;
  }

  const textSignals = [
    // Máy giặt
    "giat chung",
    "may giat chung",
    "giat rieng",
    "may giat rieng",
    "khu vuc giat phoi",
    "khu giat phoi",

    // Thang
    "thang may",
    "thang bo",

    // Pet
    "thu cung",
    "pet",
    "nuoi meo",
    "nuoi cho",
    "cho nuoi",
    "duoc nuoi",

    // Xe
    "gui xe",
    "giu xe",
    "de xe",
    "bai xe",
    "ham xe",
    "xe ben ngoai",
    "xe ngoai",
    "khong co cho de xe",
    "khong giu xe",
  ];

  if (
    textSignals.some((signal) =>
      normalized.includes(signal)
    )
  ) {
    return true;
  }

  /*
   * Ví dụ:
   * Xe: free 2 xe
   * Xe : 100k/chiếc
   */
  if (
    /\bxe\s*:/i.test(normalized)
  ) {
    return true;
  }

  if (
    /\bfree\s*\d*\s*xe\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function isBuildingInfoText(
  input: string
) {
  return (
    isHouseInfoText(input) ||
    isBuildingAmenityText(input)
  );
}

const DEFAULT_NETWORK_KEYWORDS = [
  "message",
  "messages",
  "msg",
  "chat",
  "thread",
  "group",
  "conversation",
  "attachment",
  "attachments",
  "photo",
  "photos",
  "image",
  "images",
  "media",
  "file",
  "sender",
  "receiver",
  "timestamp",
  "msgid",
  "messageid",
  "climsgid",
  "uid",
];

const SENSITIVE_LOG_KEY =
  /authorization|cookie|set-cookie|access.?token|refresh.?token|password|secret|credential|session.?token/i;

function getNetworkMaxChars(config: Config) {
  const value = Number(config.networkLogMaxBodyChars || 120_000);

  if (!Number.isFinite(value)) return 120_000;

  return Math.max(5_000, Math.min(value, 1_000_000));
}

function truncateLogText(input: string, maxChars: number) {
  const text = String(input || "");

  if (text.length <= maxChars) return text;

  return `${text.slice(0, maxChars)}\n...[TRUNCATED ${text.length - maxChars} CHARS]`;
}

function redactInlineSecrets(input: string) {
  return String(input || "")
    .replace(
      /(authorization|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[^,\s"'&]+/gi,
      "$1=[REDACTED]"
    )
    .replace(
      /(bearer)\s+[A-Za-z0-9._~+/=-]+/gi,
      "$1 [REDACTED]"
    );
}

function sanitizeLogValue(
  value: any,
  maxStringChars = 20_000,
  depth = 0
): any {
  if (depth > 12) return "[MAX_DEPTH]";

  if (value == null) return value;

  if (typeof value === "string") {
    return redactInlineSecrets(
      truncateLogText(value, maxStringChars)
    );
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) =>
        sanitizeLogValue(item, maxStringChars, depth + 1)
      );
  }

  if (typeof value === "object") {
    const result: Record<string, any> = {};

    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_LOG_KEY.test(key)) {
        result[key] = "[REDACTED]";
        continue;
      }

      result[key] = sanitizeLogValue(
        item,
        maxStringChars,
        depth + 1
      );
    }

    return result;
  }

  return String(value);
}

function parseAndSanitizeNetworkText(
  input: string,
  maxChars: number
) {
  const raw = String(input || "");

  if (!raw) return "";

  /*
   * Chỉ thử JSON.parse khi payload không quá lớn.
   * Nếu không phải JSON thì lưu text đã cắt và che token.
   */
  if (raw.length <= maxChars * 2) {
    try {
      const parsed = JSON.parse(raw);

      return sanitizeLogValue(parsed);
    } catch {
      // Không phải JSON, xử lý như text.
    }
  }

  return redactInlineSecrets(
    truncateLogText(raw, maxChars)
  );
}

function appendNetworkLog(
  fileName: string,
  payload: Record<string, any>
) {
  fs.mkdirSync(NETWORK_LOG_DIR, {
    recursive: true,
  });

  const filePath = path.join(
    NETWORK_LOG_DIR,
    fileName
  );

  fs.appendFileSync(
    filePath,
    `${JSON.stringify(payload)}\n`,
    "utf8"
  );
}

function networkPayloadLooksRelevant(
  params: {
    url?: string;
    requestBody?: string;
    responseBody?: string;
    config: Config;
  }
) {
  const {
    url = "",
    requestBody = "",
    responseBody = "",
    config,
  } = params;

  const keywords =
    Array.isArray(config.networkCaptureKeywords) &&
    config.networkCaptureKeywords.length > 0
      ? config.networkCaptureKeywords
      : DEFAULT_NETWORK_KEYWORDS;

  const haystack = [
    url,
    requestBody.slice(0, 100_000),
    responseBody.slice(0, 100_000),
  ]
    .join("\n")
    .toLowerCase();

  return keywords.some((keyword) =>
    haystack.includes(String(keyword).toLowerCase())
  );
}

function installNetworkDebug(
  page: Page,
  config: Config,
  getActiveGroupName: () => string
) {
  if (!config.networkDebug) return;

  fs.mkdirSync(NETWORK_LOG_DIR, {
    recursive: true,
  });

  appendNetworkLog("session.jsonl", {
    type: "session_start",
    capturedAt: new Date().toISOString(),
    networkSessionId: NETWORK_SESSION_ID,
  });

  console.log(
    `Network debug đang ghi tại: ${NETWORK_LOG_DIR}`
  );

  /*
   * Ghi các response XHR/fetch.
   */
  page.on("response", async (response) => {
    try {
      const request = response.request();
      const resourceType = request.resourceType();

      if (
        resourceType !== "xhr" &&
        resourceType !== "fetch"
      ) {
        return;
      }

      const url = response.url();
      const status = response.status();
      const method = request.method();
      const headers = response.headers();
      const contentType =
        headers["content-type"] || "";

      const requestBody =
        request.postData() || "";

      const baseLog = {
        type: "http_response",
        capturedAt: new Date().toISOString(),
        groupName: getActiveGroupName() || "",
        method,
        status,
        resourceType,
        contentType,
        url,
      };

      /*
       * File index chỉ chứa metadata, giúp xem endpoint nào
       * được gọi mà không cần mở payload lớn.
       */
      appendNetworkLog(
        "http-index.jsonl",
        baseLog
      );

      const canReadAsText =
        /json|text|javascript|xml|octet-stream/i.test(
          contentType
        );

      let responseBody = "";

      if (canReadAsText) {
        responseBody = await response
          .text()
          .catch(() => "");
      }

      const relevant = networkPayloadLooksRelevant({
        url,
        requestBody,
        responseBody,
        config,
      });

      if (
        !config.networkCaptureAllHttpBodies &&
        !relevant
      ) {
        return;
      }

      const maxChars =
        getNetworkMaxChars(config);

      appendNetworkLog(
        "http-payloads.jsonl",
        {
          ...baseLog,

          requestBody:
            parseAndSanitizeNetworkText(
              requestBody,
              maxChars
            ),

          responseBody:
            parseAndSanitizeNetworkText(
              responseBody,
              maxChars
            ),
        }
      );
    } catch (error: any) {
      appendNetworkLog("network-errors.jsonl", {
        type: "http_capture_error",
        capturedAt: new Date().toISOString(),
        groupName: getActiveGroupName() || "",
        error:
          error?.message || String(error),
      });
    }
  });

  /*
   * Ghi WebSocket.
   */
  page.on("websocket", (ws) => {
    const socketId = hash(
      [
        ws.url(),
        Date.now(),
        Math.random(),
      ].join("|")
    ).slice(0, 16);

    appendNetworkLog(
      "websocket-index.jsonl",
      {
        type: "websocket_open",
        capturedAt: new Date().toISOString(),
        groupName: getActiveGroupName() || "",
        socketId,
        url: ws.url(),
      }
    );

    function captureFrame(
      direction: "sent" | "received",
      payload: string | Buffer
    ) {
      try {
        const maxChars =
          getNetworkMaxChars(config);

        let encoding:
          | "utf8"
          | "base64" = "utf8";

        let rawPayload = "";
        let byteLength = 0;

        if (typeof payload === "string") {
          rawPayload = payload;
          byteLength = Buffer.byteLength(
            payload,
            "utf8"
          );
        } else {
          const buffer = Buffer.from(payload);

          encoding = "base64";
          byteLength = buffer.length;
          rawPayload = buffer.toString("base64");
        }

        const baseFrame = {
          type: "websocket_frame",
          capturedAt: new Date().toISOString(),
          groupName:
            getActiveGroupName() || "",
          socketId,
          socketUrl: ws.url(),
          direction,
          encoding,
          byteLength,
        };

        /*
         * Luôn lưu index của frame để biết thời điểm,
         * chiều gửi/nhận và kích thước.
         */
        appendNetworkLog(
          "websocket-index.jsonl",
          baseFrame
        );

        const trimmed = rawPayload.trim();

        const looksJson =
          trimmed.startsWith("{") ||
          trimmed.startsWith("[");

        const relevant =
          encoding === "base64" ||
          looksJson ||
          networkPayloadLooksRelevant({
            url: ws.url(),
            responseBody: rawPayload,
            config,
          });

        if (
          !config.networkCaptureAllWebSocketFrames &&
          !relevant
        ) {
          return;
        }

        appendNetworkLog(
          "websocket-frames.jsonl",
          {
            ...baseFrame,
            payload:
              encoding === "utf8"
                ? parseAndSanitizeNetworkText(
                    rawPayload,
                    maxChars
                  )
                : truncateLogText(
                    rawPayload,
                    maxChars
                  ),
          }
        );
      } catch (error: any) {
        appendNetworkLog(
          "network-errors.jsonl",
          {
            type:
              "websocket_capture_error",
            capturedAt:
              new Date().toISOString(),
            socketId,
            error:
              error?.message ||
              String(error),
          }
        );
      }
    }

    ws.on("framesent", (event) => {
      captureFrame("sent", event.payload);
    });

    ws.on("framereceived", (event) => {
      captureFrame(
        "received",
        event.payload
      );
    });

    ws.on("close", () => {
      appendNetworkLog(
        "websocket-index.jsonl",
        {
          type: "websocket_close",
          capturedAt:
            new Date().toISOString(),
          groupName:
            getActiveGroupName() || "",
          socketId,
          url: ws.url(),
        }
      );
    });

    ws.on("socketerror", (error) => {
      appendNetworkLog(
        "network-errors.jsonl",
        {
          type: "websocket_error",
          capturedAt:
            new Date().toISOString(),
          groupName:
            getActiveGroupName() || "",
          socketId,
          url: ws.url(),
          error: String(error || ""),
        }
      );
    });
  });
}

/**
 * Bỏ query string/token tạm thời khỏi URL ảnh Zalo.
 *
 * Ví dụ:
 * https://photo.zalo.me/image/abc.webp?token=xyz
 * ->
 * https://photo.zalo.me/image/abc.webp
 */
function makeStableImageSrc(src: string) {
  const raw = String(src || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split("?")[0].split("#")[0];
  }
}

function buildRoomUnitsFromMessages(
  groupName: string,
  messages: Msg[]
): RoomUnit[] {
  const sorted = [
    ...messages,
  ].sort(
    (a, b) =>
      a.top - b.top
  );

  /*
   * Chỉ nhận block hoàn chỉnh nằm giữa
   * hai separator.
   */
  const blocks: Msg[][] = [];

  let currentBlock:
    Msg[] | null = null;

  for (const msg of sorted) {
    if (
      isBlockSeparator(
        msg.text
      )
    ) {
      if (
        currentBlock &&
        currentBlock.length > 0
      ) {
        blocks.push(
          currentBlock
        );
      }

      currentBlock = [];
      continue;
    }

    if (!currentBlock) {
      continue;
    }

    currentBlock.push(
      msg
    );
  }

  /*
   * Không push block cuối nếu chưa có
   * separator đóng.
   */

  const units:
    RoomUnit[] = [];

  for (
    let blockIndex = 0;
    blockIndex < blocks.length;
    blockIndex++
  ) {
    const block =
      blocks[blockIndex];

    const houseInfoText =
      Array.from(
        new Set(
          block
            .map(
              (message) =>
                String(
                  message.text ||
                    ""
                ).trim()
            )
            .filter(
              (text) =>
                Boolean(text) &&
                isBuildingInfoText(
                  text
                ) &&
                !isRoomMarkerText(
                  text
                )
            )
        )
      )
        .join("\n\n")
        .trim();

    const roomMarkers =
      block
        .map(
          (msg, index) => ({
            msg,
            index,
          })
        )
        .filter(
          ({ msg }) =>
            isRoomMarkerText(
              msg.text
            )
        );

    for (
      let markerPosition = 0;
      markerPosition <
      roomMarkers.length;
      markerPosition++
    ) {
      const marker =
        roomMarkers[
          markerPosition
        ];

      const previousMarker =
        roomMarkers[
          markerPosition - 1
        ];

      const mediaStartIndex =
        previousMarker
          ? previousMarker.index + 1
          : 0;

      const messagesBeforeMarker =
        block.slice(
          mediaStartIndex,
          marker.index
        );

      const imageSrcs =
        Array.from(
          new Set(
            messagesBeforeMarker
              .flatMap(
                (message) =>
                  message.imageSrcs ||
                  []
              )
              .filter(Boolean)
          )
        );

      /*
       * Không lấy text sau marker.
       */
      const text = [
        houseInfoText,
        marker.msg.text,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (!text) {
        continue;
      }

      const sourceHash =
        hash(
          [
            "dom-room",
            groupName,
            blockIndex,
            makeStableText(
              houseInfoText
            ),
            marker.msg
              .sourceHash,
            ...imageSrcs.map(
              makeStableImageSrc
            ),
          ].join("|")
        );

      units.push({
        text,

        senderName:
          marker.msg
            .senderName ||
          "Không rõ",

        imageSrcs,

        sourceHash,
      });
    }
  }

  return units;
}


async function openGroup(
  page: Page,
  groupName: string,
  config: Config
) {
  const maxAttempts = 3;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      console.log(
        `Đang mở nhóm "${groupName}" - lần ${attempt}/${maxAttempts}`
      );

      /*
       * Đóng dropdown, popup hoặc menu đang che
       * thanh tìm kiếm của Zalo.
       */
      await page.keyboard
        .press("Escape")
        .catch(() => {});

      await page.waitForTimeout(300);

      /*
       * Ưu tiên selector chính xác của Zalo.
       * Nếu Zalo đổi ID thì fallback về config.
       */
      let search = page
        .locator(
          "#contact-search-input"
        )
        .first();

      const exactSearchExists =
        await search
          .count()
          .catch(() => 0);

      if (
        exactSearchExists === 0
      ) {
        search = page
          .locator(
            config.selectors
              .searchBox
          )
          .first();
      }

      await search.waitFor({
        state: "visible",
        timeout: 15_000,
      });

      /*
       * Không dùng click() thông thường.
       *
       * Input của Zalo đôi khi bị một lớp giao diện
       * trong suốt chặn pointer event. focus() không
       * phụ thuộc vào việc element có nhận click hay không.
       */
      await search
        .focus({
          timeout: 5_000,
        })
        .catch(async () => {
          await search.evaluate(
            (
              element:
                HTMLInputElement
            ) => {
              element.focus();
            }
          );
        });

      /*
       * Xóa nội dung tìm kiếm cũ trước khi
       * nhập tên nhóm tiếp theo.
       */
      await search.fill("", {
        timeout: 10_000,
      });

      await search.fill(
        groupName,
        {
          timeout: 10_000,
        }
      );

      /*
       * Chờ Zalo render kết quả tìm kiếm.
       */
      await page.waitForTimeout(
        1_200
      );

      const candidates =
        page.getByText(
          groupName,
          {
            exact: true,
          }
        );

      const candidateCount =
        await candidates
          .count()
          .catch(() => 0);

      let clickedResult =
        false;

      /*
       * Tìm kết quả nằm ở cột trái.
       *
       * Không dùng .first() ngay vì tên nhóm có thể
       * đồng thời xuất hiện ở tiêu đề cuộc trò chuyện.
       */
      for (
        let index = 0;
        index < candidateCount;
        index++
      ) {
        const candidate =
          candidates.nth(index);

        const visible =
          await candidate
            .isVisible()
            .catch(() => false);

        if (!visible) {
          continue;
        }

        const box =
          await candidate
            .boundingBox()
            .catch(() => null);

        if (!box) {
          continue;
        }

        /*
         * Kết quả tìm kiếm nằm bên trái màn hình.
         * Tiêu đề chat thường nằm xa hơn về bên phải.
         */
        if (box.x > 500) {
          continue;
        }

        await candidate.click({
          timeout: 10_000,
          force: true,
        });

        clickedResult = true;
        break;
      }

      /*
       * Trường hợp Zalo không render text theo cách
       * getByText nhận diện được, dùng Enter chọn
       * kết quả đầu tiên.
       */
      if (!clickedResult) {
        await search.press(
          "Enter"
        );
      }

      /*
       * Chờ Zalo chuyển cuộc trò chuyện và
       * ghi dữ liệu nhóm vào IndexedDB.
       */
      await page.waitForTimeout(
        3_000
      );

      console.log(
        `Đã mở nhóm: ${groupName}`
      );

      return;
    } catch (error: any) {
      console.warn(
        [
          `Mở nhóm thất bại lần ${attempt}/${maxAttempts}:`,
          groupName,
          error?.message ||
            String(error),
        ].join(" ")
      );

      if (
        attempt >= maxAttempts
      ) {
        throw new Error(
          [
            `Không mở được nhóm sau ${maxAttempts} lần:`,
            groupName,
            error?.message ||
              String(error),
          ].join(" ")
        );
      }

      /*
       * Làm sạch trạng thái giao diện rồi thử lại.
       */
      await page.keyboard
        .press("Escape")
        .catch(() => {});

      await page.waitForTimeout(
        1_500
      );
    }
  }
}

async function scrollChatAndCollect(
  page: Page,
  groupName: string,
  config: Config,
  state: Record<string, true>
) {
  const collected = new Map<string, Msg>();

  /**
   * Lưu riêng thứ tự hash.
   *
   * Reader bắt đầu ở cuối chat:
   * - Lần đầu lấy các tin mới nhất.
   * - Mỗi lần cuộn lên lấy các tin cũ hơn.
   *
   * Tin mới phát hiện khi cuộn lên sẽ được chèn vào đầu danh sách,
   * thay vì sort lại bằng rect.top.
   */
  const orderedHashes: string[] = [];

  async function collectVisible(prependNewMessages = false) {
    const messages = await readMessages(page, groupName, config);
    const newHashes: string[] = [];

    for (const msg of messages) {
      if (!msg.text && msg.imageSrcs.length === 0) continue;

      const alreadyCollected = collected.has(msg.sourceHash);

      // Luôn cập nhật dữ liệu mới nhất của message
      collected.set(msg.sourceHash, msg);

      if (!alreadyCollected) {
        newHashes.push(msg.sourceHash);
      }
    }

    if (newHashes.length > 0) {
      if (prependNewMessages) {
        // Những tin vừa đọc khi cuộn lên là tin cũ hơn
        orderedHashes.unshift(...newHashes);
      } else {
        // Lần đọc đầu tiên ở cuối chat
        orderedHashes.push(...newHashes);
      }
    }

    return messages.some((msg) => state[msg.sourceHash]);
  }

  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("div")).filter(
      (el: any) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 200 &&
          rect.left > 350
        );
      }
    );

    const chatScroller = candidates.sort(
      (a: any, b: any) => b.scrollHeight - a.scrollHeight
    )[0] as HTMLElement | undefined;

    if (chatScroller) {
      chatScroller.scrollTop = chatScroller.scrollHeight;
    }
  });

  await page.waitForTimeout(800);

  // Lần đầu đọc vùng cuối chat
  let hitKnownMessage = await collectVisible(false);

  for (let i = 0; i < 8 && !hitKnownMessage; i++) {
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("div")).filter(
        (el: any) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();

          return (
            (style.overflowY === "auto" || style.overflowY === "scroll") &&
            el.scrollHeight > el.clientHeight + 200 &&
            rect.left > 350
          );
        }
      );

      const chatScroller = candidates.sort(
        (a: any, b: any) => b.scrollHeight - a.scrollHeight
      )[0] as HTMLElement | undefined;

      if (chatScroller) {
        chatScroller.scrollTop = Math.max(
          0,
          chatScroller.scrollTop - chatScroller.clientHeight * 0.85
        );
      }
    });

    await page.waitForTimeout(900);

    // Tin phát hiện sau khi cuộn lên phải đứng trước các tin đã đọc
    hitKnownMessage = await collectVisible(true);
  }

  return orderedHashes
    .map((messageHash) => collected.get(messageHash))
    .filter((msg): msg is Msg => Boolean(msg));
}

async function scrollChatToBottom(page: Page) {
  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("div"))
      .filter((el: any) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 200 &&
          rect.left > 350
        );
      });

    const chatScroller = candidates.sort(
      (a: any, b: any) => b.scrollHeight - a.scrollHeight
    )[0] as HTMLElement | undefined;

    if (chatScroller) {
      chatScroller.scrollTop = chatScroller.scrollHeight;
    }
  });

  await page.waitForTimeout(500);
}

type IndexedDbHistoryLoadResult = {
  rooms: IndexedDbRoomPreview[];

  stopReason:
    | "KNOWN_ROOM_FOUND"
    | "CHAT_TOP_REACHED"
    | "MAX_BATCHES_REACHED"
    | "GROUP_NOT_FOUND";

  knownRoomSourceHash?: string;
  knownRoomMarkerText?: string;

  batchCount: number;
};

/**
 * Cuộn lịch sử Zalo theo từng batch.
 *
 * Sau mỗi batch:
 * - đọc lại IndexedDB;
 * - tạo danh sách phòng;
 * - cộng dồn các phòng đã nhìn thấy;
 * - kiểm tra sourceHash với state.json.
 *
 * Khi gặp phòng cũ:
 * - dừng cuộn;
 * - vẫn giữ toàn bộ phòng mới đã thu thập từ các batch trước.
 */
async function triggerNetworkHistoryLoad(
  params: {
    page: Page;
    groupName: string;
    config: Config;
    state: Record<string, true>;
  }
): Promise<IndexedDbHistoryLoadResult> {

  let cachedGroupRef:
  | IndexedDbGroupRef
  | null = null;

  const {
    page,
    groupName,
    config,
    state,
  } = params;

  const rawStepRatio = Number(
    config.indexedDbScrollStepRatio ??
      0.85
  );

  const stepRatio = Math.max(
    0.2,
    Math.min(
      1.5,
      Number.isFinite(rawStepRatio)
        ? rawStepRatio
        : 0.85
    )
  );

  const rawScrollWaitMs = Number(
    config.indexedDbScrollWaitMs ??
      2200
  );

  const scrollWaitMs = Math.max(
    500,
    Math.min(
      10_000,
      Number.isFinite(rawScrollWaitMs)
        ? rawScrollWaitMs
        : 2200
    )
  );

  const rawSettleMs = Number(
    config.indexedDbScrollSettleMs ??
      3500
  );

  const settleMs = Math.max(
    1000,
    Math.min(
      15_000,
      Number.isFinite(rawSettleMs)
        ? rawSettleMs
        : 3500
    )
  );

  const rawStepsPerBatch = Number(
    config.indexedDbScrollStepsPerBatch ??
      3
  );

  const stepsPerBatch = Math.max(
    1,
    Math.min(
      10,
      Number.isFinite(
        rawStepsPerBatch
      )
        ? Math.floor(
            rawStepsPerBatch
          )
        : 3
    )
  );

  const rawMaxBatches = Number(
    config.indexedDbScrollMaxBatches ??
      80
  );

  const maxBatches = Math.max(
    1,
    Math.min(
      500,
      Number.isFinite(
        rawMaxBatches
      )
        ? Math.floor(
            rawMaxBatches
          )
        : 80
    )
  );

  const stopOnKnownRoom =
    config.indexedDbStopOnKnownRoom !==
    false;

  /*
   * Cộng dồn phòng của mọi lần đọc IndexedDB.
   *
   * Việc này quan trọng vì mỗi lần dump có thể chỉ
   * chứa dữ liệu quanh vị trí chat đang hiển thị.
   */
  const collectedRooms =
    new Map<
      string,
      IndexedDbRoomPreview
    >();

  function addRooms(
    rooms: IndexedDbRoomPreview[]
  ) {
    for (const room of rooms) {
      if (!room.sourceHash) {
        continue;
      }

      collectedRooms.set(
        room.sourceHash,
        room
      );
    }
  }

  function getSortedRooms() {
    return Array.from(
      collectedRooms.values()
    ).sort(
      (a, b) =>
        a.markerTimestamp -
        b.markerTimestamp
    );
  }

  function findKnownRoom(
    rooms: IndexedDbRoomPreview[]
  ) {
    /*
     * Kiểm tra từ phòng mới nhất về phòng cũ nhất.
     */
    return [...rooms]
      .sort(
        (a, b) =>
          b.markerTimestamp -
          a.markerTimestamp
      )
      .find(
        (room) =>
          Boolean(
            room.sourceHash &&
              state[
                room.sourceHash
              ]
          )
      );
  }

  async function inspectCurrentPosition() {
    await page.waitForTimeout(
      settleMs
    );

   const indexedDbExport =
  await dumpActiveGroupMessages(
    page,
    groupName,
    config,
    cachedGroupRef
  );

  const detectedGroupId =
  String(
    indexedDbExport?.result
      ?.groupId || ""
  ).trim();

const detectedDatabaseName =
  String(
    indexedDbExport?.result
      ?.databaseName || ""
  ).trim();

if (
  detectedGroupId.startsWith(
    "g"
  ) &&
  detectedDatabaseName.startsWith(
    "sidx_"
  )
) {
  const groupChanged =
    !cachedGroupRef ||
    cachedGroupRef.groupId !==
      detectedGroupId ||
    cachedGroupRef.databaseName !==
      detectedDatabaseName;

  cachedGroupRef = {
    groupId:
      detectedGroupId,

    databaseName:
      detectedDatabaseName,
  };

  if (groupChanged) {
    console.log(
      [
        "Đã cache group IndexedDB:",
        `groupId=${detectedGroupId}`,
        `database=${detectedDatabaseName}`,
      ].join(" ")
    );
  }
}

    if (
      !indexedDbExport
        ?.result
        ?.ok
    ) {
      return {
        ok: false,
        knownRoom:
          undefined as
            | IndexedDbRoomPreview
            | undefined,
      };
    }

    const previewRooms =
      Array.isArray(
        indexedDbExport.previewRooms
      )
        ? indexedDbExport.previewRooms
        : [];

    addRooms(previewRooms);

    const knownRoom =
      stopOnKnownRoom
        ? findKnownRoom(
            previewRooms
          )
        : undefined;

    return {
      ok: true,
      knownRoom,
    };
  }

  console.log(
    [
      `Đang tải lịch sử nhóm: ${groupName}`,
      `stepRatio=${stepRatio}`,
      `stepsPerBatch=${stepsPerBatch}`,
      `maxBatches=${maxBatches}`,
    ].join(" | ")
  );

  /*
   * Bắt đầu tại cuối chat.
   */
  await scrollChatToBottom(
    page
  );

  await page.waitForTimeout(
    settleMs
  );

  /*
   * Kiểm tra dữ liệu đang có ngay tại cuối chat
   * trước khi bắt đầu cuộn.
   */
  const initialInspection =
    await inspectCurrentPosition();

  if (
    initialInspection.knownRoom
  ) {
    const knownRoom =
      initialInspection.knownRoom;

    console.log(
      [
        "Đã chạm dữ liệu cũ ngay tại cuối chat:",
        knownRoom.markerText,
      ].join(" ")
    );

    return {
      rooms:
        getSortedRooms(),

      stopReason:
        "KNOWN_ROOM_FOUND",

      knownRoomSourceHash:
        knownRoom.sourceHash,

      knownRoomMarkerText:
        knownRoom.markerText,

      batchCount: 0,
    };
  }

  let groupWasFound =
    initialInspection.ok;

  for (
    let batchIndex = 0;
    batchIndex < maxBatches;
    batchIndex++
  ) {
    let chatTopReached =
      false;

    for (
      let stepIndex = 0;
      stepIndex <
      stepsPerBatch;
      stepIndex++
    ) {
      const scrollResult =
        await page.evaluate(
          ({ stepRatio }) => {
            const candidates =
              Array.from(
                document.querySelectorAll(
                  "div"
                )
              ).filter(
                (el: any) => {
                  const style =
                    window.getComputedStyle(
                      el
                    );

                  const rect =
                    el.getBoundingClientRect();

                  return (
                    (
                      style.overflowY ===
                        "auto" ||
                      style.overflowY ===
                        "scroll"
                    ) &&
                    el.scrollHeight >
                      el.clientHeight +
                        200 &&
                    rect.left > 350
                  );
                }
              );

            const chatScroller =
              candidates.sort(
                (
                  a: any,
                  b: any
                ) =>
                  b.scrollHeight -
                  a.scrollHeight
              )[0] as
                | HTMLElement
                | undefined;

            if (!chatScroller) {
              return {
                foundScroller:
                  false,
                moved: false,
                atTop: false,
                oldTop: 0,
                newTop: 0,
              };
            }

            const oldTop =
              chatScroller.scrollTop;

            const distance =
              Math.max(
                300,
                chatScroller
                  .clientHeight *
                  stepRatio
              );

            chatScroller.scrollTop =
              Math.max(
                0,
                oldTop -
                  distance
              );

            const newTop =
              chatScroller.scrollTop;

            return {
              foundScroller:
                true,

              moved:
                Math.abs(
                  oldTop -
                    newTop
                ) > 2,

              atTop:
                newTop <= 2,

              oldTop,
              newTop,
            };
          },
          {
            stepRatio,
          }
        );

      await page.waitForTimeout(
        scrollWaitMs
      );

      if (
        !scrollResult
          .foundScroller
      ) {
        console.warn(
          "Không tìm thấy vùng cuộn chat."
        );

        break;
      }

      /*
       * Không dừng ngay khi newTop = 0.
       *
       * Zalo có thể đang tải thêm message cũ,
       * sau đó chèn dữ liệu và thay đổi scrollHeight.
       */
      if (
        !scrollResult.moved &&
        scrollResult.atTop
      ) {
        chatTopReached =
          true;

        break;
      }
    }

    console.log(
      `Đã cuộn batch ${
        batchIndex + 1
      }/${maxBatches}`
    );

    const inspection =
      await inspectCurrentPosition();

    if (inspection.ok) {
      groupWasFound = true;
    }

    if (
      inspection.knownRoom
    ) {
      const knownRoom =
        inspection.knownRoom;

      console.log(
        [
          "Đã chạm dữ liệu cũ:",
          knownRoom.markerText,
          `sourceHash=${knownRoom.sourceHash}`,
        ].join(" ")
      );

      return {
        rooms:
          getSortedRooms(),

        stopReason:
          "KNOWN_ROOM_FOUND",

        knownRoomSourceHash:
          knownRoom.sourceHash,

        knownRoomMarkerText:
          knownRoom.markerText,

        batchCount:
          batchIndex + 1,
      };
    }

    if (chatTopReached) {
      /*
       * Chờ thêm một lần để chắc chắn Zalo không
       * tiếp tục prepend message cũ.
       */
      await page.waitForTimeout(
        settleMs
      );

      const confirmResult =
        await page.evaluate(
          () => {
            const candidates =
              Array.from(
                document.querySelectorAll(
                  "div"
                )
              ).filter(
                (el: any) => {
                  const style =
                    window.getComputedStyle(
                      el
                    );

                  const rect =
                    el.getBoundingClientRect();

                  return (
                    (
                      style.overflowY ===
                        "auto" ||
                      style.overflowY ===
                        "scroll"
                    ) &&
                    el.scrollHeight >
                      el.clientHeight +
                        200 &&
                    rect.left > 350
                  );
                }
              );

            const chatScroller =
              candidates.sort(
                (
                  a: any,
                  b: any
                ) =>
                  b.scrollHeight -
                  a.scrollHeight
              )[0] as
                | HTMLElement
                | undefined;

            if (!chatScroller) {
              return {
                atTop: true,
              };
            }

            return {
              atTop:
                chatScroller.scrollTop <=
                2,
            };
          }
        );

      if (confirmResult.atTop) {
        console.log(
          "Đã lên tới đầu lịch sử chat."
        );

        return {
          rooms:
            getSortedRooms(),

          stopReason:
            "CHAT_TOP_REACHED",

          batchCount:
            batchIndex + 1,
        };
      }
    }
  }

  return {
    rooms:
      getSortedRooms(),

    stopReason:
      groupWasFound
        ? "MAX_BATCHES_REACHED"
        : "GROUP_NOT_FOUND",

    batchCount:
      maxBatches,
  };
}

async function dumpIndexedDb(
  page: Page,
  groupName: string,
  config: Config
) {
  const rawSampleLimit = Number(
    config.indexedDbSampleLimit ?? 5
  );

  const sampleLimit = Math.max(
    1,
    Math.min(
      20,
      Number.isFinite(rawSampleLimit)
        ? rawSampleLimit
        : 5
    )
  );

  const rawMaxStringChars = Number(
    config.indexedDbRecordMaxStringChars ?? 4000
  );

  const maxStringChars = Math.max(
    500,
    Math.min(
      20_000,
      Number.isFinite(rawMaxStringChars)
        ? rawMaxStringChars
        : 4000
    )
  );

    console.log(
    `Đang kiểm tra IndexedDB nhóm: ${groupName}`
  );

  /**
   * tsx/esbuild có thể tự chèn helper __name vào các function
   * nằm bên trong page.evaluate().
   *
   * Callback page.evaluate chạy trong trình duyệt nên không nhìn thấy
   * helper __name của Node.js. Ta khai báo một helper no-op trước khi
   * chạy phần đọc IndexedDB.
   *
   * Object(functionValue) sẽ trả lại chính functionValue đó,
   * đủ để các lệnh __name(functionValue, "name") không bị lỗi.
   */
  await page.evaluate("globalThis.__name = Object");

  const result = await page.evaluate(
    async ({
      sampleLimit,
      maxStringChars,
    }) => {
      function requestToPromise<T>(
        request: IDBRequest<T>
      ): Promise<T> {
        return new Promise((resolve, reject) => {
          request.onsuccess = () =>
            resolve(request.result);

          request.onerror = () =>
            reject(
              request.error ||
                new Error(
                  "IndexedDB request failed"
                )
            );
        });
      }

      function normalizeValue(
        value: any,
        depth = 0,
        seen = new WeakSet<object>()
      ): any {
        if (depth > 8) {
          return "[MAX_DEPTH]";
        }

        if (value == null) {
          return value;
        }

        if (typeof value === "string") {
          if (value.length <= maxStringChars) {
            return value;
          }

          return (
            value.slice(0, maxStringChars) +
            `...[TRUNCATED ${
              value.length - maxStringChars
            } CHARS]`
          );
        }

        if (
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return value;
        }

        if (typeof value === "bigint") {
          return value.toString();
        }

        if (
          typeof value === "function" ||
          typeof value === "symbol"
        ) {
          return String(value);
        }

        if (value instanceof Date) {
          return {
            __type: "Date",
            value: value.toISOString(),
          };
        }

        if (value instanceof Blob) {
          return {
            __type: "Blob",
            size: value.size,
            mimeType: value.type,
          };
        }

        if (value instanceof ArrayBuffer) {
          return {
            __type: "ArrayBuffer",
            byteLength: value.byteLength,
          };
        }

        if (ArrayBuffer.isView(value)) {
          return {
            __type:
              value.constructor?.name ||
              "TypedArray",
            byteLength: value.byteLength,
          };
        }

        if (Array.isArray(value)) {
          return value
            .slice(0, 100)
            .map((item) =>
              normalizeValue(
                item,
                depth + 1,
                seen
              )
            );
        }

        if (typeof value === "object") {
          if (seen.has(value)) {
            return "[CIRCULAR]";
          }

          seen.add(value);

          const output: Record<string, any> = {};

          const keys = Object.keys(value).slice(
            0,
            150
          );

          for (const key of keys) {
            try {
              output[key] = normalizeValue(
                value[key],
                depth + 1,
                seen
              );
            } catch {
              output[key] =
                "[UNREADABLE_PROPERTY]";
            }
          }

          return output;
        }

        return String(value);
      }

      function openExistingDatabase(
        name: string
      ): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(name);

          request.onsuccess = () =>
            resolve(request.result);

          request.onerror = () =>
            reject(
              request.error ||
                new Error(
                  `Không mở được database ${name}`
                )
            );

          request.onblocked = () =>
            reject(
              new Error(
                `Database ${name} đang bị blocked`
              )
            );
        });
      }

      const databasesMethod = (
        indexedDB as any
      ).databases;

      if (
        typeof databasesMethod !== "function"
      ) {
        return {
          supported: false,
          error:
            "Trình duyệt không hỗ trợ indexedDB.databases()",
          databases: [],
        };
      }

      const databaseInfos =
        await databasesMethod.call(indexedDB);

      const databases: any[] = [];

      for (const databaseInfo of databaseInfos) {
        const databaseName = String(
          databaseInfo?.name || ""
        ).trim();

        if (!databaseName) continue;

        let db: IDBDatabase | null = null;

        try {
          db = await openExistingDatabase(
            databaseName
          );

          const storeNames = Array.from(
            db.objectStoreNames
          );

          const stores: any[] = [];

          for (const storeName of storeNames) {
            try {
              /*
               * Lấy metadata và count.
               */
              const metaTransaction =
                db.transaction(
                  storeName,
                  "readonly"
                );

              const metaStore =
                metaTransaction.objectStore(
                  storeName
                );

              const indexes = Array.from(
                metaStore.indexNames
              ).map((indexName) => {
                const index =
                  metaStore.index(indexName);

                return {
                  name: index.name,
                  keyPath: normalizeValue(
                    index.keyPath
                  ),
                  unique: index.unique,
                  multiEntry: index.multiEntry,
                };
              });

              const count = await requestToPromise(
                metaStore.count()
              ).catch(() => null);

              /*
               * Lấy một số record cuối của store.
               */
              const sampleTransaction =
                db.transaction(
                  storeName,
                  "readonly"
                );

              const sampleStore =
                sampleTransaction.objectStore(
                  storeName
                );

              const samples = await new Promise<
                any[]
              >((resolve, reject) => {
                const output: any[] = [];

                const cursorRequest =
                  sampleStore.openCursor(
                    null,
                    "prev"
                  );

                cursorRequest.onerror = () =>
                  reject(
                    cursorRequest.error ||
                      new Error(
                        `Không đọc được store ${storeName}`
                      )
                  );

                cursorRequest.onsuccess = () => {
                  const cursor =
                    cursorRequest.result;

                  if (
                    !cursor ||
                    output.length >= sampleLimit
                  ) {
                    resolve(output);
                    return;
                  }

                  output.push({
                    key: normalizeValue(
                      cursor.key
                    ),
                    primaryKey: normalizeValue(
                      cursor.primaryKey
                    ),
                    value: normalizeValue(
                      cursor.value
                    ),
                  });

                  cursor.continue();
                };
              }).catch((error: any) => [
                {
                  error:
                    error?.message ||
                    String(error),
                },
              ]);

              stores.push({
                name: storeName,
                keyPath: normalizeValue(
                  metaStore.keyPath
                ),
                autoIncrement:
                  metaStore.autoIncrement,
                count,
                indexes,
                samples,
              });
            } catch (error: any) {
              stores.push({
                name: storeName,
                error:
                  error?.message ||
                  String(error),
                samples: [],
              });
            }
          }

          databases.push({
            name: databaseName,
            version:
              db.version ||
              databaseInfo?.version ||
              null,
            stores,
          });
        } catch (error: any) {
          databases.push({
            name: databaseName,
            version:
              databaseInfo?.version || null,
            error:
              error?.message ||
              String(error),
            stores: [],
          });
        } finally {
          db?.close();
        }
      }

      return {
        supported: true,
        capturedAt:
          new Date().toISOString(),
        location: window.location.href,
        databases,
      };
    },
    {
      sampleLimit,
      maxStringChars,
    }
  );

  fs.mkdirSync(NETWORK_LOG_DIR, {
    recursive: true,
  });

  const schemaResult = {
    capturedAt: new Date().toISOString(),
    groupName,
    supported: result.supported,
    error:
      "error" in result
        ? result.error
        : undefined,
    location:
      "location" in result
        ? result.location
        : undefined,

    databases: result.databases.map(
      (database: any) => ({
        name: database.name,
        version: database.version,
        error: database.error,

        stores: Array.isArray(
          database.stores
        )
          ? database.stores.map(
              (store: any) => ({
                name: store.name,
                keyPath: store.keyPath,
                autoIncrement:
                  store.autoIncrement,
                count: store.count,
                indexes: store.indexes,
                error: store.error,
              })
            )
          : [],
      })
    ),
  };

  const sampleResult = {
    capturedAt: new Date().toISOString(),
    groupName,
    location:
      "location" in result
        ? result.location
        : undefined,

    databases: result.databases.map(
      (database: any) => ({
        name: database.name,

        stores: Array.isArray(
          database.stores
        )
          ? database.stores
              .filter(
                (store: any) =>
                  Array.isArray(
                    store.samples
                  ) &&
                  store.samples.length > 0
              )
              .map((store: any) => ({
                name: store.name,
                samples: store.samples,
              }))
          : [],
      })
    ),
  };

  const outputDirectory =
  getReaderOutputDir(
    config,
    groupName
  );

const schemaPath =
  path.join(
    outputDirectory,
    "indexeddb-schema.json"
  );

const samplesPath =
  path.join(
    outputDirectory,
    "indexeddb-samples.json"
  );

  fs.writeFileSync(
    schemaPath,
    JSON.stringify(schemaResult, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    samplesPath,
    JSON.stringify(sampleResult, null, 2),
    "utf8"
  );

  console.log(
    `Đã xuất IndexedDB schema: ${schemaPath}`
  );

  console.log(
    `Đã xuất IndexedDB samples: ${samplesPath}`
  );
}

function cleanIndexedDbRoomText(
  input: string
) {
  return String(input || "")
    /*
     * Loại dữ liệu reaction/style bị nối vào text DOM.
     */
    .replace(/\/-strong.*$/i, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isIndexedDbSeparatorText(
  input: string
) {
  return isBuildingSeparatorText(
    input
  );
}

function isIndexedDbNoiseText(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const normalized =
    makeStableText(text);

  if (!normalized) return true;

  if (
    normalized === "clip phong" ||
    normalized === "hinh anh" ||
    normalized === "video" ||
    normalized === "@all"
  ) {
    return true;
  }

  if (
    /^(ok|oke|okay|cam on|thank|thanks|da|uh|ừ|dạ)$/i.test(
      normalized
    )
  ) {
    return true;
  }

  /*
   * Chỉ gồm dấu, emoji hoặc ký tự phân cách.
   */
  if (
    !/[a-zA-ZÀ-ỹ0-9]/.test(text)
  ) {
    return true;
  }

  return false;
}

/**
 * Nhận diện một message là form thông tin chung
 * của tòa nhà.
 *
 * Form này không được phép trở thành marker phòng.
 */
function isIndexedDbHouseInfoText(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const normalized =
    makeStableText(text);

  if (!normalized) {
    return false;
  }

  /*
   * Có địa chỉ thì gần như chắc chắn
   * đây là dữ liệu tòa nhà.
   */
  const hasAddress =
    normalized.includes(
      "dia chi"
    ) ||
    normalized.includes(
      "dia chi du an"
    ) ||
    normalized.includes(
      "so nha"
    );

  if (hasAddress) {
    return true;
  }

  const signals = [
    "cap nhat du an",
    "thong bao du an",
    "thong tin toa nha",

    "ket cau toa nha",
    "quy mo",
    "tong so phong",
    "so phong",

    "dien",
    "nuoc",
    "phi dich vu",
    "dich vu",

    "giu xe",
    "gui xe",
    "ham xe",

    "thang may",
    "thang bo",

    "may giat chung",
    "may giat rieng",
    "giat chung",
    "giat rieng",
    "khu vuc giat phoi",

    "thu cung",
    "cho nuoi pet",
    "duoc nuoi pet",
    "khong pet",

    "coc toi thieu",
    "coc 1 thang",
    "hoa hong",
    "khach nuoc ngoai",

    "danh muc noi that",
    "noi that",
  ];

  const matchedSignals =
    signals.filter(
      (signal) =>
        normalized.includes(
          signal
        )
    ).length;

  const lineCount =
    text
      .split(/\n+/)
      .map((line) =>
        line.trim()
      )
      .filter(Boolean)
      .length;

  /*
   * Form dài nhiều dòng, có nhiều tín hiệu
   * tòa nhà thì phải nhận là house info.
   */
  if (
    matchedSignals >= 3
  ) {
    return true;
  }

  if (
    lineCount >= 4 &&
    matchedSignals >= 2
  ) {
    return true;
  }

  return isHouseInfoText(
    text
  );
}

function isIndexedDbRoomMarkerText(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const normalized =
    makeStableText(text);

  if (!normalized) {
    return false;
  }

    /*
   * Quan trọng:
   *
   * Form thông tin tòa nhà có thể chứa:
   * - chữ "phòng";
   * - nhiều con số;
   * - điện, nước, cọc, giá.
   *
   * Nhưng nó không phải marker của một phòng.
   */
  if (
    isIndexedDbHouseInfoText(
      text
    )
  ) {
    return false;
  }

  const hasExplicitVacancy =
    /\b(trong|phong trong)\b/.test(
      normalized
    );

  /*
   * Chặn các tin báo giao dịch:
   * - lock
   * - báo lock
   * - DT 2.500.000
   * - pass khách
   * - bill ok
   */
  const looksLikeTransaction =
    /\block\b/.test(normalized) ||
    /\b(?:dt|đt)\s*[:\-]?\s*\d/i.test(
      normalized
    ) ||
    /\b(pass khach|bao lock|bill ok|chot khach)\b/.test(
      normalized
    );

  if (
    looksLikeTransaction &&
    !hasExplicitVacancy
  ) {
    return false;
  }

  if (isRoomMarkerText(text)) {
    return true;
  }

  const hasRoomSignal =
    hasExplicitVacancy ||
    /\b(phong|ma)\b/.test(
      normalized
    ) ||
    /\b\d{2,4}\b/.test(
      normalized
    );

  const hasPrice =
    /\b\d+(?:[.,]\d+)?\s*(?:tr|trieu)\d*\b/.test(
      normalized
    ) ||
    /\b\d{1,3}(?:[.,]\d{3}){1,2}\b/.test(
      normalized
    ) ||
    /\b\d{3,5}\s*k\b/.test(
      normalized
    );

  return (
    hasRoomSignal &&
    hasPrice
  );
}

function getIndexedDbMessageTimestamp(
  message: IndexedDbGroupMessage
) {
  return Number(
    message.sendDttm ||
      message.serverTime ||
      message.cliMsgId ||
      0
  );
}

function pickIndexedDbImageUrl(
  message: IndexedDbGroupMessage
) {
  if (!Array.isArray(message.imageUrls)) {
    return "";
  }

  return (
    message.imageUrls.find(
      (url) =>
        typeof url === "string" &&
        url.trim().length > 0
    ) || ""
  ).trim();
}

function buildIndexedDbAlbums(
  imageMessages: IndexedDbGroupMessage[]
) {
  const albumMap = new Map<
    string,
    IndexedDbGroupMessage[]
  >();

  for (const message of imageMessages) {
    const albumKey =
      message.groupLayoutId != null
        ? `album:${String(
            message.groupLayoutId
          )}`
        : `single:${message.msgId}`;

    const current =
      albumMap.get(albumKey) || [];

    current.push(message);
    albumMap.set(albumKey, current);
  }

  const albums =
    Array.from(albumMap.entries())
      .map(
        ([albumKey, albumMessages]) => {
          const sortedMessages = [
            ...albumMessages,
          ].sort((a, b) => {
            const rawIndexA = Number(
              a.imageIndex
            );

            const rawIndexB = Number(
              b.imageIndex
            );

            const indexA =
              Number.isFinite(rawIndexA)
                ? rawIndexA
                : Number.MAX_SAFE_INTEGER;

            const indexB =
              Number.isFinite(rawIndexB)
                ? rawIndexB
                : Number.MAX_SAFE_INTEGER;

            if (indexA !== indexB) {
              return indexA - indexB;
            }

            return (
              getIndexedDbMessageTimestamp(a) -
              getIndexedDbMessageTimestamp(b)
            );
          });

          const expectedCounts =
            sortedMessages
              .map((message) =>
                Number(message.totalImages)
              )
              .filter(
                (value) =>
                  Number.isFinite(value) &&
                  value > 0
              );

          const expectedImageCount =
            expectedCounts.length > 0
              ? Math.max(...expectedCounts)
              : null;

          const imageMessageIds =
            sortedMessages
              .map(
                (message) =>
                  message.msgId
              )
              .filter(Boolean);

          const imageUrls = Array.from(
            new Set(
              sortedMessages
                .map(
                  pickIndexedDbImageUrl
                )
                .filter(Boolean)
            )
          );

          const actualImageCount =
            imageMessageIds.length;

          const complete =
            expectedImageCount == null ||
            actualImageCount >=
              expectedImageCount;

          return {
            albumKey,
            groupLayoutId:
              sortedMessages[0]
                ?.groupLayoutId ?? null,
            expectedImageCount,
            actualImageCount,
            complete,
            imageMessageIds,
            imageUrls,

            firstTimestamp:
              sortedMessages.length > 0
                ? Math.min(
                    ...sortedMessages.map(
                      getIndexedDbMessageTimestamp
                    )
                  )
                : 0,
          };
        }
      )
      .sort(
        (a, b) =>
          a.firstTimestamp -
          b.firstTimestamp
      );

  return albums.map(
    ({
      firstTimestamp: _,
      ...album
    }) => album
  );
}

function refreshIndexedDbRoomFullText(
  room: IndexedDbRoomPreview
) {
  /*
   * Raw text của một phòng chỉ gồm:
   *
   * 1. Thông tin dùng chung của tòa nhà.
   * 2. Marker của chính phòng đó.
   *
   * Không lấy bất kỳ mô tả nào sau marker.
   */
  room.fullText = [
    room.houseInfoText,
    room.markerText,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function isIndexedDbVideoMessage(
  message: IndexedDbGroupMessage
) {
  return (
    message.msgType === 18 ||
    message.originMsgType ===
      "chat.video.msg"
  );
}

function getIndexedDbVideoPayload(
  message: IndexedDbGroupMessage
): IndexedDbVideoPayload | null {
  const sourceUrl =
    String(
      message.videoUrls?.find(
        (url) =>
          typeof url === "string" &&
          url.trim()
      ) || ""
    ).trim();

  if (!sourceUrl) {
    return null;
  }

  const thumbnailUrl =
    String(
      message.videoThumbUrls?.find(
        (url) =>
          typeof url === "string" &&
          url.trim()
      ) || ""
    ).trim();

  const durationMs =
    Number(
      message.videoDebug
        ?.durationMs || 0
    );

  const width =
    Number(
      message.videoDebug
        ?.width || 0
    );

  const height =
    Number(
      message.videoDebug
        ?.height || 0
    );

  const sizeBytes =
    Number(
      message.videoDebug
        ?.fileSize || 0
    );

  return {
    sourceUrl,

    thumbnailUrl:
      thumbnailUrl ||
      undefined,

    durationMs:
      Number.isFinite(
        durationMs
      ) &&
      durationMs > 0
        ? durationMs
        : undefined,

    width:
      Number.isFinite(
        width
      ) &&
      width > 0
        ? width
        : undefined,

    height:
      Number.isFinite(
        height
      ) &&
      height > 0
        ? height
        : undefined,

    sizeBytes:
      Number.isFinite(
        sizeBytes
      ) &&
      sizeBytes > 0
        ? sizeBytes
        : undefined,
  };
}


 /**
 * Tách các block tòa nhà hoàn chỉnh.
 *
 * Mỗi separator vừa:
 * - đóng block tòa nhà đang mở;
 * - mở block tòa nhà tiếp theo.
 *
 * Dữ liệu trước separator đầu tiên bị bỏ qua.
 * Dữ liệu sau separator cuối cùng chưa được xử lý
 * cho đến khi xuất hiện separator tiếp theo.
 */
function splitIndexedDbClosedBlocks(
  messages: IndexedDbGroupMessage[]
): IndexedDbClosedBuildingBlock[] {
  const blocks:
    IndexedDbClosedBuildingBlock[] = [];

  let currentBlock:
    | {
        startSeparatorMessageId: string;
        messages: IndexedDbGroupMessage[];
      }
    | null = null;

  for (const message of messages) {
    const messageText =
      message.kind === "text"
        ? cleanIndexedDbRoomText(
            message.text
          )
        : "";

    const separator =
      Boolean(messageText) &&
      isIndexedDbSeparatorText(
        messageText
      );

    if (separator) {
      /*
       * Tạo ID ổn định cho separator.
       * Ưu tiên msgId, nếu thiếu thì dùng timestamp.
       */
      const separatorMessageId =
        String(
          message.msgId ||
            message.cliMsgId ||
            getIndexedDbMessageTimestamp(
              message
            ) ||
            ""
        );

      /*
       * Separator hiện tại đóng block trước.
       */
      if (
        currentBlock &&
        currentBlock.messages.length > 0
      ) {
        const blockIndex =
          blocks.length;

        const endSeparatorMessageId =
          separatorMessageId;

        const blockId =
          hash(
            [
              "indexeddb-building-block",
              currentBlock
                .startSeparatorMessageId,
              endSeparatorMessageId,
            ].join("|")
          );

        blocks.push({
          blockId,
          blockIndex,

          startSeparatorMessageId:
            currentBlock
              .startSeparatorMessageId,

          endSeparatorMessageId,

          messages: [
            ...currentBlock.messages,
          ],
        });
      }

      /*
       * Separator hiện tại đồng thời
       * mở block tiếp theo.
       */
      currentBlock = {
        startSeparatorMessageId:
          separatorMessageId,

        messages: [],
      };

      continue;
    }

    /*
     * Bỏ qua dữ liệu trước separator đầu tiên.
     */
    if (!currentBlock) {
      continue;
    }

    currentBlock.messages.push(
      message
    );
  }

  /*
   * Không push currentBlock tại cuối hàm.
   *
   * Block cuối chưa có separator đóng
   * nên vẫn được xem là chưa hoàn chỉnh.
   */
  return blocks;
}

function buildRoomsFromIndexedDbMessages(
  params: {
    groupName: string;
    groupId: string;
    messages: IndexedDbGroupMessage[];
    maxGapMs: number;
  }
) {
  const {
    groupName,
    groupId,
  } = params;

  /*
 * Sắp message từ cũ → mới để:
 * - xác định đúng các block tòa nhà;
 * - giữ đúng thứ tự phòng trong block;
 * - ghép media nằm trước marker phòng.
 */
  const messages = [
    ...params.messages,
  ].sort((a, b) => {
    const timeDifference =
      getIndexedDbMessageTimestamp(
        a
      ) -
      getIndexedDbMessageTimestamp(
        b
      );

    if (
      timeDifference !== 0
    ) {
      return timeDifference;
    }

    return String(
      a.msgId || ""
    ).localeCompare(
      String(
        b.msgId || ""
      )
    );
  });

  /*
   * Mỗi phần tử là một block hoàn chỉnh
   * nằm giữa hai dấu phân cách.
   */
  const blocks =
    splitIndexedDbClosedBlocks(
      messages
    );

  const rooms:
    IndexedDbRoomPreview[] =
    [];

  for (
    let blockIndex = 0;
    blockIndex <
    blocks.length;
    blockIndex++
  ) {
    const buildingBlock =
  blocks[blockIndex];

const block =
  buildingBlock.messages;

 /*
 * Lấy dữ liệu chung của tòa nhà từ toàn bộ block.
 *
 * Thứ tự kiểm tra rất quan trọng:
 *
 * 1. Nếu là form tòa nhà thì lấy ngay.
 * 2. Sau đó mới loại marker phòng.
 * 3. Các message tiện ích riêng lẻ cũng được lấy.
 */
const houseInfoTexts =
  Array.from(
    new Set(
      block
        .filter(
          (message) =>
            message.kind ===
            "text"
        )
        .map((message) =>
          cleanIndexedDbRoomText(
            message.text
          )
        )
        .filter((text) => {
          if (!text) {
            return false;
          }

          /*
           * Form tòa nhà phải được giữ lại trước
           * khi gọi hàm nhận diện marker.
           */
          if (
            isIndexedDbHouseInfoText(
              text
            )
          ) {
            return true;
          }

          /*
           * Không đưa dữ liệu riêng của phòng
           * vào houseInfoText.
           */
          if (
            isIndexedDbRoomMarkerText(
              text
            )
          ) {
            return false;
          }

          /*
           * Lấy thêm các message tiện ích tòa nhà
           * được gửi tách riêng.
           */
          return isBuildingInfoText(
            text
          );
        })
    )
  );

const houseInfoText =
  houseInfoTexts
    .join("\n\n")
    .trim();

    /*
     * Vẫn tách người gửi trong cùng block.
     *
     * Điều này tránh trường hợp người khác nhắn xen
     * làm media bị gắn nhầm phòng.
     */
    const messagesBySender =
      new Map<
        string,
        IndexedDbGroupMessage[]
      >();

    for (const message of block) {
      const senderUid =
        String(
          message.fromUid ||
            ""
        ).trim();

      const senderKey =
        senderUid ||
        "__UNKNOWN_SENDER__";

      const current =
        messagesBySender.get(
          senderKey
        ) || [];

      current.push(
        message
      );

      messagesBySender.set(
        senderKey,
        current
      );
    }

    for (
      const [
        senderKey,
        senderMessagesRaw,
      ] of messagesBySender
    ) {
      const senderMessages = [
        ...senderMessagesRaw,
      ].sort((a, b) => {
        const timeDifference =
          getIndexedDbMessageTimestamp(
            a
          ) -
          getIndexedDbMessageTimestamp(
            b
          );

        if (
          timeDifference !== 0
        ) {
          return timeDifference;
        }

        return String(
          a.msgId || ""
        ).localeCompare(
          String(
            b.msgId || ""
          )
        );
      });

      /*
       * Tìm tất cả marker phòng trong block
       * của người gửi này.
       */
      const roomMarkers =
        senderMessages
          .map(
            (
              message,
              index
            ) => ({
              message,
              index,
            })
          )
          .filter(
            ({
              message,
            }) => {
              if (
                message.kind !==
                "text"
              ) {
                return false;
              }

              const text =
                cleanIndexedDbRoomText(
                  message.text
                );

              return (
                Boolean(text) &&
                isIndexedDbRoomMarkerText(
                  text
                )
              );
            }
          );

      for (
        let markerPosition = 0;
        markerPosition <
        roomMarkers.length;
        markerPosition++
      ) {
        const marker =
          roomMarkers[
            markerPosition
          ];

        const previousMarker =
          roomMarkers[
            markerPosition -
              1
          ];

        
        const markerMessage =
          marker.message;

        const markerTimestamp =
          getIndexedDbMessageTimestamp(
            markerMessage
          );

        const markerText =
          cleanIndexedDbRoomText(
            markerMessage.text
          );

        /*
         * ============================
         * MEDIA CỦA PHÒNG
         * ============================
         *
         * Media của phòng hiện tại nằm:
         * - Sau marker trước đó.
         * - Trước marker hiện tại.
         *
         * Mọi ảnh/video sau marker hiện tại
         * không thuộc phòng hiện tại.
         */
        const mediaStartIndex =
          previousMarker
            ? previousMarker.index +
              1
            : 0;

        const messagesBeforeMarker =
          senderMessages.slice(
            mediaStartIndex,
            marker.index
          );

        const imageMessages =
          messagesBeforeMarker.filter(
            (message) =>
              message.kind ===
              "image"
          );

        const videoMessages =
          messagesBeforeMarker.filter(
            isIndexedDbVideoMessage
          );

        const albums =
          buildIndexedDbAlbums(
            imageMessages
          );

        const imageUrls =
          Array.from(
            new Set(
              albums.flatMap(
                (album) =>
                  album.imageUrls
              )
            )
          );

        const imageMessageIds =
          Array.from(
            new Set(
              albums.flatMap(
                (album) =>
                  album.imageMessageIds
              )
            )
          );

        const videoMessageIds =
          Array.from(
            new Set(
              videoMessages
                .map(
                  (message) =>
                    message.msgId
                )
                .filter(Boolean)
            )
          );

        const videoUrls =
          Array.from(
            new Set(
              videoMessages.flatMap(
                (message) =>
                  Array.isArray(
                    message.videoUrls
                  )
                    ? message.videoUrls
                    : []
              )
            )
          )
            .map((url) =>
              String(
                url || ""
              ).trim()
            )
            .filter(Boolean);

        const videoThumbUrls =
          Array.from(
            new Set(
              videoMessages.flatMap(
                (message) =>
                  Array.isArray(
                    message.videoThumbUrls
                  )
                    ? message.videoThumbUrls
                    : []
              )
            )
          )
            .map((url) =>
              String(
                url || ""
              ).trim()
            )
            .filter(Boolean);

        const videoPayloadMap =
          new Map<
            string,
            IndexedDbVideoPayload
          >();

        for (
          const videoMessage of
          videoMessages
        ) {
          const payload =
            getIndexedDbVideoPayload(
              videoMessage
            );

          if (
            payload &&
            !videoPayloadMap.has(
              payload.sourceUrl
            )
          ) {
            videoPayloadMap.set(
              payload.sourceUrl,
              payload
            );
          }
        }

        const videos =
          Array.from(
            videoPayloadMap.values()
          );

     
        const warnings:
          string[] = [];

          if (
            !buildingBlock
              .startSeparatorMessageId ||
            !buildingBlock
              .endSeparatorMessageId
          ) {
            warnings.push(
              "BUILDING_BLOCK_BOUNDARY_MISSING"
            );
          }

        if (
          !houseInfoText
        ) {
          warnings.push(
            "NO_HOUSE_INFO_IN_BLOCK"
          );
        }

        if (
          imageUrls.length ===
          0
        ) {
          warnings.push(
            "NO_IMAGES"
          );
        }

        if (
          imageUrls.length ===
            0 &&
          videoMessages.length ===
            0
        ) {
          warnings.push(
            "NO_MEDIA"
          );
        }

        for (
          const album of albums
        ) {
          if (
            !album.complete
          ) {
            warnings.push(
              [
                "INCOMPLETE_ALBUM",
                album.albumKey,
                `${album.actualImageCount}/${album.expectedImageCount}`,
              ].join(":")
            );
          }
        }

        if (
          videoMessages.length >
            0 &&
          videos.length === 0
        ) {
          warnings.push(
            [
              "VIDEO_SOURCE_URL_MISSING",
              String(
                videoMessages.length
              ),
            ].join(":")
          );
        }

        /*
         * markerMessageId là thành phần chính,
         * nên cùng một phòng được đăng lại bằng
         * message mới sẽ có sourceHash mới.
         */
        const sourceHash =
          hash(
            [
              "indexeddb-room",
              groupName,
              groupId,

              /*
              * Đảm bảo phòng luôn gắn với đúng
              * block tòa nhà.
              */
              buildingBlock.blockId,

              markerMessage.msgId,

              ...imageMessageIds,
              ...videoMessageIds,
            ].join("|")
          );

        const room:
        IndexedDbRoomPreview =
        {
          sourceHash,

          buildingBlockId:
            buildingBlock.blockId,

          buildingBlockIndex:
            buildingBlock.blockIndex,

          groupId,

          senderUid:
            senderKey ===
            "__UNKNOWN_SENDER__"
              ? ""
              : senderKey,

          houseInfoText,

          markerText,

          fullText: "",

            markerMessageId:
              markerMessage.msgId,

            markerTimestamp,

            albums,

            imageUrls,

            imageMessageIds,

            /*
             * Có message video thì hasVideo = true,
             * kể cả chưa lấy được sourceUrl.
             * Khi đó partial import sẽ lưu lý do lỗi.
             */
            hasVideo:
              videoMessages.length >
              0,

            videoMessageIds,

            videoUrls,

            videoThumbUrls,

            videos,

            warnings,
          };

        refreshIndexedDbRoomFullText(
          room
        );

        rooms.push(
          room
        );
      }
    }
  }

  /*
   * Hàm build vẫn trả cũ → mới.
   *
   * Không đảo ở đây vì việc ghép dữ liệu cần
   * thực hiện theo chiều thời gian.
   *
   * Khi import sẽ sort mới → cũ và dừng
   * khi gặp sourceHash đã từng import.
   */
  return rooms.sort(
    (a, b) =>
      a.markerTimestamp -
      b.markerTimestamp
  );
}

function writeIndexedDbRoomPreview(
  params: {
    groupName: string;
    groupId: string;
    messages: IndexedDbGroupMessage[];
    config: Config;
  }
) {
  const rawMaxGapMs = Number(
    params.config
      .indexedDbRoomPreviewMaxGapMs ??
      5 * 60 * 1000
  );

  const maxGapMs = Math.max(
    30_000,
    Math.min(
      30 * 60 * 1000,
      Number.isFinite(rawMaxGapMs)
        ? rawMaxGapMs
        : 5 * 60 * 1000
    )
  );

  const rooms =
    buildRoomsFromIndexedDbMessages({
      groupName: params.groupName,
      groupId: params.groupId,
      messages: params.messages,
      maxGapMs,
    });

  const outputDirectory =
  getReaderOutputDir(
    params.config,
    params.groupName
  );

  const outputPath =
    path.join(
      outputDirectory,
      "active-group-room-preview.json"
    );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        capturedAt:
          new Date().toISOString(),

        groupName:
          params.groupName,

        groupId:
          params.groupId,

        maxGapMs,

        summary: {
          buildingCount:
          new Set(
            rooms.map(
              (room) =>
                room.buildingBlockId
            )
          ).size,
          roomCount:
            rooms.length,

          roomsWithImages:
            rooms.filter(
              (room) =>
                room.imageUrls.length > 0
            ).length,

          roomsWithoutImages:
            rooms.filter(
              (room) =>
                room.imageUrls.length === 0
            ).length,

          incompleteAlbums:
            rooms.flatMap(
              (room) =>
                room.albums
            ).filter(
              (album) =>
                !album.complete
            ).length,

          roomsWithVideo:
            rooms.filter(
              (room) =>
                room.hasVideo
            ).length,
        },

        rooms,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Đã tạo preview ${rooms.length} phòng`
  );

  console.log(
    `File preview: ${outputPath}`
  );

  return {
    outputPath,
    rooms,
  };
}

async function importIndexedDbRoomPreviews(
  params: {
    page: Page;
    config: Config;
    groupName: string;
    rooms: IndexedDbRoomPreview[];
    state: Record<string, true>;
  }
) {
  const {
    page,
    config,
    groupName,
    rooms,
    state,
  } = params;

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let partialCount = 0;

  for (const room of rooms) {
    if (!room.sourceHash) {
      console.warn(
        `Không thể import phòng không có sourceHash: ${room.markerText.slice(
          0,
          80
        )}`
      );

      skippedCount += 1;
      continue;
    }

    if (state[room.sourceHash]) {
      console.log(
        `Bỏ qua phòng đã import: ${room.markerText.slice(
          0,
          80
        )}`
      );

      skippedCount += 1;
      continue;
    }

    /*
     * Không còn bỏ qua phòng thiếu media.
     * Thay vào đó, ghi lỗi vào readerIssues
     * rồi vẫn gửi phòng lên API Imports.
     */
    const readerIssues:
      ReaderIssue[] = [];

    const incompleteAlbums =
      room.albums.filter(
        (album) =>
          !album.complete
      );

    for (
      const album of incompleteAlbums
    ) {
      readerIssues.push({
        level: "error",
        index: null,

        message: [
          "Reader phát hiện album ảnh chưa đầy đủ.",
          `Album: ${album.albumKey}.`,
          `Dự kiến ${album.expectedImageCount ?? "không rõ"} ảnh,`,
          `hiện có ${album.actualImageCount} ảnh.`,
        ].join(" "),
      });
    }

    if (
      room.imageUrls.length === 0 &&
      room.videos.length === 0
    ) {
      readerIssues.push({
        level: "error",
        index: null,

        message:
          "Reader không tìm thấy ảnh hoặc video cho phòng này.",
      });
    }

    /*
     * Có message video nhưng không trích được
     * sourceUrl hợp lệ.
     */
    if (
      room.hasVideo &&
      room.videoMessageIds.length > 0 &&
      room.videos.length === 0
    ) {
      readerIssues.push({
        level: "error",
        index: null,

        message: [
          "Reader phát hiện message video",
          `(${room.videoMessageIds.length} message)`,
          "nhưng không lấy được sourceUrl video.",
        ].join(" "),
      });
    }

    /*
     * Đưa các warning chưa xử lý vào diagnostics.
     */
    for (const warning of room.warnings) {
      if (
        warning === "NO_IMAGES" ||
        warning.startsWith(
          "INCOMPLETE_ALBUM:"
        )
      ) {
        continue;
      }

      readerIssues.push({
        level: "warning",
        index: null,

        message:
          `Reader warning: ${warning}`,
      });
    }

    const rawText =
      String(
        room.fullText ||
          room.markerText ||
          "Phòng không có nội dung text"
      ).trim();

    const senderName =
      room.senderUid
        ? `Zalo UID ${room.senderUid}`
        : "Không rõ";

    const sentAt =
      Number.isFinite(
        room.markerTimestamp
      ) &&
      room.markerTimestamp > 0
        ? new Date(
            room.markerTimestamp
          ).toISOString()
        : new Date().toISOString();

    /*
     * Tổng số ảnh dự kiến lấy từ metadata album.
     *
     * Ví dụ:
     * album cần 7 nhưng chỉ tìm thấy 4 URL
     * → expectedImageCount vẫn phải là 7.
     */
    const expectedImageCount =
      room.albums.length > 0
        ? room.albums.reduce(
            (
              total,
              album
            ) =>
              total +
              (
                album.expectedImageCount ??
                album.actualImageCount
              ),
            0
          )
        : room.imageUrls.length;

    /*
     * Reader/API hiện giới hạn tối đa hai video.
     */
    const expectedVideoCount =
      Math.min(
        2,
        Math.max(
          room.videos.length,

          room.videoMessageIds.length,

          room.hasVideo
            ? 1
            : 0
        )
      );

    const unit: RoomUnit = {
      text:
        rawText,

      senderName,

      imageSrcs:
        room.imageUrls,

      sourceHash:
        room.sourceHash,

      sourceMessageId:
        room.markerMessageId,

      sentAt,

      videos:
        room.videos,

      expectedImageCount,

      expectedVideoCount,

      readerIssues,
    };

    try {
      console.log(
        `Import IndexedDB: ${room.markerText.slice(
          0,
          100
        )}`
      );

      const result =
        await sendBatch({
          page,
          config,
          groupName,
          msg: unit,
        });

      /*
       * Khi API đã tạo được bản Imports,
       * kể cả partial import, sourceHash vẫn
       * được ghi state để tránh tạo bản trùng.
       */
      state[room.sourceHash] =
        true;

      writeState(state);

      importedCount += 1;

      if (
        result?.partial ||
        result?.hasImportErrors
      ) {
        partialCount += 1;

        console.warn(
          [
            "Import IndexedDB PARTIAL:",
            room.markerText.slice(
              0,
              80
            ),
            `Ảnh: ${Number(
              result?.imageCount ?? 0
            )}/${expectedImageCount}.`,
            `Video: ${Number(
              result?.videoCount ?? 0
            )}/${expectedVideoCount}.`,
            "Phòng vẫn đã được đưa lên trang Imports.",
          ].join(" ")
        );

        if (
          Array.isArray(
            result?.issues
          ) &&
          result.issues.length > 0
        ) {
          console.warn(
            "Chi tiết lỗi:",
            JSON.stringify(
              result.issues,
              null,
              2
            )
          );
        }
      } else {
        console.log(
          "Import IndexedDB OK:",
          result
        );
      }
    } catch (error: any) {
      failedCount += 1;

      console.error(
        `Import IndexedDB lỗi hoàn toàn: ${room.markerText.slice(
          0,
          100
        )}`,
        error?.message || error
      );
    }
  }

  console.log(
    [
      "Kết quả IndexedDB import:",
      `${importedCount} đã đưa lên Imports`,
      `${partialCount} có lỗi media`,
      `${skippedCount} bỏ qua`,
      `${failedCount} lỗi hoàn toàn`,
    ].join(" ")
  );

  return {
    importedCount,
    partialCount,
    skippedCount,
    failedCount,
  };
}

async function dumpActiveGroupMessages(
  page: Page,
  groupName: string,
  config: Config,
  preferredGroupRef:
    | IndexedDbGroupRef
    | null = null
) {
  const rawScanLimit = Number(
    config.indexedDbGroupScanLimit ?? 30000
  );

  const scanLimit = Math.max(
    1000,
    Math.min(
      100000,
      Number.isFinite(rawScanLimit)
        ? rawScanLimit
        : 30000
    )
  );

  const rawMessageLimit = Number(
    config.indexedDbGroupMessageLimit ?? 1000
  );

    const messageLimit = Math.max(
    50,
    Math.min(
      5000,
      Number.isFinite(rawMessageLimit)
        ? rawMessageLimit
        : 2000
    )
  );

  const rawContextBeforeMs = Number(
    config.indexedDbGroupContextBeforeMs ??
      10 * 60 * 1000
  );

  const contextBeforeMs = Math.max(
    0,
    Math.min(
      60 * 60 * 1000,
      Number.isFinite(rawContextBeforeMs)
        ? rawContextBeforeMs
        : 10 * 60 * 1000
    )
  );

  const rawContextAfterMs = Number(
    config.indexedDbGroupContextAfterMs ??
      10 * 60 * 1000
  );

   const contextAfterMs = Math.max(
    0,
    Math.min(
      60 * 60 * 1000,
      Number.isFinite(rawContextAfterMs)
        ? rawContextAfterMs
        : 10 * 60 * 1000
    )
  );

  console.log(
    `Đang tìm group ID trong IndexedDB: ${groupName}`
  );

  /**
   * Tránh lỗi tsx/esbuild:
   * ReferenceError: __name is not defined
   */
  await page.evaluate(
    "globalThis.__name = Object"
  );

    const result = await page.evaluate(
  async ({
    messageItemsSelector,
    messageTextSelector,
    scanLimit,
    messageLimit,
    contextBeforeMs,
    contextAfterMs,
    preferredGroupId,
    preferredDatabaseName,
  }) => {
      function requestToPromise<T>(
        request: IDBRequest<T>
      ): Promise<T> {
        return new Promise((resolve, reject) => {
          request.onsuccess = () =>
            resolve(request.result);

          request.onerror = () =>
            reject(
              request.error ||
                new Error(
                  "IndexedDB request failed"
                )
            );
        });
      }

      function openDatabase(
        name: string
      ): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(name);

          request.onsuccess = () =>
            resolve(request.result);

          request.onerror = () =>
            reject(
              request.error ||
                new Error(
                  `Không mở được database ${name}`
                )
            );
        });
      }

      function normalizeText(input: any) {
        return String(input || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
      }

            function isStrongTextMatch(
        visibleText: string,
        messageText: string
      ) {
        const visible = normalizeText(
          visibleText
        );

        const message = normalizeText(
          messageText
        );

        /*
         * Chặn ".", "@All", "ok", số ngắn...
         */
        if (
          visible.length < 20 ||
          message.length < 20
        ) {
          return false;
        }

        if (visible === message) {
          return true;
        }

        const shorter =
          visible.length <= message.length
            ? visible
            : message;

        const longer =
          visible.length > message.length
            ? visible
            : message;

        const lengthRatio =
          shorter.length / longer.length;

        /*
         * Chỉ cho phép contains khi hai đoạn có độ dài
         * tương đối gần nhau.
         *
         * Điều này vẫn cho phép:
         * message thật
         * và message DOM có thêm reaction/style.
         */
        if (
          lengthRatio >= 0.7 &&
          longer.includes(shorter)
        ) {
          return true;
        }

        /*
         * So khớp phần đầu cho trường hợp Zalo DOM
         * cắt bớt phần cuối message.
         */
        if (
          shorter.length >= 80 &&
          lengthRatio >= 0.55
        ) {
          const prefixLength = Math.min(
            120,
            shorter.length
          );

          const shorterPrefix =
            shorter.slice(
              0,
              prefixLength
            );

          const longerPrefix =
            longer.slice(
              0,
              prefixLength
            );

          if (
            shorterPrefix === longerPrefix
          ) {
            return true;
          }
        }

        return false;
      }

      function safeJsonParse(input: any) {
        if (
          typeof input !== "string" ||
          !input.trim()
        ) {
          return null;
        }

        try {
          return JSON.parse(input);
        } catch {
          return null;
        }
      }

            function collectUrlEntries(input: any) {
        const output: Array<{
          path: string;
          url: string;
        }> = [];

        const seen =
          new WeakSet<object>();

        function visit(
          value: any,
          currentPath: string,
          depth: number
        ) {
          if (
            value == null ||
            depth > 7 ||
            output.length >= 100
          ) {
            return;
          }

          if (typeof value === "string") {
            const trimmed = value.trim();

            /*
             * Một số field Zalo chứa JSON dưới dạng string.
             */
            if (
              (trimmed.startsWith("{") &&
                trimmed.endsWith("}")) ||
              (trimmed.startsWith("[") &&
                trimmed.endsWith("]"))
            ) {
              try {
                const parsed =
                  JSON.parse(trimmed);

                visit(
                  parsed,
                  `${currentPath}.$json`,
                  depth + 1
                );
              } catch {
                // Không phải JSON hợp lệ.
              }
            }

            const matches =
              trimmed.match(
                /https?:\/\/[^\s"'<>\\]+/gi
              ) || [];

            for (const matched of matches) {
              const cleaned = matched.replace(
                /[),.;]+$/,
                ""
              );

              output.push({
                path: currentPath,
                url: cleaned,
              });
            }

            return;
          }

          if (
            typeof value !== "object"
          ) {
            return;
          }

          if (seen.has(value)) {
            return;
          }

          seen.add(value);

          if (Array.isArray(value)) {
            value
              .slice(0, 50)
              .forEach((item, index) => {
                visit(
                  item,
                  `${currentPath}[${index}]`,
                  depth + 1
                );
              });

            return;
          }

          Object.entries(value)
            .slice(0, 100)
            .forEach(([key, item]) => {
              visit(
                item,
                currentPath
                  ? `${currentPath}.${key}`
                  : key,
                depth + 1
              );
            });
        }

        visit(input, "root", 0);

        const unique =
          new Map<string, {
            path: string;
            url: string;
          }>();

        for (const item of output) {
          const key =
            `${item.path}|${item.url}`;

          if (!unique.has(key)) {
            unique.set(key, item);
          }
        }

        return Array.from(
          unique.values()
        );
      }

      function sanitizeVideoDebug(
        input: any,
        depth = 0
      ): any {
        if (depth > 4) {
          return "[MAX_DEPTH]";
        }

        if (input == null) {
          return input;
        }

        if (typeof input === "string") {
          return input.length > 3000
            ? `${input.slice(
                0,
                3000
              )}...[TRUNCATED]`
            : input;
        }

        if (
          typeof input === "number" ||
          typeof input === "boolean"
        ) {
          return input;
        }

        if (Array.isArray(input)) {
          return input
            .slice(0, 20)
            .map((item) =>
              sanitizeVideoDebug(
                item,
                depth + 1
              )
            );
        }

        if (typeof input === "object") {
          const result:
            Record<string, any> = {};

          for (
            const [key, value] of Object.entries(
              input
            ).slice(0, 60)
          ) {
            result[key] =
              sanitizeVideoDebug(
                value,
                depth + 1
              );
          }

          return result;
        }

        return String(input);
      }

      /**
       * DOM chỉ dùng để lấy vài đoạn text đang nhìn thấy,
       * nhằm xác định toUid/groupId.
       *
       * Không dùng DOM để lấy thứ tự hoặc ghép ảnh.
       */
       function cleanMessageText(input: any) {
        return String(input || "")
          /*
           * Zalo có thể nối dữ liệu reaction/style vào cuối:
           * /-strong/-heart...
           */
          .replace(/\/-strong.*$/i, "")
          .replace(/\s+/g, " ")
          .trim();
      }

    /*
 * Chỉ lấy text trong vùng hội thoại chính.
 *
 * Không đọc:
 * - Danh sách nhóm bên trái.
 * - Preview tin nhắn bên trái.
 * - Thanh công cụ.
 * - Panel thông tin bên phải.
 */
const chatLeftBoundary = 350;

const conversationScrollerCandidates =
  Array.from(
    document.querySelectorAll(
      "div"
    )
  ).filter(
    (
      element
    ): element is HTMLDivElement => {
      const style =
        window.getComputedStyle(
          element
        );

      const rect =
        element.getBoundingClientRect();

      return (
        (
          style.overflowY ===
            "auto" ||
          style.overflowY ===
            "scroll"
        ) &&
        element.scrollHeight >
          element.clientHeight +
            100 &&
        rect.left >=
          chatLeftBoundary &&
        rect.width >= 500 &&
        rect.height >= 300 &&
        rect.right >
          window.innerWidth *
            0.7
      );
    }
  );

/*
 * Ưu tiên vùng cuộn có diện tích lớn nhất,
 * vì đây thường là khung tin nhắn chính.
 */
const conversationScroller =
  conversationScrollerCandidates
    .sort((a, b) => {
      const rectA =
        a.getBoundingClientRect();

      const rectB =
        b.getBoundingClientRect();

      const areaA =
        rectA.width *
        rectA.height;

      const areaB =
        rectB.width *
        rectB.height;

      return areaB - areaA;
    })[0] || null;

const conversationRoot:
  ParentNode =
  conversationScroller ||
  document.body;

const conversationRect =
  conversationScroller
    ? conversationScroller
        .getBoundingClientRect()
    : {
        left:
          chatLeftBoundary,

        right:
          window.innerWidth,

        top: 120,

        bottom:
          window.innerHeight -
          40,
      };

const scopedMessageItems =
  Array.from(
    conversationRoot.querySelectorAll(
      messageItemsSelector
    )
  );

/*
 * Nếu selector không tìm thấy bên trong scroller,
 * fallback về toàn trang nhưng vẫn bắt buộc lọc
 * theo tọa độ của vùng hội thoại.
 */
const messageItemElements =
  scopedMessageItems.length >
  0
    ? scopedMessageItems
    : Array.from(
        document.querySelectorAll(
          messageItemsSelector
        )
      );

const visibleTextCandidates =
  messageItemElements
    .map((element: Element) => {
      const rect =
        element.getBoundingClientRect();

      const style =
        window.getComputedStyle(
          element
        );

      const insideConversation =
        rect.width > 20 &&
        rect.height > 10 &&

        /*
         * Chặn hoàn toàn cột trái.
         */
        rect.left >=
          Math.max(
            chatLeftBoundary,
            conversationRect.left
          ) &&

        rect.right <=
          Math.min(
            window.innerWidth,
            conversationRect.right +
              5
          ) &&

        rect.bottom >
          Math.max(
            100,
            conversationRect.top
          ) &&

        rect.top <
          Math.min(
            window.innerHeight -
              40,
            conversationRect.bottom
          ) &&

        style.display !==
          "none" &&

        style.visibility !==
          "hidden";

      if (
        !insideConversation
      ) {
        return "";
      }

      const textElement =
        messageTextSelector
          ? element.querySelector(
              messageTextSelector
            )
          : null;

      return cleanMessageText(
        textElement?.textContent ||
          element.textContent ||
          ""
      );
    })
    /*
     * Không dùng:
     * - Chuỗi rỗng.
     * - Tin quá ngắn.
     * - Container quá lớn.
     */
    .filter(
      (text) =>
        text.length >= 20 &&
        text.length <= 4000
    );

      const visibleTexts = Array.from(
        new Set(visibleTextCandidates)
      )
        .sort(
          (a, b) =>
            b.length - a.length
        )
        .slice(0, 40);

      const normalizedVisibleTexts =
        Array.from(
          new Set(
            visibleTexts
              .map((text) =>
                normalizeText(text)
              )
              .filter(
                (text) =>
                  text.length >= 20
              )
          )
        );

      const databaseInfos = await (
        indexedDB as any
      ).databases();

      const searchDatabaseNames =
        databaseInfos
          .map((item: any) =>
            String(item?.name || "")
          )
          .filter((name: string) =>
            name.startsWith("sidx_")
          );

            type Candidate = {
        databaseName: string;
        groupId: string;
        score: number;
        matches: string[];
        latestTimestamp: number;

        /**
         * Timestamp của những message khớp với
         * phần text đang hiển thị trên màn hình.
         */
        matchedTimestamps: number[];
      };

      const candidateMap =
  new Map<string, Candidate>();

/*
 * Nếu batch trước đã xác định được group ID và database,
 * ưu tiên tuyệt đối dữ liệu đó.
 *
 * Không cần text đang hiển thị tiếp tục khớp ở mọi batch.
 */
const normalizedPreferredGroupId =
  String(
    preferredGroupId || ""
  ).trim();

const normalizedPreferredDatabaseName =
  String(
    preferredDatabaseName || ""
  ).trim();

const canUsePreferredGroup =
  normalizedPreferredGroupId.startsWith(
    "g"
  ) &&
  normalizedPreferredDatabaseName.startsWith(
    "sidx_"
  ) &&
  searchDatabaseNames.includes(
    normalizedPreferredDatabaseName
  );

if (canUsePreferredGroup) {
  const preferredKey =
    `${normalizedPreferredDatabaseName}__${normalizedPreferredGroupId}`;

  candidateMap.set(
    preferredKey,
    {
      databaseName:
        normalizedPreferredDatabaseName,

      groupId:
        normalizedPreferredGroupId,

      /*
       * Điểm rất cao để cache luôn được ưu tiên
       * trước các candidate dò lại bằng text DOM.
       */
      score:
        Number.MAX_SAFE_INTEGER,

      matches: [],

      latestTimestamp: 0,

      matchedTimestamps: [],
    }
  );
}

for (
  const databaseName of searchDatabaseNames
) {
        let db: IDBDatabase | null = null;

        try {
          db = await openDatabase(databaseName);

          if (
            !db.objectStoreNames.contains(
              "idx_queue"
            )
          ) {
            continue;
          }

          const transaction = db.transaction(
            "idx_queue",
            "readonly"
          );

          const store =
            transaction.objectStore("idx_queue");

          await new Promise<void>(
            (resolve, reject) => {
              let scanned = 0;

              const cursorRequest =
                store.openCursor(null, "prev");

              cursorRequest.onerror = () =>
                reject(
                  cursorRequest.error ||
                    new Error(
                      `Không đọc được ${databaseName}/idx_queue`
                    )
                );

              cursorRequest.onsuccess = () => {
                const cursor =
                  cursorRequest.result;

                if (
                  !cursor ||
                  scanned >= scanLimit
                ) {
                  resolve();
                  return;
                }

                scanned += 1;

                const value: any =
                  cursor.value || {};

                const groupId = String(
                  value.toUid || ""
                ).trim();

                if (!groupId.startsWith("g")) {
                  cursor.continue();
                  return;
                }

                const messageText =
                  typeof value.message ===
                  "string"
                    ? value.message
                    : "";

                const normalizedMessage =
                  normalizeText(messageText);

                if (!normalizedMessage) {
                  cursor.continue();
                  return;
                }

                 const matchedTexts =
                  normalizedVisibleTexts.filter(
                    (visibleText) =>
                      isStrongTextMatch(
                        visibleText,
                        normalizedMessage
                      )
                  );

                                if (matchedTexts.length > 0) {
                  const candidateKey =
                    `${databaseName}__${groupId}`;

                  const messageTimestamp = Number(
                    value.sendDttm ||
                      value.serverTime ||
                      value.cliMsgId ||
                      0
                  );

                  const current: Candidate =
                    candidateMap.get(
                      candidateKey
                    ) ?? {
                      databaseName,
                      groupId,
                      score: 0,
                      matches: [] as string[],
                      latestTimestamp: 0,
                      matchedTimestamps:
                        [] as number[],
                    };

                  current.score +=
                    matchedTexts.length;

                  current.latestTimestamp =
                    Math.max(
                      current.latestTimestamp,
                      messageTimestamp
                    );

                  if (
                    Number.isFinite(
                      messageTimestamp
                    ) &&
                    messageTimestamp > 0 &&
                    !current.matchedTimestamps.includes(
                      messageTimestamp
                    )
                  ) {
                    current.matchedTimestamps.push(
                      messageTimestamp
                    );
                  }

                  for (
                    const matchedText of matchedTexts
                  ) {
                    if (
                      !current.matches.includes(
                        matchedText
                      )
                    ) {
                      current.matches.push(
                        matchedText
                      );
                    }
                  }

                  candidateMap.set(
                    candidateKey,
                    current
                  );
                }

                cursor.continue();
              };
            }
          );
        } finally {
          db?.close();
        }
      }

      const candidates = Array.from(
        candidateMap.values()
      ).sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          b.latestTimestamp -
          a.latestTimestamp
        );
      });

       const preferredCandidate =
        canUsePreferredGroup
          ? candidates.find(
              (candidate) =>
                candidate.groupId ===
                  normalizedPreferredGroupId &&
                candidate.databaseName ===
                  normalizedPreferredDatabaseName
            ) || null
          : null;

      const bestCandidate =
        preferredCandidate ||
        candidates[0] ||
        null;

      if (!bestCandidate) {
        return {
          ok: false,
          error:
            "Không xác định được group ID từ text đang hiển thị.",
          visibleTexts,
          candidates: [],
          databaseName: null,
          groupId: null,
          matchedTimeStart: null,
          matchedTimeEnd: null,
          exportWindowStart: null,
          exportWindowEnd: null,
          messages: [],
        };
      }

      const validMatchedTimestamps =
        bestCandidate.matchedTimestamps
          .map((value) => Number(value))
          .filter(
            (value) =>
              Number.isFinite(value) &&
              value > 0
          );

            const matchedTimeStart =
        validMatchedTimestamps.length > 0
          ? Math.min(
              ...validMatchedTimestamps
            )
          : null;

      const matchedTimeEnd =
        validMatchedTimestamps.length > 0
          ? Math.max(
              ...validMatchedTimestamps
            )
          : null;

      /**
       * Chọn message khớp gần nhất làm tâm.
       *
       * Không dùng:
       * min timestamp -> max timestamp
       *
       * Vì cùng một nội dung dự án có thể được đăng lại
       * nhiều ngày khác nhau.
       */
      const anchorTimestamp =
        validMatchedTimestamps.length > 0
          ? Math.max(
              ...validMatchedTimestamps
            )
          : null;

      const exportWindowStart =
        anchorTimestamp != null
          ? anchorTimestamp -
            contextBeforeMs
          : null;

      const exportWindowEnd =
        anchorTimestamp != null
          ? anchorTimestamp +
            contextAfterMs
          : null;

      let selectedDb: IDBDatabase | null =
        null;

      try {
        selectedDb = await openDatabase(
          bestCandidate.databaseName
        );

        const transaction =
          selectedDb.transaction(
            "idx_queue",
            "readonly"
          );

        const store =
          transaction.objectStore("idx_queue");

        const groupMessages: any[] = [];

        await new Promise<void>(
          (resolve, reject) => {
            let scanned = 0;

            const cursorRequest =
              store.openCursor(null, "prev");

            cursorRequest.onerror = () =>
              reject(
                cursorRequest.error ||
                  new Error(
                    "Không đọc được message của group"
                  )
              );

            cursorRequest.onsuccess = () => {
              const cursor =
                cursorRequest.result;

             if (
                !cursor ||
                scanned >= scanLimit
              ) {
                resolve();
                return;
              }

              scanned += 1;

              const value: any =
                cursor.value || {};

              if (
                String(value.toUid || "") !==
                bestCandidate.groupId
              ) {
                cursor.continue();
                return;
              }

                            const messageTimestamp =
                Number(
                  value.sendDttm ||
                    value.serverTime ||
                    value.cliMsgId ||
                    0
                );

              const isInsideExportWindow =
                exportWindowStart == null ||
                exportWindowEnd == null ||
                (
                  messageTimestamp >=
                    exportWindowStart &&
                  messageTimestamp <=
                    exportWindowEnd
                );

              if (!isInsideExportWindow) {
                cursor.continue();
                return;
              }

              const msgType = Number(
                value.msgType || 0
              );

              let kind:
                | "text"
                | "image"
                | "other" = "other";

              let text = "";
              let imageUrls: string[] = [];
              let groupLayoutId:
                | string
                | number
                | null = null;

              let imageIndex:
                | string
                | number
                | null = null;

              let totalImages:
                | string
                | number
                | null = null;

              let videoUrls: string[] = [];
              let videoThumbUrls: string[] = [];
              let videoDebug: any = null;

              const originMsgType =
                String(
                  value.originMsgType || ""
                );

              if (
                msgType === 1 &&
                typeof value.message ===
                  "string"
              ) {
                kind = "text";
                text = value.message;
              }

              if (
                msgType === 2 &&
                value.message &&
                typeof value.message ===
                  "object"
              ) {
                kind = "image";

                const media =
                  value.message;

                const params =
                  safeJsonParse(
                    media.params
                  ) || {};

                imageUrls = Array.from(
                  new Set(
                    [
                      media.hdUrl,
                      media.oriUrl,
                      media.normalUrl,
                      media.thumbUrl,
                      params.hd,
                      params.href,
                      params.hd_renew,
                      params.href_renew,
                    ]
                      .map((url) =>
                        String(url || "").trim()
                      )
                      .filter(Boolean)
                  )
                );

                groupLayoutId =
                  params.group_layout_id ??
                  null;

                imageIndex =
                  params.id_in_group ??
                  null;

                totalImages =
                  params.total_item_in_group ??
                  null;
              }

             if (
  msgType === 18 ||
  originMsgType ===
    "chat.video.msg"
) {
  const videoMessage =
    value.message &&
    typeof value.message === "object"
      ? value.message
      : {};

  const videoParams =
    safeJsonParse(
      videoMessage.params
    ) || {};

  const videoSource = {
    message:
      value.message ?? null,

    params:
      value.params ?? null,

    propertyExt:
      value.propertyExt ?? null,

    content:
      value.content ?? null,

    attachments:
      value.attachments ?? null,

    ext:
      value.ext ?? null,

    media:
      value.media ?? null,

    video:
      value.video ?? null,

    thumbUrl:
      value.thumbUrl ?? null,

    url:
      value.url ?? null,
  };

  const urlEntries =
    collectUrlEntries(
      videoSource
    );

  /*
   * URL video Zalo thường không có đuôi .mp4.
   * Vì vậy phải ưu tiên đọc trực tiếp field oriUrl.
   */
  const directVideoUrls = [
    videoMessage.oriUrl,
    videoMessage.videoUrl,
    videoMessage.hdUrl,
    videoMessage.normalUrl,

    videoParams.video_url_to_renew,
    videoParams.videoUrl,
    videoParams.video_url,
    videoParams.oriUrl,

    value.videoUrl,
    value.oriUrl,
  ]
    .map((url) =>
      String(url || "").trim()
    )
    .filter(Boolean);

  const directThumbUrls = [
    videoMessage.thumbUrl,
    videoMessage.thumbnailUrl,
    videoMessage.posterUrl,

    videoParams.thumb_url_to_renew,
    videoParams.thumbUrl,
    videoParams.thumbnailUrl,

    value.thumbUrl,
    value.thumbnailUrl,
  ]
    .map((url) =>
      String(url || "").trim()
    )
    .filter(Boolean);

  const discoveredThumbUrls =
    urlEntries
      .filter(
        ({ path, url }) =>
          /thumb|thumbnail|poster|cover|preview/i.test(
            path
          ) ||
          /\.(?:jpe?g|png|webp|jxl)(?:[?#]|$)/i.test(
            url
          )
      )
      .map(({ url }) => url);

  const discoveredVideoUrls =
    urlEntries
      .filter(
        ({ path, url }) => {
          if (
            directThumbUrls.includes(url) ||
            discoveredThumbUrls.includes(url)
          ) {
            return false;
          }

          return (
            /oriurl|videourl|video_url|stream|download|source|src|hdurl/i.test(
              path
            ) ||
            /(?:video-|video\.|\.dlmd\.me\/)/i.test(
              url
            ) ||
            /\.(?:mp4|mov|m4v|webm|m3u8)(?:[?#]|$)/i.test(
              url
            )
          );
        }
      )
      .map(({ url }) => url);

        videoUrls =
          Array.from(
            new Set([
              ...directVideoUrls,
              ...discoveredVideoUrls,
            ])
          );

        videoThumbUrls =
          Array.from(
            new Set([
              ...directThumbUrls,
              ...discoveredThumbUrls,
            ])
          );

        videoDebug = {
          durationMs: Number(
            videoMessage.duration ||
              videoParams.duration ||
              0
          ),

          fileSize: Number(
            videoParams.fileSize ||
              videoMessage.fileSize ||
              0
          ),

          width: Number(
            videoParams.video_width ||
              videoMessage.width ||
              0
          ),

          height: Number(
            videoParams.video_height ||
              videoMessage.height ||
              0
          ),

          urlEntries,

          payload:
            sanitizeVideoDebug(
              videoSource
            ),
        };
      }

              groupMessages.push({
                msgId: String(
                  value.msgId || ""
                ),
                cliMsgId: String(
                  value.cliMsgId || ""
                ),
                msgType,
                kind,
                text,
                imageUrls,
                groupLayoutId,
                imageIndex,
                totalImages,
                sendDttm:
                  messageTimestamp,
                serverTime: Number(
                  value.serverTime || 0
                ),
                fromUid: String(
                  value.fromUid || ""
                ),
                toUid: String(
                  value.toUid || ""
                ),
                senderName: String(
                  value.dName || ""
                ),
                originMsgType,

                videoUrls,
                videoThumbUrls,
                videoDebug,
              });

              cursor.continue();
            };
          }
        );

                groupMessages.sort(
          (a, b) => {
            const timeDiff =
              Number(a.sendDttm || 0) -
              Number(b.sendDttm || 0);

            if (timeDiff !== 0) {
              return timeDiff;
            }

            return String(
              a.msgId || ""
            ).localeCompare(
              String(b.msgId || "")
            );
          }
        );

        const limitedMessages =
          groupMessages.length >
          messageLimit
            ? groupMessages.slice(
                -messageLimit
              )
            : groupMessages;

        return {
          ok: true,
          databaseName:
            bestCandidate.databaseName,
          groupId:
            bestCandidate.groupId,
          visibleTexts,

          matchedTimeStart,
          matchedTimeEnd,
          anchorTimestamp,
          exportWindowStart,
          exportWindowEnd,

          candidates:
            candidates.slice(0, 10),

          messages: limitedMessages,
        };
      } finally {
        selectedDb?.close();
      }
    },
       {
        messageItemsSelector:
          config.selectors.messageItems,

        messageTextSelector:
          config.selectors.messageText || "",

        scanLimit,
        messageLimit,
        contextBeforeMs,
        contextAfterMs,

        preferredGroupId:
          preferredGroupRef?.groupId ||
          "",

        preferredDatabaseName:
          preferredGroupRef?.databaseName ||
          "",
      }
  );

  const outputDirectory =
  getReaderOutputDir(
    config,
    groupName
  );

  const outputPath =
    path.join(
      outputDirectory,
      "active-group-messages.json"
    );

    fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        capturedAt:
          new Date().toISOString(),
        groupName,
        ...result,
      },
      null,
      2
    ),
    "utf8"
  );

    const exportedMessages =
    (
      Array.isArray(result.messages)
        ? result.messages
        : []
    ) as IndexedDbGroupMessage[];

  const videoMessages =
    exportedMessages
      .filter(
        (message) =>
          message.msgType === 18 ||
          message.originMsgType ===
            "chat.video.msg"
      )
      .map((message) => ({
        msgId: message.msgId,
        cliMsgId: message.cliMsgId,
        sendDttm: message.sendDttm,
        fromUid: message.fromUid,
        toUid: message.toUid,
        originMsgType:
          message.originMsgType,
        videoUrls:
          message.videoUrls,
        videoThumbUrls:
          message.videoThumbUrls,
        videoDebug:
          message.videoDebug,
      }));

  if (videoMessages.length > 0) {

    const videoDebugPath =
    path.join(
      outputDirectory,
      "active-group-video-debug.json"
    );

    fs.writeFileSync(
      videoDebugPath,
      JSON.stringify(
        {
          capturedAt:
            new Date().toISOString(),
          groupName,
          groupId:
            String(
              result.groupId || ""
            ),
          videoCount:
            videoMessages.length,
          videos:
            videoMessages,
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(
      `File video debug: ${videoDebugPath}`
    );
  }

  let previewRooms:
  IndexedDbRoomPreview[] = [];

  if (
    result.ok &&
    config.indexedDbRoomPreview
  ) {
    const previewResult =
      writeIndexedDbRoomPreview({
        groupName,

        groupId: String(
          result.groupId || ""
        ),

        messages:
          exportedMessages,

        config,
      });

    previewRooms =
      previewResult.rooms;
  }

  if (!result.ok) {
  console.warn(
    `Chưa nhận diện được group ID. Xem file: ${outputPath}`
  );

  return {
    result,
    previewRooms,
  };
}

if (preferredGroupRef) {
  console.log(
    `Đã tái sử dụng group ID cache: ${result.groupId}`
  );
}

  const textCount =
    result.messages.filter(
      (item: any) =>
        item.kind === "text"
    ).length;

  const imageCount =
    result.messages.filter(
      (item: any) =>
        item.kind === "image"
    ).length;

  console.log(
    `Đã xác định group ID: ${result.groupId}`
  );

  console.log(
    `Đã xuất ${result.messages.length} message: ${textCount} text, ${imageCount} ảnh`
  );

  console.log(
    `File message: ${outputPath}`
  );

  return {
  result,
  previewRooms,
};

}

async function readMessages(page: Page, groupName: string, config: Config): Promise<Msg[]> {
  const rows = await page.evaluate(
    ({ selectors, maxMessagesPerGroup, groupName }) => {
      const allItems = Array.from(document.querySelectorAll(selectors.messageItems));
      const chatLeftBoundary = 360;

      const items = allItems
        .map((el: any) => {
          const rect = el.getBoundingClientRect();

          const textEl = selectors.messageText
            ? el.querySelector(selectors.messageText)
            : el;

          const senderEl = selectors.messageSender
            ? el.querySelector(selectors.messageSender)
            : null;

          const text = String(textEl?.innerText || el?.innerText || "").trim();
          const senderName = String(senderEl?.innerText || "").trim() || "Không rõ";

          const imgs = Array.from(el.querySelectorAll(selectors.imageNodes || "img"))
          .filter((img: any) => {
            const src = String(img?.src || "");
            const rect = img.getBoundingClientRect();

            if (!src) return false;
            if (src.startsWith("data:")) return false;

            const lower = src.toLowerCase();
            if (lower.includes("emoji")) return false;
            if (lower.includes("sticker")) return false;
            if (lower.includes("avatar")) return false;
            if (lower.includes("reaction")) return false;
            if (lower.includes("icon")) return false;

            // Bỏ icon like/reaction/avatar nhỏ
            if (rect.width < 80 || rect.height < 80) return false;

            return true;
          })
          .map((img: any) => String(img?.src || ""));

          return {
            text,
            senderName,
            imageSrcs: imgs,
            groupName,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
          };
        })
        .filter((m: any) => {
          if (m.left < chatLeftBoundary) return false;
          if (m.bottom <= 70) return false;
          if (m.top >= window.innerHeight - 80) return false;
          return true;
        })
        .sort((a: any, b: any) => a.top - b.top)
        .slice(-maxMessagesPerGroup);

      return items;
    },
    {
      selectors: config.selectors,
      maxMessagesPerGroup: config.maxMessagesPerGroup,
      groupName,
    }
  );

  return rows
    .filter((m: any) => {
      const hasText = !!String(m.text || "").trim();
      const hasImages = Array.isArray(m.imageSrcs) && m.imageSrcs.length > 0;
      return hasText || hasImages;
    })
        .map((m: any) => {
      const imageSignature = Array.isArray(m.imageSrcs)
        ? m.imageSrcs
            .map((src: string) => makeStableImageSrc(src))
            .filter(Boolean)
            .sort()
            .join("|")
        : "";

      const stableHash = hash(
        [
          groupName,
          makeStableText(m.senderName || ""),
          makeStableText(m.text || ""),
          imageSignature,
        ].join("|")
      );

      return {
        text: m.text || "",
        senderName: m.senderName || "Không rõ",
        imageSrcs: Array.isArray(m.imageSrcs)
          ? Array.from(new Set(m.imageSrcs.filter(Boolean)))
          : [],
        sourceHash: stableHash,
        top: Number(m.top || 0),
      };
    });
}

async function convertImageBufferToWebp(
  page: Page,
  sourceBuffer: Buffer,
  sourceMimeType: string
) {
  const sourceBase64 =
    sourceBuffer.toString(
      "base64"
    );

  /*
   * Tránh lỗi __name do tsx/esbuild.
   */
  await page.evaluate(
    "globalThis.__name = Object"
  );

  return page.evaluate(
    async ({
      sourceBase64,
      sourceMimeType,
    }) => {
      const binary =
        atob(sourceBase64);

      const bytes =
        new Uint8Array(
          binary.length
        );

      for (
        let index = 0;
        index < binary.length;
        index++
      ) {
        bytes[index] =
          binary.charCodeAt(
            index
          );
      }

      const sourceBlob =
        new Blob(
          [bytes],
          {
            type:
              sourceMimeType,
          }
        );

      const bitmap =
        await createImageBitmap(
          sourceBlob
        );

      /*
       * Giới hạn ảnh ở 1280px.
       * Vẫn đủ rõ để xem phòng trên web,
       * đồng thời giảm mạnh payload.
       */
      const maxWidth = 1280;
      const maxHeight = 1280;

      const scale =
        Math.min(
          1,
          maxWidth /
            bitmap.width,
          maxHeight /
            bitmap.height
        );

      const width =
        Math.max(
          1,
          Math.round(
            bitmap.width *
              scale
          )
        );

      const height =
        Math.max(
          1,
          Math.round(
            bitmap.height *
              scale
          )
        );

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = width;
      canvas.height = height;

      const context =
        canvas.getContext(
          "2d"
        );

      if (!context) {
        bitmap.close();

        throw new Error(
          "Không tạo được canvas để nén ảnh"
        );
      }

      context.drawImage(
        bitmap,
        0,
        0,
        width,
        height
      );

      bitmap.close();

      const webpBlob =
        await new Promise<Blob>(
          (
            resolve,
            reject
          ) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(
                    new Error(
                      "Không chuyển được ảnh sang WebP"
                    )
                  );

                  return;
                }

                resolve(blob);
              },

              "image/webp",

              /*
               * Quality 0.72 giúp 9–12 ảnh
               * thường vẫn nằm dưới 4,5 MB.
               */
              0.72
            );
          }
        );

      const webpBuffer =
        await webpBlob.arrayBuffer();

      const webpBytes =
        new Uint8Array(
          webpBuffer
        );

      let webpBinary = "";

      const chunkSize =
        0x8000;

      for (
        let offset = 0;
        offset <
        webpBytes.length;
        offset += chunkSize
      ) {
        const chunk =
          webpBytes.subarray(
            offset,
            Math.min(
              offset +
                chunkSize,
              webpBytes.length
            )
          );

        webpBinary +=
          String.fromCharCode(
            ...chunk
          );
      }

      return {
        mimeType:
          "image/webp",

        base64:
          btoa(
            webpBinary
          ),

        width,
        height,

        sizeBytes:
          webpBlob.size,

        originalMimeType:
          sourceMimeType,
      };
    },

    {
      sourceBase64,
      sourceMimeType,
    }
  );
}

async function imageToBase64(
  page: Page,
  src: string
) {
  const userAgent =
    await page.evaluate(
      () => navigator.userAgent
    );

  /*
   * Tải byte ảnh bằng APIRequestContext.
   * Cách này không bị giới hạn CORS.
   */
  const response =
    await page.context().request.get(
      src,
      {
        timeout: 30_000,

        failOnStatusCode: false,

        headers: {
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

          Referer:
            "https://chat.zalo.me/",

          "User-Agent":
            userAgent,
        },
      }
    );

  if (!response.ok()) {
    throw new Error(
      [
        "Không tải được ảnh Zalo.",
        `HTTP ${response.status()}.`,
        src,
      ].join(" ")
    );
  }

  const sourceBuffer =
    await response.body();

  if (sourceBuffer.length === 0) {
    throw new Error(
      `Ảnh Zalo trả về dữ liệu rỗng: ${src}`
    );
  }

  const responseHeaders =
    response.headers();

  const sourceMimeType =
    String(
      responseHeaders[
        "content-type"
      ] ||
        "application/octet-stream"
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  const isJxl =
    sourceMimeType ===
      "image/jxl" ||
    /\/jxl\//i.test(src) ||
    /\.jxl(?:[?#]|$)/i.test(src);

  /*
   * JPEG XL phải giải mã bằng djxl.
   */
  if (isJxl) {
  const pngBuffer =
    await decodeJxlBufferToPng(
      sourceBuffer
    );

  /*
   * djxl tạo PNG lớn.
   * Chuyển PNG sang WebP đã nén
   * trước khi gửi lên API.
   */
  return convertImageBufferToWebp(
    page,
    pngBuffer,
    "image/png"
  );
}

  /*
   * Các định dạng trình duyệt hỗ trợ thông thường
   * có thể gửi thẳng byte gốc.
   */
  if (
  sourceMimeType ===
    "image/png" ||
  sourceMimeType ===
    "image/jpeg" ||
  sourceMimeType ===
    "image/jpg" ||
  sourceMimeType ===
    "image/webp"
) {
  const normalizedMimeType =
    sourceMimeType ===
      "image/jpg"
      ? "image/jpeg"
      : sourceMimeType;

  return convertImageBufferToWebp(
    page,
    sourceBuffer,
    normalizedMimeType
  );
}

  throw new Error(
    [
      "Định dạng ảnh Zalo chưa được hỗ trợ.",
      `Content-Type: ${sourceMimeType}.`,
      src,
    ].join(" ")
  );
}

async function sendBatch(params: {
  page: Page;
  config: Config;
  groupName: string;
  msg: Msg | RoomUnit;
}) {
  const {
    page,
    config,
    groupName,
    msg,
  } = params;

  const roomUnit =
    msg as RoomUnit;

  const videos =
    Array.isArray(
      roomUnit.videos
    )
      ? roomUnit.videos
          .filter(
            (video) =>
              Boolean(
                String(
                  video.sourceUrl ||
                    ""
                ).trim()
              )
          )
          .slice(0, 2)
      : [];

  /*
   * Sao chép array để có thể thêm lỗi ảnh
   * mà không sửa trực tiếp object RoomUnit.
   */
  const readerIssues:
    ReaderIssue[] =
    Array.isArray(
      roomUnit.readerIssues
    )
      ? roomUnit.readerIssues.map(
          (issue) => ({
            ...issue,
          })
        )
      : [];

  const images: Array<{
    name: string;
    mimeType: string;
    base64: string;
  }> = [];

  const imageSources =
    msg.imageSrcs.slice(
      0,
      config.maxImagesPerBatch
    );

  const configuredExpectedImages =
    Number(
      roomUnit.expectedImageCount
    );

  /*
   * Không được thấp hơn số URL mà Reader
   * đang chuẩn bị tải.
   */
  const expectedImageCount =
    Number.isFinite(
      configuredExpectedImages
    ) &&
    configuredExpectedImages >= 0
      ? Math.max(
          imageSources.length,
          Math.round(
            configuredExpectedImages
          )
        )
      : imageSources.length;

  const configuredExpectedVideos =
    Number(
      roomUnit.expectedVideoCount
    );

  const expectedVideoCount =
    Number.isFinite(
      configuredExpectedVideos
    ) &&
    configuredExpectedVideos >= 0
      ? Math.min(
          2,
          Math.max(
            videos.length,
            Math.round(
              configuredExpectedVideos
            )
          )
        )
      : videos.length;

  for (
    let imageIndex = 0;
    imageIndex <
    imageSources.length;
    imageIndex++
  ) {
    const src =
      imageSources[
        imageIndex
      ];

    try {
      const data =
        await imageToBase64(
          page,
          src
        );

      let extension:
        | "png"
        | "jpg"
        | "webp";

      switch (
        data.mimeType
      ) {
        case "image/png":
          extension = "png";
          break;

        case "image/jpeg":
        case "image/jpg":
          extension = "jpg";
          break;

        case "image/webp":
          extension = "webp";
          break;

        default:
          throw new Error(
            `Định dạng ảnh không được hỗ trợ: ${data.mimeType}`
          );
      }

      images.push({
        name:
          `${crypto.randomUUID()}.${extension}`,

        mimeType:
          data.mimeType ===
          "image/jpg"
            ? "image/jpeg"
            : data.mimeType,

        base64:
          data.base64,
      });
    } catch (error: any) {
      const errorMessage =
        error?.message ||
        String(error);

      console.warn(
        "Không lấy được ảnh:",
        src,
        errorMessage
      );

      readerIssues.push({
        level: "error",

        index:
          imageIndex,

        message:
          `Không tải/xử lý được ảnh thứ ${imageIndex + 1}: ${errorMessage}`,

        sourceUrl:
          src,
      });
    }
  }

  /*
   * Không throw nữa.
   * Ghi lỗi rồi vẫn gửi những ảnh đã lấy được.
   */
  if (
    images.length !==
    expectedImageCount
  ) {
    readerIssues.push({
      level: "error",
      index: null,

      message: [
        "Tải ảnh Zalo không đầy đủ.",
        `Dự kiến ${expectedImageCount} ảnh,`,
        `Reader gửi được ${images.length} ảnh.`,
      ].join(" "),
    });
  }

  if (
    videos.length !==
    expectedVideoCount
  ) {
    readerIssues.push({
      level: "error",
      index: null,

      message: [
        "Reader không lấy đủ URL video.",
        `Dự kiến ${expectedVideoCount} video,`,
        `Reader gửi được ${videos.length} video.`,
      ].join(" "),
    });
  }

  let importPayload = {
    groupName,

    senderName:
      msg.senderName,

    sourceHash:
      msg.sourceHash,

    sourceMessageId:
      roomUnit.sourceMessageId ||
      null,

    rawText:
      msg.text,

    sentAt:
      roomUnit.sentAt ||
      new Date().toISOString(),

    images,
    videos,

    expectedImageCount,

    expectedVideoCount,

    readerIssues,
  };

  let requestBody =
    JSON.stringify(
      importPayload
    );

  let requestBytes =
    Buffer.byteLength(
      requestBody,
      "utf8"
    );

  let requestMegabytes =
    requestBytes /
    1024 /
    1024;

  /*
   * Nếu payload ảnh vẫn vượt giới hạn Vercel,
   * không bỏ phòng.
   *
   * Chỉ bỏ dữ liệu Base64 khỏi request và gửi
   * phòng lên Imports với chẩn đoán lỗi.
   */
  if (
    requestBytes >
    4.2 * 1024 * 1024
  ) {
    const payloadError = [
      "Payload chứa ảnh vượt giới hạn an toàn.",
      `Kích thước ban đầu: ${requestMegabytes.toFixed(
        2
      )} MB.`,
      "Reader đã bỏ phần Base64 ảnh khỏi request để phòng vẫn xuất hiện trên trang Imports.",
    ].join(" ");

    console.warn(
      payloadError
    );

    readerIssues.push({
      level: "error",
      index: null,
      message:
        payloadError,
    });

    importPayload = {
      ...importPayload,

      /*
       * API vẫn biết expectedImageCount,
       * nhưng nhận 0 ảnh và đánh dấu partial.
       */
      images: [],

      readerIssues,
    };

    requestBody =
      JSON.stringify(
        importPayload
      );

    requestBytes =
      Buffer.byteLength(
        requestBody,
        "utf8"
      );

    requestMegabytes =
      requestBytes /
      1024 /
      1024;
  }

  /*
   * Trường hợp text hoặc diagnostics bất thường
   * vẫn làm payload vượt 4.2 MB.
   */
  if (
    requestBytes >
    4.2 * 1024 * 1024
  ) {
    throw new Error(
      [
        "Payload vẫn vượt giới hạn sau khi đã bỏ dữ liệu ảnh.",
        `Kích thước: ${requestMegabytes.toFixed(
          2
        )} MB.`,
      ].join(" ")
    );
  }

  console.log(
    [
      "Payload import:",
      `${requestMegabytes.toFixed(
        2
      )} MB,`,
      `${importPayload.images.length} ảnh gửi API,`,
      `${videos.length} video,`,
      `${readerIssues.length} cảnh báo/lỗi Reader`,
    ].join(" ")
  );

  const res =
    await fetch(
      `${config.webBaseUrl}/api/internal/zalo-reader/import`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-internal-secret":
            config.internalSecret,
        },

        body:
          requestBody,
      }
    );

  const json =
    await res
      .json()
      .catch(() => ({}));

  console.log(
    "Zalo Import API response:",
    JSON.stringify(
      json,
      null,
      2
    )
  );

  if (
    !res.ok ||
    !json?.ok
  ) {
    throw new Error(
      json?.error ||
        `Import failed HTTP ${res.status}`
    );
  }

  if (
    !json?.duplicate
  ) {
    const serverImageCount =
      Number(
        json?.imageCount ?? 0
      );

    const serverVideoCount =
      Number(
        json?.videoCount ?? 0
      );

    const isPartial =
      Boolean(
        json?.partial ||
        json?.hasImportErrors
      ) ||
      serverImageCount !==
        expectedImageCount ||
      serverVideoCount !==
        expectedVideoCount;

    /*
     * Không throw khi media thiếu nữa.
     * API đã tạo bản Imports, vì vậy chỉ log cảnh báo.
     */
    if (isPartial) {
      console.warn(
        [
          "Phòng đã được đưa lên Imports nhưng có lỗi media.",
          `Ảnh: ${serverImageCount}/${expectedImageCount}.`,
          `Video: ${serverVideoCount}/${expectedVideoCount}.`,
        ].join(" ")
      );
    }
  }

  return json;
}

async function main() {
  const config = readConfig();

    /*
  * Tự động xóa các session debug quá cũ
  * hoặc vượt quá số lượng cho phép.
  */
  cleanupOldNetworkSessions(
    config
  );

  /*
  * Khi chạy bình thường, chỉ giữ snapshot
  * của lần khởi động Reader hiện tại.
  */
  if (
    !config.networkDebug &&
    !config.indexedDbDebug
  ) {
    fs.rmSync(
      LATEST_OUTPUT_DIR,
      {
        recursive: true,
        force: true,
      }
    );

    fs.mkdirSync(
      LATEST_OUTPUT_DIR,
      {
        recursive: true,
      }
    );
  }

  const state = readState();

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page =
    context.pages()[0] ||
    (await context.newPage());

  let activeGroupName = "";

  /*
   * Listener phải được cài trước page.goto()
   * để không bỏ lỡ request và WebSocket lúc khởi động.
   */
  installNetworkDebug(
    page,
    config,
    () => activeGroupName
  );

  await page.goto(
    "https://chat.zalo.me",
    {
      waitUntil: "domcontentloaded",
    }
  );

 console.log(
  "Sau khi login xong tool sẽ tự quét nhóm."
);

/*
 * IndexedDB không còn phụ thuộc vào
 * indexedDbDebugOnly.
 *
 * Chỉ cần một chức năng IndexedDB được bật
 * thì Reader dùng pipeline IndexedDB.
 */
const useIndexedDbPipeline =
  Boolean(
    config.indexedDbGroupExport
  ) ||
  Boolean(
    config.indexedDbImportEnabled
  ) ||
  Boolean(
    config.indexedDbRoomPreview
  ) ||
  Boolean(
    config.indexedDbDebug
  ) ||
  Boolean(
    config.indexedDbDebugOnly
  );

while (true) {
        for (const groupName of config.groups) {
      try {
        activeGroupName = groupName;

        console.log(
          `\nĐang quét nhóm: ${groupName}`
        );

        await openGroup(
          page,
          groupName,
          config
        );

        /*
         * Giai đoạn debug network:
         * - Chỉ kích hoạt Zalo tải message.
         * - Không parse DOM.
         * - Không gọi API import.
         * - Không ghi state.
         */
          if (
            config.networkDebugOnly ||
            useIndexedDbPipeline
          ) {
          console.log(
            `Đang tải lịch sử nhóm: ${groupName}`
          );               
          
          const historyLoadResult =
            await triggerNetworkHistoryLoad({
              page,
              groupName,
              config,
              state,
            });

          if (config.indexedDbDebug) {
            await dumpIndexedDb(
              page,
              groupName,
              config
            );
          }

    console.log(
      [
        "Kết quả tải lịch sử:",
        `stopReason=${historyLoadResult.stopReason}`,
        `batchCount=${historyLoadResult.batchCount}`,
        `roomCount=${historyLoadResult.rooms.length}`,
      ].join(" ")
    );


   if (
      config.indexedDbImportEnabled &&
      historyLoadResult.rooms.length >
        0
    ) {
      await importIndexedDbRoomPreviews({
        page,
        config,
        groupName,

        /*
        * Gồm tất cả phòng thu được từ lúc ở cuối chat
        * cho tới lúc gặp dữ liệu cũ.
        */
        rooms:
          historyLoadResult.rooms,

        state,
      });
    }

          console.log(
            `Đã hoàn tất quét/import IndexedDB nhóm ${groupName}`
          );

          /*
          * Đã hoàn thành pipeline IndexedDB.
          * Không chạy tiếp luồng DOM cũ cho cùng nhóm.
          */
          continue;
        }

        const messages =
          await scrollChatAndCollect(
            page,
            groupName,
            config,
            state
          );

        const roomUnits =
          buildRoomUnitsFromMessages(
            groupName,
            messages
          );

        for (const unit of roomUnits) {
          if (state[unit.sourceHash]) continue;
          if (!isRoomText(unit.text, config.roomTextKeywords)) continue;

          console.log(`Import phòng: ${unit.text.slice(0, 120)}...`);

          const result = await sendBatch({
            page,
            config,
            groupName,
            msg: unit,
          });

          state[unit.sourceHash] = true;
          writeState(state);

          console.log("OK:", result);
        }

        await scrollChatToBottom(page);
      } catch (e: any) {
        console.error(`Lỗi nhóm ${groupName}:`, e?.message || e);
      }
    }

        if (
      config.indexedDbDebugOnly ||
      config.networkDebugOnly
    ) {
      console.log(
        "\nDebug hoàn tất. Đang đóng Zalo Reader..."
      );

      await context.close();
      return;
    }

    const configuredIntervalMs =
  Number(
    config.scanIntervalMs
  );

const idleIntervalMs =
  Number.isFinite(
    configuredIntervalMs
  )
    ? Math.max(
        60_000,
        configuredIntervalMs
      )
    : 15 * 60 * 1000;

const nextScanAt =
  new Date(
    Date.now() +
      idleIntervalMs
  );

    console.log(
      [
        "",
        "Đã hoàn tất lượt quét và import.",
        `Bắt đầu nghỉ ${Math.round(
          idleIntervalMs / 60_000
        )} phút.`,
        `Lượt quét tiếp theo: ${nextScanAt.toLocaleString(
          "vi-VN",
          {
            timeZone:
              "Asia/Ho_Chi_Minh",
          }
        )}`,
      ].join("\n")
    );

    /*
    * Timer bắt đầu sau khi:
    * - đã quét xong tất cả nhóm;
    * - đã import xong tất cả phòng;
    * - đã ghi xong state.json.
    *
    * Không có lượt quét mới chạy chồng
    * trong khi lượt hiện tại đang import.
    */
    await sleep(
      idleIntervalMs
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});