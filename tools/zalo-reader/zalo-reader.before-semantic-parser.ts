import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import {
  buildSemanticTimelineRooms,
  type SemanticParserOptions,
} from "./parsers";

import {
  filterMessagesByLookback,
  resolveMessageLookbackHours,
  resolveStrictMessageLookback,
} from "./parsers/phase3-message-lookback";

const execFileAsync =
  promisify(execFile);


  type GroupConfigEntry =
  | string
  | {
      /** Khóa cố định, không đổi khi nhóm Zalo đổi tên. */
      key: string;

      /** Tên nhóm hiện tại dùng để tìm và mở trên Zalo. */
      name: string;

      /** Chọn parser theo từng nhóm. Mặc định là semantic-timeline. */
      parser?: "legacy" | "semantic-timeline";

      /** Tùy chọn được truyền thẳng cho Semantic Parser V2. */
      parserOptions?: SemanticParserOptions;
    };

type SavedGroupRef = {
  groupId: string;

  /**
   * Tên nhóm tại thời điểm Group ID được lưu.
   * Chỉ dùng để xem và kiểm tra.
   */
  lastKnownName: string;

  savedAt: string;

  source:
    | "active_group_ui"
    | "manual";
};

type SavedGroupRefs =
  Record<
    string,
    SavedGroupRef
  >;

type Config = {
  webBaseUrl: string;
  internalSecret: string;
  scanIntervalMs: number;
  maxMessagesPerGroup: number;
  maxImagesPerBatch: number;
  maxFollowingImageMessages: number;
  groups: GroupConfigEntry[];
  roomTextKeywords: string[];

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

/**
 * Khi khai báo, Reader chỉ import các phòng
 * có sourceHash nằm trong danh sách này.
 *
 * Mảng rỗng = không import phòng nào.
 */
indexedDbImportSourceHashes?: string[];

/**
 * Giới hạn số phòng được thử import trong
 * một lượt quét. Tính cả lần thành công và lỗi.
 */
indexedDbImportLimit?: number;

  debugRetentionDays?: number;
  debugMaxSessions?: number;

  indexedDbScrollStepRatio?: number;
  indexedDbScrollWaitMs?: number;
  indexedDbScrollSettleMs?: number;
  indexedDbScrollStepsPerBatch?: number;
  indexedDbScrollMaxBatches?: number;
  indexedDbStopOnKnownRoom?: boolean;

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

    /**
     * Nguồn đã cung cấp nội dung đọc được cho message.
     * zdb chỉ giữ timeline; sidx/DOM bổ sung payload đã giải mã.
     */
    contentSource?:
      | "zdb"
      | "sidx"
      | "dom";

    domHydration?: {
      order: number;
      timeText?: string;
      approxTimestamp?: number | null;
    };
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

type IndexedDbRoomPreview = {
  sourceHash: string;

  groupId: string;
  senderUid: string;

  houseInfoText: string;
  markerText: string;
  descriptionTexts: string[];
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
const CONFIG_PATH =
  path.join(
    ROOT,
    "tools/zalo-reader/config.json"
  );

const STATE_PATH =
  path.join(
    ROOT,
    "tools/zalo-reader/state.json"
  );

/**
 * File riêng để lưu Group ID.
 *
 * Không dùng state.json vì state.json đang dành
 * cho sourceHash của những phòng đã import.
 */
const GROUP_REFS_PATH =
  path.join(
    ROOT,
    "tools/zalo-reader/group-refs.json"
  );

const PROFILE_DIR =
  path.join(
    ROOT,
    ".zalo-reader/profile"
  );

const NETWORK_SESSION_ID = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");

const NETWORK_LOG_DIR = path.join(
  ROOT,
  ".zalo-reader/network",
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
  if (!fs.existsSync(STATE_PATH)) {
    return {};
  }

  try {
    const raw = fs
      .readFileSync(STATE_PATH, "utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as Record<string, true>;
  } catch (error) {
    console.warn(
      "state.json không hợp lệ, Reader sẽ dùng state rỗng:",
      error
    );

    return {};
  }
}

function writeState(state: Record<string, true>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Chuyển một phần tử config nhóm thành:
 *
 * {
 *   key: "test-doc-zalo",
 *   name: "TEST ĐỌC ZALO"
 * }
 *
 * Vẫn hỗ trợ cấu hình string cũ để tránh
 * làm hỏng các nhóm chưa chuyển đổi.
 */
function normalizeGroupConfigEntry(
  entry: GroupConfigEntry
) {
  if (
    typeof entry === "string"
  ) {
    const name =
      String(entry || "")
        .trim();

    if (!name) {
      throw new Error(
        "Tên nhóm trong config đang bị rỗng"
      );
    }

    /*
     * Với dạng string cũ, key được tạo từ tên.
     * Nếu đổi tên thì key cũng đổi.
     *
     * Muốn đổi tên mà vẫn giữ Group ID,
     * phải dùng dạng { key, name }.
     */
    const key =
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .replace(
          /đ/g,
          "d"
        )
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          "");

    return {
      key,
      name,
    };
  }

  const key =
    String(
      entry?.key || ""
    ).trim();

  const name =
    String(
      entry?.name || ""
    ).trim();

  if (!key) {
    throw new Error(
      "Thiếu key cố định của nhóm trong config"
    );
  }

  if (!name) {
    throw new Error(
      `Thiếu tên nhóm cho key: ${key}`
    );
  }

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      key
    )
  ) {
    throw new Error(
      [
        `Group key không hợp lệ: ${key}.`,
        "Chỉ dùng chữ không dấu, số, dấu gạch ngang hoặc gạch dưới.",
      ].join(" ")
    );
  }

  return {
    key,
    name,
  };
}

/**
 * Đọc Group ID đã lưu.
 */
function readGroupRefs():
  SavedGroupRefs {
  if (
    !fs.existsSync(
      GROUP_REFS_PATH
    )
  ) {
    return {};
  }

  try {
    const raw =
      fs.readFileSync(
        GROUP_REFS_PATH,
        "utf8"
      )
        .replace(
          /^\uFEFF/,
          ""
        )
        .trim();

    if (!raw) {
      return {};
    }

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    const result:
      SavedGroupRefs = {};

    for (
      const [
        groupKey,
        value,
      ] of Object.entries(
        parsed
      )
    ) {
      const item =
        value as Partial<
          SavedGroupRef
        >;

      const groupId =
        String(
          item?.groupId || ""
        ).trim();

      if (
        !/^g\d{6,}$/.test(
          groupId
        )
      ) {
        continue;
      }

      result[groupKey] = {
        groupId,

        lastKnownName:
          String(
            item
              ?.lastKnownName ||
              ""
          ).trim(),

        savedAt:
          String(
            item?.savedAt ||
              ""
          ).trim(),

        source:
          item?.source ===
            "manual"
            ? "manual"
            : "active_group_ui",
      };
    }

    return result;
  } catch (error) {
    console.warn(
      [
        "group-refs.json không hợp lệ.",
        "Reader sẽ tạm dùng danh sách Group ID rỗng.",
      ].join(" "),
      error
    );

    return {};
  }
}

/**
 * Ghi Group ID xuống file.
 */
function writeGroupRefs(
  groupRefs: SavedGroupRefs
) {
  fs.mkdirSync(
    path.dirname(
      GROUP_REFS_PATH
    ),
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    GROUP_REFS_PATH,
    JSON.stringify(
      groupRefs,
      null,
      2
    ),
    "utf8"
  );
}

function hash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sleep(milliseconds: number): Promise<void> {
  const safeMilliseconds = Math.max(
    0,
    Number(milliseconds) || 0
  );

  return new Promise<void>((resolve) => {
    setTimeout(resolve, safeMilliseconds);
  });
}

function isRoomText(text: string, keywords: string[]) {
  const s = text.toLowerCase();
  return keywords.some((k) => s.includes(k.toLowerCase()));
}

function isBlockSeparator(text: string) {
  const t = String(text || "").replace(/\s/g, "");

  return (
    t.includes("///") ||
    t.includes("###") ||
    /^[-➖—_]{5,}/.test(t)
  );
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
  if (isHouseInfoText(raw)) return false;
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

function buildRoomUnitsFromMessages(groupName: string, messages: Msg[]): RoomUnit[] {
  const sorted = [...messages].sort((a, b) => a.top - b.top);

  const blocks: Msg[][] = [];
  let current: Msg[] = [];

  for (const msg of sorted) {
    if (isBlockSeparator(msg.text)) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }

    current.push(msg);
  }

  if (current.length > 0) blocks.push(current);

  const units: RoomUnit[] = [];

  for (const block of blocks) {
    const houseInfoMessages = block.filter((m) => isHouseInfoText(m.text));
    const houseInfoText = houseInfoMessages.map((m) => m.text).join("\n\n").trim();

    if (!houseInfoText) continue;

    const roomMarkers = block
      .map((m, index) => ({ msg: m, index }))
      .filter(({ msg }) => isRoomMarkerText(msg.text));

    if (roomMarkers.length === 0) continue;

       for (let i = 0; i < roomMarkers.length; i++) {
      const marker = roomMarkers[i];
      const prevMarker = roomMarkers[i - 1];
      const nextMarker = roomMarkers[i + 1];

      /**
       * Cấu trúc Zalo được áp dụng:
       *
       * [Ảnh phòng]
       * [Ảnh phòng]
       * Trống mã 702 giá 6tr5
       * Mô tả thêm
       *
       * Vì vậy:
       * - Ảnh trước marker thuộc marker hiện tại.
       * - Ảnh sau marker không được lấy cho phòng hiện tại.
       */

      const beforeStart = prevMarker ? prevMarker.index + 1 : 0;
      const beforeMessages = block.slice(beforeStart, marker.index);

      /**
       * Chỉ lấy ảnh nằm trước marker hiện tại.
       * Có lấy thêm ảnh nằm cùng message marker nếu Zalo render chung.
       */
      const imageSrcs = Array.from(
        new Set(
          [...beforeMessages, marker.msg]
            .filter((msg) => {
              if (isHouseInfoText(msg.text)) return false;
              return (msg.imageSrcs || []).length > 0;
            })
            .flatMap((msg) => msg.imageSrcs || [])
            .filter(Boolean)
        )
      );

      /**
       * Text riêng của phòng:
       * - Bắt đầu từ marker.
       * - Lấy thêm các message text phía sau.
       * - Dừng ngay khi gặp ảnh mới vì ảnh đó thuộc phòng kế tiếp.
       * - Dừng khi gặp marker phòng tiếp theo.
       */
      const roomTextMessages: Msg[] = [marker.msg];
      const textEnd = nextMarker ? nextMarker.index : block.length;

      for (let j = marker.index + 1; j < textEnd; j++) {
        const msg = block[j];

        if (isBlockSeparator(msg.text)) break;

        // Gặp bộ ảnh mới: đây là ảnh của phòng kế tiếp
        if ((msg.imageSrcs || []).length > 0) break;

        if (!String(msg.text || "").trim()) continue;
        if (isHouseInfoText(msg.text)) continue;
        if (isNoiseMessage(msg.text)) continue;

        roomTextMessages.push(msg);
      }

      const roomTextParts = roomTextMessages
        .map((msg) => msg.text)
        .filter((text) => {
          if (!String(text || "").trim()) return false;
          if (isHouseInfoText(text)) return false;
          if (isBlockSeparator(text)) return false;
          if (isNoiseMessage(text)) return false;
          return true;
        });

      const text = [houseInfoText, ...roomTextParts]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (
        !text ||
        !isRoomText(text, [
          "phòng",
          "phong",
          "trống",
          "trong",
          "giá",
          "gia",
          "quận",
          "quan",
        ])
      ) {
        continue;
      }

      const sourceHash = hash(
        [
          groupName,
          makeStableText(houseInfoText),
          makeStableText(marker.msg.text),
          imageSrcs.length,
        ].join("|")
      );

      units.push({
        text,
        senderName: marker.msg.senderName || "Không rõ",
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
  const search =
    page
      .locator(
        config.selectors.searchBox
      )
      .first();

  await search.click({
    timeout: 10_000,
  });

  /*
   * Xóa từ khóa cũ trước khi tìm nhóm mới.
   */
  await search.fill("");
  await page.waitForTimeout(250);

  await search.fill(
    groupName
  );

  /*
   * Không nhấn Enter.
   *
   * Zalo thường tự chọn kết quả đầu tiên khi Enter,
   * nên các tên gần giống nhau như:
   *
   * TOP DỰ ÁN QUẬN 1
   * TOP DỰ ÁN QUẬN 10 TRÊN 6TR
   *
   * có thể bị mở nhầm.
   */
  await page.waitForTimeout(
    1_800
  );

  const searchBox =
    await search
      .boundingBox()
      .catch(() => null);

  /*
   * Kết quả tìm kiếm nằm ở panel trái.
   * Dùng cạnh phải của ô tìm kiếm để phân biệt:
   * - kết quả tìm kiếm bên trái;
   * - tiêu đề nhóm đang mở bên phải.
   */
  const searchPanelRight =
    searchBox
      ? searchBox.x +
        searchBox.width +
        110
      : 360;

  /*
   * Chỉ lấy node có text khớp chính xác toàn bộ tên nhóm.
   * Tuyệt đối không dùng exact: false.
   */
  const exactMatches =
    page.getByText(
      groupName,
      {
        exact: true,
      }
    );

  const exactCount =
    await exactMatches
      .count()
      .catch(() => 0);

  let selectedIndex = -1;
  let selectedX =
    Number.POSITIVE_INFINITY;

  for (
    let index = 0;
    index < exactCount;
    index++
  ) {
    const candidate =
      exactMatches.nth(
        index
      );

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
     * Chỉ click kết quả nằm trong panel tìm kiếm bên trái.
     * Nếu có nhiều node trùng tên, chọn node nằm trái nhất.
     */
    if (
      box.x <
        searchPanelRight &&
      box.x <
        selectedX
    ) {
      selectedIndex =
        index;

      selectedX =
        box.x;
    }
  }

  if (
    selectedIndex < 0
  ) {
    throw new Error(
      [
        "Không tìm thấy nhóm khớp chính xác.",
        `Tên cần mở: "${groupName}".`,
        "Reader sẽ bỏ qua để tránh quét nhầm nhóm có tên gần giống.",
      ].join(" ")
    );
  }

  const selectedGroup =
    exactMatches.nth(
      selectedIndex
    );

  await selectedGroup
    .scrollIntoViewIfNeeded()
    .catch(() => {});

  await selectedGroup.click({
    timeout: 10_000,
  });

  await page.waitForTimeout(
    2_500
  );

  /*
   * Xác minh lại tiêu đề nhóm đang mở ở phần hội thoại bên phải.
   *
   * Nếu không có tiêu đề chính xác:
   * - dừng ngay;
   * - không cuộn;
   * - không đọc IndexedDB;
   * - không import.
   */
  const activeMatches =
    page.getByText(
      groupName,
      {
        exact: true,
      }
    );

  const activeCount =
    await activeMatches
      .count()
      .catch(() => 0);

  let verifiedActiveGroup =
    false;

  for (
    let index = 0;
    index < activeCount;
    index++
  ) {
    const candidate =
      activeMatches.nth(
        index
      );

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
     * Header nhóm thường nằm:
     * - bên phải panel tìm kiếm;
     * - gần phía trên cửa sổ.
     */
    if (
      box.x >=
        searchPanelRight - 20 &&
      box.y <= 180
    ) {
      verifiedActiveGroup =
        true;

      break;
    }
  }

  if (
    !verifiedActiveGroup
  ) {
    throw new Error(
      [
        "Đã click kết quả nhưng không xác minh được nhóm đang mở.",
        `Nhóm yêu cầu: "${groupName}".`,
        "Reader đã dừng để tránh import nhầm dữ liệu.",
      ].join(" ")
    );
  }

  console.log(
    `Đã mở đúng nhóm: ${groupName}`
  );
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

async function scrollChatToBottom(
  page: Page,
  messageItemsSelector = ""
) {
  await page.evaluate(
    ({ messageItemsSelector }) => {
      function isScrollable(
        element: Element
      ) {
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
            element.clientHeight + 120 &&
          rect.width > 250 &&
          rect.height > 180 &&
          rect.right >
            window.innerWidth * 0.55
        );
      }

      function findChatScroller() {
        const scores =
          new Map<
            HTMLElement,
            number
          >();

        if (messageItemsSelector) {
          const messageItems =
            Array.from(
              document.querySelectorAll(
                messageItemsSelector
              )
            ).slice(-200);

          for (
            const messageItem of
            messageItems
          ) {
            let current:
              | HTMLElement
              | null =
              messageItem.parentElement;

            let depth = 0;

            while (
              current &&
              depth < 12
            ) {
              if (
                isScrollable(current)
              ) {
                scores.set(
                  current,
                  (
                    scores.get(
                      current
                    ) || 0
                  ) +
                    Math.max(
                      1,
                      12 - depth
                    )
                );
              }

              current =
                current.parentElement;
              depth += 1;
            }
          }
        }

        const rankedFromMessages =
          Array.from(
            scores.entries()
          )
            .sort(
              (a, b) =>
                b[1] - a[1] ||
                b[0].scrollHeight -
                  a[0].scrollHeight
            )
            .map(
              ([element]) =>
                element
            );

        if (
          rankedFromMessages.length > 0
        ) {
          return rankedFromMessages[0];
        }

        return Array.from(
          document.querySelectorAll(
            "div"
          )
        )
          .filter(
            (element) =>
              isScrollable(
                element
              )
          )
          .sort(
            (a, b) =>
              b.scrollHeight -
              a.scrollHeight
          )[0] as
          | HTMLElement
          | undefined;
      }

      const chatScroller =
        findChatScroller();

      if (chatScroller) {
        chatScroller.scrollTop =
          chatScroller.scrollHeight;
      }
    },
    {
      messageItemsSelector,
    }
  );

  await page.waitForTimeout(800);
}

async function triggerNetworkHistoryLoad(
  page: Page,
  steps = 10,
  messageItemsSelector = ""
) {
  await scrollChatToBottom(
    page,
    messageItemsSelector
  );

  await page.waitForTimeout(
    2_500
  );

  for (let i = 0; i < steps; i++) {
    const moved =
      await page.evaluate(
        ({ messageItemsSelector }) => {
          function isScrollable(
            element: Element
          ) {
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
                  120 &&
              rect.width > 250 &&
              rect.height > 180 &&
              rect.right >
                window.innerWidth *
                  0.55
            );
          }

          const scores =
            new Map<
              HTMLElement,
              number
            >();

          if (messageItemsSelector) {
            const messageItems =
              Array.from(
                document.querySelectorAll(
                  messageItemsSelector
                )
              ).slice(-200);

            for (
              const messageItem of
              messageItems
            ) {
              let current:
                | HTMLElement
                | null =
                messageItem.parentElement;

              let depth = 0;

              while (
                current &&
                depth < 12
              ) {
                if (
                  isScrollable(
                    current
                  )
                ) {
                  scores.set(
                    current,
                    (
                      scores.get(
                        current
                      ) || 0
                    ) +
                      Math.max(
                        1,
                        12 - depth
                      )
                  );
                }

                current =
                  current.parentElement;
                depth += 1;
              }
            }
          }

          const chatScroller =
            Array.from(
              scores.entries()
            )
              .sort(
                (a, b) =>
                  b[1] - a[1] ||
                  b[0].scrollHeight -
                    a[0].scrollHeight
              )[0]?.[0] ||
            (
              Array.from(
                document.querySelectorAll(
                  "div"
                )
              )
                .filter(
                  (element) =>
                    isScrollable(
                      element
                    )
                )
                .sort(
                  (a, b) =>
                    b.scrollHeight -
                    a.scrollHeight
                )[0] as
                | HTMLElement
                | undefined
            );

          if (!chatScroller) {
            return false;
          }

          const oldTop =
            chatScroller.scrollTop;

          chatScroller.scrollTop =
            Math.max(
              0,
              oldTop -
                chatScroller.clientHeight *
                  0.4
            );

          return (
            chatScroller.scrollTop !==
            oldTop
          );
        },
        {
          messageItemsSelector,
        }
      );

    await page.waitForTimeout(
      2_200
    );

    if (!moved) break;
  }

  await scrollChatToBottom(
    page,
    messageItemsSelector
  );

  await page.waitForTimeout(
    1_500
  );
}

type DomMessageSnapshot = {
  order: number;
  top: number;
  bottom: number;
  text: string;
  senderName: string;
  timeText: string;
  approxTimestamp: number | null;
  idCandidates: string[];
  images: Array<{
    url: string;
    idCandidates: string[];

    /** URL blob ban đầu của Zalo, chỉ dùng debug. */
    originalUrl?: string;

    /** Ảnh blob đã được chép ra file cục bộ khi bubble còn trong DOM. */
    cachedLocalFile?: boolean;
    mimeType?: string;
    sizeBytes?: number;
  }>;
  videoUrls: string[];

  /**
   * identity: phần tử được dựng từ node có msgId/cliMsgId thật.
   * selector: phần tử fallback từ config.selectors.messageItems.
   */
  sourceType: "identity" | "selector";

  /**
   * Dùng để phát hiện selector bắt nhầm container chứa nhiều message con.
   */
  descendantIdentityCount: number;
  textLength: number;
};

async function captureVisibleDomMessages(
  page: Page,
  config: Config
): Promise<DomMessageSnapshot[]> {
  return page.evaluate(
    ({
      messageItemsSelector,
      messageTextSelector,
      messageSenderSelector,
      imageNodesSelector,
    }) => {
      const identitySelector = [
        "[id]",
        "[data-id]",
        "[data-msg-id]",
        "[data-msgid]",
        "[data-cli-msg-id]",
        "[data-climsgid]",
      ].join(", ");

      function cleanText(input: any) {
        return String(input || "")
          .replace(/\u00a0/g, " ")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function normalizeText(input: any) {
        return cleanText(input)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .toLowerCase();
      }

      function isUiOnlyLine(input: string) {
        const line = cleanText(input);
        const normalized = normalizeText(line);

        if (!line) return true;

        if (
          /^\/-(?:strong|heart)$/i.test(line) ||
          /^:(?:>|o|-\(\(|-h)$/i.test(line)
        ) {
          return true;
        }

        if (/^\d{1,2}:\d{2}$/.test(line)) {
          return true;
        }

        if (
          /^(?:hom qua|hom nay|hôm qua|hôm nay)$/i.test(
            line
          )
        ) {
          return true;
        }

        if (
          /^(?:t[2-7]|cn)\s+\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?$/i.test(
            normalized
          ) ||
          /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(
            normalized
          )
        ) {
          return true;
        }

        return false;
      }

      function cleanMessageText(input: any) {
        return cleanText(
          cleanText(input)
            .split("\n")
            .map((line) => line.trim())
            .filter(
              (line) =>
                Boolean(line) &&
                !isUiOnlyLine(line)
            )
            .join("\n")
        );
      }

      function isScrollable(
        element: Element
      ) {
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
            element.clientHeight + 120 &&
          rect.width > 250 &&
          rect.height > 180 &&
          rect.right >
            window.innerWidth * 0.55
        );
      }

      function findChatScroller() {
        const scores =
          new Map<
            HTMLElement,
            number
          >();

        const messageItems =
          messageItemsSelector
            ? Array.from(
                document.querySelectorAll(
                  messageItemsSelector
                )
              ).slice(-250)
            : [];

        for (
          const messageItem of
          messageItems
        ) {
          let current:
            | HTMLElement
            | null =
            messageItem.parentElement;

          let depth = 0;

          while (
            current &&
            depth < 12
          ) {
            if (
              isScrollable(current)
            ) {
              scores.set(
                current,
                (
                  scores.get(
                    current
                  ) || 0
                ) +
                  Math.max(
                    1,
                    12 - depth
                  )
              );
            }

            current =
              current.parentElement;
            depth += 1;
          }
        }

        return (
          Array.from(
            scores.entries()
          )
            .sort(
              (a, b) =>
                b[1] - a[1] ||
                b[0].scrollHeight -
                  a[0].scrollHeight
            )[0]?.[0] ||
          (
            Array.from(
              document.querySelectorAll(
                "div"
              )
            )
              .filter(
                (element) =>
                  isScrollable(
                    element
                  )
              )
              .sort(
                (a, b) =>
                  b.scrollHeight -
                  a.scrollHeight
              )[0] as
              | HTMLElement
              | undefined
          )
        );
      }

      function idsFromAttributes(
        element: Element
      ) {
        const ids = new Set<string>();

        for (
          const attribute of
          Array.from(
            element.attributes || []
          )
        ) {
          const value = String(
            attribute.value || ""
          );

          for (
            const match of
            value.matchAll(
              /\d{12,16}/g
            )
          ) {
            ids.add(match[0]);
          }
        }

        return Array.from(ids);
      }

      function collectDescendantIds(
        root: Element,
        maxIds = 12
      ) {
        const ids = new Set<string>();

        const nodes = [
          root,
          ...Array.from(
            root.querySelectorAll(
              identitySelector
            )
          ).slice(0, 180),
        ];

        for (const node of nodes) {
          for (
            const id of
            idsFromAttributes(node)
          ) {
            ids.add(id);

            if (
              ids.size >= maxIds
            ) {
              return Array.from(ids);
            }
          }
        }

        return Array.from(ids);
      }

      function collectNearestIds(
        root: Element
      ) {
        let current:
          | Element
          | null = root;

        for (
          let depth = 0;
          current && depth < 8;
          depth++
        ) {
          const ownIds =
            idsFromAttributes(
              current
            );

          if (ownIds.length > 0) {
            return ownIds.slice(0, 4);
          }

          current =
            current.parentElement;
        }

        return [];
      }

      function extractCssUrl(
        input: string
      ) {
        const match =
          String(input || "").match(
            /url\(["']?([^"')]+)["']?\)/i
          );

        return match?.[1] || "";
      }

      function isUsefulMediaUrl(
        input: any
      ) {
        const url = String(
          input || ""
        ).trim();

        if (!url) return false;

        const lower =
          url.toLowerCase();

        return !(
          lower.includes("emoji") ||
          lower.includes("sticker") ||
          lower.includes("avatar") ||
          lower.includes("reaction") ||
          lower.includes("icon") ||
          lower.includes("logo")
        );
      }

      function extractTimeLabel(
        input: any
      ) {
        const lines = cleanText(input)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const timeLine =
          lines.find((line) =>
            /^\d{1,2}:\d{2}$/.test(
              line
            )
          ) || "";

        const dayLine =
          lines.find((line) => {
            const normalized =
              normalizeText(line);

            return (
              /^(?:hom qua|hom nay)$/.test(
                normalized
              ) ||
              /^(?:t[2-7]|cn)\s+\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?$/.test(
                normalized
              ) ||
              /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(
                normalized
              )
            );
          }) || "";

        return cleanText(
          [dayLine, timeLine]
            .filter(Boolean)
            .join(" ")
        );
      }

      function parseApproxTimestamp(
        input: string
      ) {
        const text =
          normalizeText(input);

        const timeMatch =
          text.match(
            /\b(\d{1,2}):(\d{2})\b/
          );

        if (!timeMatch) {
          return null;
        }

        const hour =
          Number(timeMatch[1]);
        const minute =
          Number(timeMatch[2]);

        if (
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          return null;
        }

        const now = new Date();
        let target = new Date(now);

        const dateMatch =
          text.match(
            /\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/
          );

        if (dateMatch) {
          let year = dateMatch[3]
            ? Number(dateMatch[3])
            : now.getFullYear();

          if (year < 100) {
            year += 2000;
          }

          target = new Date(
            year,
            Number(dateMatch[2]) - 1,
            Number(dateMatch[1]),
            hour,
            minute,
            0,
            0
          );
        } else {
          target.setHours(
            hour,
            minute,
            0,
            0
          );

          if (
            text.includes("hom qua")
          ) {
            target.setDate(
              target.getDate() - 1
            );
          } else if (
            !text.includes("hom nay") &&
            target.getTime() >
              now.getTime() +
                15 * 60 * 1000
          ) {
            target.setDate(
              target.getDate() - 1
            );
          }
        }

        return target.getTime();
      }

      function isVisibleElement(
        element: Element,
        conversationRect: {
          left: number;
          right: number;
          top: number;
          bottom: number;
        }
      ) {
        const rect =
          element.getBoundingClientRect();

        const style =
          window.getComputedStyle(
            element
          );

        return (
          rect.width > 20 &&
          rect.height > 8 &&
          rect.right >
            conversationRect.left &&
          rect.left <
            conversationRect.right &&
          rect.bottom >
            conversationRect.top - 40 &&
          rect.top <
            conversationRect.bottom + 40 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }

      const chatScroller =
        findChatScroller();

      const conversationRoot:
        ParentNode =
        chatScroller ||
        document.body;

      const conversationRect =
        chatScroller
          ? chatScroller.getBoundingClientRect()
          : {
              left:
                window.innerWidth * 0.28,
              right:
                window.innerWidth,
              top: 70,
              bottom:
                window.innerHeight - 30,
            };

      function findIdentityMessageRoot(
        seed: Element
      ) {
        let current: Element = seed;
        let best: Element = seed;

        for (
          let depth = 0;
          depth < 9;
          depth++
        ) {
          const parent =
            current.parentElement;

          if (
            !parent ||
            parent === chatScroller ||
            !conversationRoot.contains(
              parent
            )
          ) {
            break;
          }

          const parentIds =
            collectDescendantIds(
              parent,
              8
            );

          /**
           * Một message thật thường chỉ có msgId và cliMsgId.
           * Nếu ancestor chứa quá nhiều ID thì đó là container nhiều message.
           */
          if (parentIds.length > 4) {
            break;
          }

          const rect =
            parent.getBoundingClientRect();

          if (
            rect.width >
              conversationRect.right -
                conversationRect.left +
                80 ||
            rect.height > 1400
          ) {
            break;
          }

          const text =
            cleanMessageText(
              (parent as HTMLElement)
                .innerText ||
                parent.textContent ||
                ""
            );

          const hasMedia =
            parent.querySelector(
              "img, video, [style*='background-image']"
            ) != null;

          if (text || hasMedia) {
            best = parent;
          }

          current = parent;
        }

        return best;
      }

      const explicitIdentityNodes =
        Array.from(
          conversationRoot.querySelectorAll(
            identitySelector
          )
        )
          .filter(
            (element) =>
              idsFromAttributes(
                element
              ).length > 0
          )
          .filter((element) =>
            isVisibleElement(
              element,
              conversationRect
            )
          )
          .slice(-600);

      const identityRoots =
        Array.from(
          new Set(
            explicitIdentityNodes.map(
              findIdentityMessageRoot
            )
          )
        ).filter((element) =>
          isVisibleElement(
            element,
            conversationRect
          )
        );

      const identityRootSet =
        new Set(identityRoots);

      const selectorItems =
        messageItemsSelector
          ? Array.from(
              conversationRoot.querySelectorAll(
                messageItemsSelector
              )
            ).filter((element) =>
              isVisibleElement(
                element,
                conversationRect
              )
            )
          : [];

      const allCandidateItems =
        Array.from(
          new Set([
            ...identityRoots,
            ...selectorItems,
          ])
        );

      /**
       * Loại selector cha đang chứa nhiều message con.
       * Đây là nguyên nhân cũ làm cả vùng chat bị gắn vào một msgId ngày 10/7.
       */
      const messageItems =
        allCandidateItems.filter(
          (element) => {
            if (
              identityRootSet.has(
                element
              )
            ) {
              return true;
            }

            const containedIdentityCount =
              identityRoots.filter(
                (root) =>
                  root !== element &&
                  element.contains(root)
              ).length;

            if (
              containedIdentityCount >= 2
            ) {
              return false;
            }

            const containedCandidateCount =
              allCandidateItems.filter(
                (candidate) =>
                  candidate !== element &&
                  element.contains(
                    candidate
                  )
              ).length;

            return (
              containedCandidateCount < 2
            );
          }
        );

      const timeCandidates =
        Array.from(
          conversationRoot.querySelectorAll(
            "div, span"
          )
        )
          .map((element) => {
            const rect =
              element.getBoundingClientRect();

            const rawText = cleanText(
              (element as HTMLElement)
                .innerText ||
                element.textContent ||
                ""
            );

            return {
              top: rect.top,
              left: rect.left,
              text:
                extractTimeLabel(
                  rawText
                ),
            };
          })
          .filter(
            (item) =>
              Boolean(item.text) &&
              item.left >=
                conversationRect.left - 5 &&
              item.top >=
                conversationRect.top - 40 &&
              item.top <=
                conversationRect.bottom + 40
          )
          .sort(
            (a, b) =>
              a.top - b.top
          );

      const rows = messageItems
        .map((element, order) => {
          const rect =
            element.getBoundingClientRect();

          const senderElement =
            messageSenderSelector
              ? element.querySelector(
                  messageSenderSelector
                )
              : null;

          const senderName =
            cleanMessageText(
              (senderElement as HTMLElement)
                ?.innerText ||
                senderElement?.textContent ||
                ""
            );

          const textElements =
            messageTextSelector
              ? Array.from(
                  element.querySelectorAll(
                    messageTextSelector
                  )
                )
              : [];

          let text =
            cleanMessageText(
              textElements.length > 0
                ? Array.from(
                    new Set(
                      textElements
                        .map((item) =>
                          cleanMessageText(
                            (
                              item as HTMLElement
                            ).innerText ||
                              item.textContent ||
                              ""
                          )
                        )
                        .filter(Boolean)
                    )
                  ).join("\n")
                : (
                    element as HTMLElement
                  ).innerText ||
                    element.textContent ||
                    ""
            );

          if (
            senderName &&
            text.startsWith(
              senderName
            )
          ) {
            text = cleanMessageText(
              text.slice(
                senderName.length
              )
            );
          }

          const nearestTime =
            timeCandidates
              .filter(
                (candidate) =>
                  candidate.top >=
                    rect.top - 180 &&
                  candidate.top <=
                    rect.bottom + 30
              )
              .sort(
                (a, b) =>
                  Math.abs(
                    a.top - rect.top
                  ) -
                  Math.abs(
                    b.top - rect.top
                  )
              )[0] || null;

          const timeText =
            nearestTime?.text || "";

          const imageNodes =
            Array.from(
              element.querySelectorAll(
                imageNodesSelector ||
                  "img"
              )
            );

          const images =
            imageNodes
              .map((image) => {
                const imageElement =
                  image as HTMLImageElement;

                const imageRect =
                  imageElement.getBoundingClientRect();

                const url = String(
                  imageElement.currentSrc ||
                    imageElement.src ||
                    imageElement.getAttribute(
                      "src"
                    ) ||
                    ""
                ).trim();

                return {
                  url,
                  width:
                    imageRect.width ||
                    imageElement.naturalWidth ||
                    0,
                  height:
                    imageRect.height ||
                    imageElement.naturalHeight ||
                    0,
                  idCandidates:
                    collectNearestIds(
                      imageElement
                    ),
                };
              })
              .filter(
                (image) =>
                  isUsefulMediaUrl(
                    image.url
                  ) &&
                  image.width >= 70 &&
                  image.height >= 70
              );

          const backgroundImages =
            Array.from(
              element.querySelectorAll(
                "[style*='background-image']"
              )
            )
              .map((node) => {
                const style =
                  window.getComputedStyle(
                    node
                  );

                const nodeRect =
                  node.getBoundingClientRect();

                return {
                  url: extractCssUrl(
                    style.backgroundImage
                  ),
                  width: nodeRect.width,
                  height: nodeRect.height,
                  idCandidates:
                    collectNearestIds(
                      node
                    ),
                };
              })
              .filter(
                (image) =>
                  isUsefulMediaUrl(
                    image.url
                  ) &&
                  image.width >= 70 &&
                  image.height >= 70
              );

          const uniqueImages =
            new Map<
              string,
              {
                url: string;
                idCandidates: string[];
              }
            >();

          for (
            const image of [
              ...images,
              ...backgroundImages,
            ]
          ) {
            if (
              !uniqueImages.has(
                image.url
              )
            ) {
              uniqueImages.set(
                image.url,
                {
                  url: image.url,
                  idCandidates:
                    image.idCandidates,
                }
              );
            }
          }

          const videoUrls =
            Array.from(
              new Set(
                Array.from(
                  element.querySelectorAll(
                    "video, video source"
                  )
                )
                  .flatMap((node) => [
                    String(
                      (
                        node as HTMLVideoElement
                      ).currentSrc || ""
                    ),
                    String(
                      node.getAttribute(
                        "src"
                      ) || ""
                    ),
                  ])
                  .map((url) =>
                    url.trim()
                  )
                  .filter(Boolean)
              )
            );

          const descendantIdentityCount =
            identityRoots.filter(
              (root) =>
                root !== element &&
                element.contains(root)
            ).length;

          const rawIds =
            collectDescendantIds(
              element,
              7
            );

          const idCandidates =
            rawIds.length <= 4
              ? rawIds
              : collectNearestIds(
                  element
                );

          const sourceType =
            identityRootSet.has(
              element
            )
              ? "identity"
              : "selector";

          const separatorCount =
            (
              text.match(
                /➖+\s*\/{3}\s*➖+/g
              ) || []
            ).length;

          const visibleTimeCount =
            (
              text.match(
                /\b\d{1,2}:\d{2}\b/g
              ) || []
            ).length;

          const looksAggregate =
            descendantIdentityCount >= 2 ||
            rawIds.length > 4 ||
            (
              Array.from(
                uniqueImages.values()
              ).length > 20 &&
              text.length > 300
            ) ||
            (
              separatorCount >= 3 &&
              visibleTimeCount >= 3
            ) ||
            (
              text.length > 2000 &&
              (
                visibleTimeCount >= 3 ||
                separatorCount >= 2
              )
            );

          return {
            order,
            top: rect.top,
            bottom: rect.bottom,
            text,
            senderName,
            timeText,
            approxTimestamp:
              parseApproxTimestamp(
                timeText
              ),
            idCandidates,
            images:
              Array.from(
                uniqueImages.values()
              ),
            videoUrls,
            sourceType,
            descendantIdentityCount,
            textLength: text.length,
            looksAggregate,
          };
        })
        .filter(
          (row) =>
            !row.looksAggregate &&
            (
              Boolean(row.text) ||
              row.images.length > 0 ||
              row.videoUrls.length > 0
            )
        )
        .sort(
          (a, b) =>
            a.top - b.top ||
            a.bottom - b.bottom
        );

      const deduped =
        new Map<string, any>();

      for (const row of rows) {
        const signature = [
          row.idCandidates
            .slice()
            .sort()
            .join("|"),
          normalizeText(row.text),
          row.images
            .map((image) =>
              image.url
            )
            .sort()
            .join("|"),
        ].join("||");

        if (!deduped.has(signature)) {
          deduped.set(
            signature,
            row
          );
        }
      }

      return Array.from(
        deduped.values()
      ).map((row, order) => ({
        order,
        top: row.top,
        bottom: row.bottom,
        text: row.text,
        senderName:
          row.senderName,
        timeText: row.timeText,
        approxTimestamp:
          row.approxTimestamp,
        idCandidates:
          row.idCandidates,
        images: row.images,
        videoUrls:
          row.videoUrls,
        sourceType:
          row.sourceType,
        descendantIdentityCount:
          row.descendantIdentityCount,
        textLength:
          row.textLength,
      }));
    },
    {
      messageItemsSelector:
        config.selectors
          .messageItems,
      messageTextSelector:
        config.selectors
          .messageText || "",
      messageSenderSelector:
        config.selectors
          .messageSender || "",
      imageNodesSelector:
        config.selectors
          .imageNodes || "img",
    }
  );
}

type DomMessageScrollCaptureResult = {
  items: DomMessageSnapshot[];
  viewportCount: number;
  attemptedSteps: number;
  movedSteps: number;
  reachedTop: boolean;
  consecutiveNoNewItems: number;

  blobMediaCache: {
    cacheDir: string;
    attemptedCount: number;
    cachedCount: number;
    failedCount: number;
    reusedCount: number;
    totalBytes: number;
    failures: Array<{
      url: string;
      messageId: string;
      error: string;
    }>;
  };
};

/**
 * Zalo hiển thị tin mới nhất ở dưới cùng và dùng danh sách ảo hóa.
 * Vì vậy không thể cuộn lên để tải rồi quay xuống cuối mới chụp một lần:
 * các bubble cũ đã rời viewport có thể đã bị gỡ khỏi DOM.
 *
 * Hàm này bắt đầu ở đáy, chụp từng viewport, cuộn dần lên và cộng dồn
 * message theo msgId/cliMsgId. Thứ tự thật sau cùng vẫn lấy từ zdb.
 */
async function captureDomMessagesWhileScrollingUp(
  page: Page,
  config: Config
): Promise<DomMessageScrollCaptureResult> {
  const rawStepRatio = Number(
    config.indexedDbScrollStepRatio ?? 0.65
  );

  const stepRatio = Math.max(
    0.25,
    Math.min(
      0.9,
      Number.isFinite(rawStepRatio)
        ? rawStepRatio
        : 0.65
    )
  );

  const rawWaitMs = Number(
    config.indexedDbScrollWaitMs ?? 900
  );

  const waitMs = Math.max(
    300,
    Math.min(
      5_000,
      Number.isFinite(rawWaitMs)
        ? rawWaitMs
        : 900
    )
  );

  const rawSettleMs = Number(
    config.indexedDbScrollSettleMs ?? 1_400
  );

  const settleMs = Math.max(
    500,
    Math.min(
      8_000,
      Number.isFinite(rawSettleMs)
        ? rawSettleMs
        : 1_400
    )
  );

  const rawStepsPerBatch = Number(
    config.indexedDbScrollStepsPerBatch ?? 4
  );

  const stepsPerBatch = Math.max(
    1,
    Math.min(
      12,
      Number.isFinite(rawStepsPerBatch)
        ? Math.floor(rawStepsPerBatch)
        : 4
    )
  );

  const rawMaxBatches = Number(
    config.indexedDbScrollMaxBatches ?? 5
  );

  const maxBatches = Math.max(
    1,
    Math.min(
      20,
      Number.isFinite(rawMaxBatches)
        ? Math.floor(rawMaxBatches)
        : 5
    )
  );

  const maxSteps =
    stepsPerBatch * maxBatches;

  /**
   * Blob URL của Zalo chỉ sống trong tab hiện tại và có thể bị revoke
   * khi bubble rời khỏi danh sách ảo. Vì vậy phải chép byte ảnh ra file
   * ngay trong lúc viewport đó còn đang hiển thị.
   */
  const blobMediaCacheDir =
    path.join(
      NETWORK_LOG_DIR,
      "dom-media"
    );

  fs.mkdirSync(
    blobMediaCacheDir,
    { recursive: true }
  );

  const blobMediaCache = {
    cacheDir:
      blobMediaCacheDir,
    attemptedCount: 0,
    cachedCount: 0,
    failedCount: 0,
    reusedCount: 0,
    totalBytes: 0,
    failures: [] as Array<{
      url: string;
      messageId: string;
      error: string;
    }>,
  };

  const cachedBlobByMessage =
    new Map<string, string>();

  function normalizeBlobMimeType(
    input: any
  ) {
    const mimeType = String(
      input || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (mimeType === "image/jpg") {
      return "image/jpeg";
    }

    return mimeType;
  }

  function getBlobFileExtension(
    mimeType: string
  ) {
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/avif":
        return "avif";
      case "image/gif":
        return "gif";
      case "image/jxl":
        return "jxl";
      default:
        return "bin";
    }
  }

  function safeBlobMessageKey(
    input: any
  ) {
    const value = String(
      input || ""
    )
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 80);

    return value ||
      crypto.randomUUID();
  }

  async function cacheViewportBlobImages(
    items: DomMessageSnapshot[]
  ) {
    for (const item of items) {
      const itemMessageId = String(
        item.idCandidates?.[0] || ""
      ).trim();

      for (
        let imageIndex = 0;
        imageIndex <
        (item.images || []).length;
        imageIndex++
      ) {
        const image =
          item.images[imageIndex];

        const originalUrl = String(
          image?.url || ""
        ).trim();

        if (
          !originalUrl ||
          !originalUrl
            .toLowerCase()
            .startsWith("blob:")
        ) {
          continue;
        }

        blobMediaCache.attemptedCount += 1;

        const imageMessageId = String(
          image.idCandidates?.[0] ||
            itemMessageId ||
            hash(originalUrl).slice(0, 24)
        ).trim();

        const cacheKey = [
          imageMessageId,
          imageIndex,
        ].join(":");

        const reusedLocalUrl =
          cachedBlobByMessage.get(
            cacheKey
          );

        if (reusedLocalUrl) {
          image.originalUrl =
            originalUrl;
          image.url =
            reusedLocalUrl;
          image.cachedLocalFile =
            true;

          blobMediaCache.reusedCount += 1;
          continue;
        }

        try {
          const payload =
            await page.evaluate(
              async (blobUrl) => {
                const response =
                  await fetch(blobUrl);

                if (!response.ok) {
                  throw new Error(
                    `HTTP ${response.status}`
                  );
                }

                const blob =
                  await response.blob();

                const arrayBuffer =
                  await blob.arrayBuffer();

                const bytes =
                  new Uint8Array(
                    arrayBuffer
                  );

                let binary = "";
                const chunkSize =
                  0x8000;

                for (
                  let offset = 0;
                  offset < bytes.length;
                  offset += chunkSize
                ) {
                  const chunk =
                    bytes.subarray(
                      offset,
                      Math.min(
                        offset +
                          chunkSize,
                        bytes.length
                      )
                    );

                  binary +=
                    String.fromCharCode(
                      ...chunk
                    );
                }

                return {
                  base64:
                    btoa(binary),
                  mimeType:
                    blob.type ||
                    response.headers.get(
                      "content-type"
                    ) ||
                    "application/octet-stream",
                  sizeBytes:
                    bytes.length,
                };
              },
              originalUrl
            );

          const sourceBuffer =
            Buffer.from(
              payload.base64,
              "base64"
            );

          if (sourceBuffer.length === 0) {
            throw new Error(
              "Blob ảnh trả về dữ liệu rỗng"
            );
          }

          const mimeType =
            normalizeBlobMimeType(
              payload.mimeType
            );

          if (
            !mimeType.startsWith(
              "image/"
            )
          ) {
            throw new Error(
              `Blob không phải ảnh: ${mimeType || "unknown"}`
            );
          }

          const extension =
            getBlobFileExtension(
              mimeType
            );

          const fileName = [
            safeBlobMessageKey(
              imageMessageId
            ),
            imageIndex,
          ].join("-") +
            `.${extension}`;

          const filePath =
            path.join(
              blobMediaCacheDir,
              fileName
            );

          fs.writeFileSync(
            filePath,
            sourceBuffer
          );

          const localFileUrl =
            pathToFileURL(
              filePath
            ).href;

          cachedBlobByMessage.set(
            cacheKey,
            localFileUrl
          );

          image.originalUrl =
            originalUrl;
          image.url =
            localFileUrl;
          image.cachedLocalFile =
            true;
          image.mimeType =
            mimeType;
          image.sizeBytes =
            sourceBuffer.length;

          blobMediaCache.cachedCount += 1;
          blobMediaCache.totalBytes +=
            sourceBuffer.length;
        } catch (error: any) {
          const errorMessage =
            error?.message ||
            String(error);

          blobMediaCache.failedCount += 1;

          if (
            blobMediaCache.failures.length <
            50
          ) {
            blobMediaCache.failures.push({
              url: originalUrl,
              messageId:
                imageMessageId,
              error:
                errorMessage,
            });
          }

          console.warn(
            [
              "Không lưu được blob ảnh DOM:",
              imageMessageId ||
                "không rõ ID",
              errorMessage,
            ].join(" ")
          );
        }
      }
    }
  }

  const collected =
    new Map<string, DomMessageSnapshot>();

  /**
   * orderedKeys luôn giữ thứ tự cũ → mới:
   * - viewport đầu tiên ở đáy được append;
   * - các item mới tìm thấy khi cuộn lên được prepend.
   */
  const orderedKeys: string[] = [];

  function normalizeSnapshotText(
    input: string
  ) {
    return String(input || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSnapshotKey(
    item: DomMessageSnapshot
  ) {
    const ids = Array.isArray(
      item.idCandidates
    )
      ? item.idCandidates
          .map((value) =>
            String(value || "").trim()
          )
          .filter(Boolean)
      : [];

    /**
     * captureVisibleDomMessages đặt msgId/cliMsgId gần nhất lên đầu.
     * Dùng ID đầu tiên giúp cùng một bubble không bị nhân đôi giữa
     * hai viewport chồng lấn.
     */
    if (ids[0]) {
      return `id:${ids[0]}`;
    }

    const mediaSignature = [
      ...(Array.isArray(item.images)
        ? item.images.map((image) =>
            String(image?.url || "").trim()
          )
        : []),
      ...(Array.isArray(item.videoUrls)
        ? item.videoUrls.map((url) =>
            String(url || "").trim()
          )
        : []),
    ]
      .filter(Boolean)
      .sort()
      .join("|");

    return [
      "fallback",
      normalizeSnapshotText(item.text),
      String(item.timeText || ""),
      mediaSignature,
    ].join(":");
  }

  function mergeSnapshotItem(
    current: DomMessageSnapshot,
    incoming: DomMessageSnapshot
  ): DomMessageSnapshot {
    const currentText =
      String(current.text || "");

    const incomingText =
      String(incoming.text || "");

    const useIncomingText =
      incomingText.length >
      currentText.length;

    const currentImages =
      Array.isArray(current.images)
        ? current.images
        : [];

    const incomingImages =
      Array.isArray(incoming.images)
        ? incoming.images
        : [];

    const currentVideos =
      Array.isArray(current.videoUrls)
        ? current.videoUrls
        : [];

    const incomingVideos =
      Array.isArray(incoming.videoUrls)
        ? incoming.videoUrls
        : [];

    const idCandidates = Array.from(
      new Set([
        ...(current.idCandidates || []),
        ...(incoming.idCandidates || []),
      ])
    ).slice(0, 4);

    return {
      ...current,

      text: useIncomingText
        ? incomingText
        : currentText,

      textLength: Math.max(
        Number(current.textLength || 0),
        Number(incoming.textLength || 0)
      ),

      senderName:
        current.senderName ||
        incoming.senderName ||
        "",

      timeText:
        current.timeText ||
        incoming.timeText ||
        "",

      approxTimestamp:
        current.approxTimestamp ??
        incoming.approxTimestamp ??
        null,

      idCandidates,

      /**
       * Một identity row ảnh tương ứng một message ảnh.
       * Không cộng nhiều blob URL của các lần render khác nhau vào
       * cùng message; chỉ chọn bản chụp có nhiều media hơn.
       */
      images:
        (
          incomingImages.filter(
            (image) =>
              image.cachedLocalFile ||
              String(
                image.url || ""
              )
                .toLowerCase()
                .startsWith("file:")
          ).length >
          currentImages.filter(
            (image) =>
              image.cachedLocalFile ||
              String(
                image.url || ""
              )
                .toLowerCase()
                .startsWith("file:")
          ).length
        ) ||
        incomingImages.length >
          currentImages.length
          ? incomingImages
          : currentImages,

      videoUrls:
        incomingVideos.length >
        currentVideos.length
          ? incomingVideos
          : currentVideos,

      sourceType:
        current.sourceType === "identity" ||
        incoming.sourceType === "identity"
          ? "identity"
          : "selector",

      descendantIdentityCount:
        Math.min(
          Number(
            current.descendantIdentityCount || 0
          ),
          Number(
            incoming.descendantIdentityCount || 0
          )
        ),
    };
  }

  function addViewport(
    items: DomMessageSnapshot[],
    prependNewItems: boolean
  ) {
    const newKeys: string[] = [];

    for (const item of items) {
      const key = getSnapshotKey(item);
      const current = collected.get(key);

      if (current) {
        collected.set(
          key,
          mergeSnapshotItem(
            current,
            item
          )
        );
        continue;
      }

      collected.set(key, item);
      newKeys.push(key);
    }

    if (newKeys.length > 0) {
      if (prependNewItems) {
        orderedKeys.unshift(...newKeys);
      } else {
        orderedKeys.push(...newKeys);
      }
    }

    return newKeys.length;
  }

  /**
   * Bảo đảm helper __name có trong browser context trước các
   * page.evaluate chứa function lồng nhau.
   */
  await page.evaluate(
    "globalThis.__name = Object"
  );

  await scrollChatToBottom(
    page,
    config.selectors.messageItems
  );

  await page.waitForTimeout(settleMs);

  let viewportCount = 0;
  let attemptedSteps = 0;
  let movedSteps = 0;
  let reachedTop = false;
  let consecutiveNoNewItems = 0;

  try {
    const firstViewport =
      await captureVisibleDomMessages(
        page,
        config
      );

    await cacheViewportBlobImages(
      firstViewport
    );

    viewportCount += 1;
    addViewport(
      firstViewport,
      false
    );

    for (
      let stepIndex = 0;
      stepIndex < maxSteps;
      stepIndex++
    ) {
      attemptedSteps += 1;

      const moveResult =
        await page.evaluate(
          ({
            messageItemsSelector,
            stepRatio,
          }) => {
            function isScrollable(
              element: Element
            ) {
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
                  element.clientHeight + 120 &&
                rect.width > 250 &&
                rect.height > 180 &&
                rect.right >
                  window.innerWidth * 0.55
              );
            }

            function findChatScroller() {
              const scores =
                new Map<
                  HTMLElement,
                  number
                >();

              if (messageItemsSelector) {
                const messageItems =
                  Array.from(
                    document.querySelectorAll(
                      messageItemsSelector
                    )
                  ).slice(-250);

                for (
                  const messageItem of
                  messageItems
                ) {
                  let current:
                    | HTMLElement
                    | null =
                    messageItem.parentElement;

                  let depth = 0;

                  while (
                    current &&
                    depth < 12
                  ) {
                    if (
                      isScrollable(current)
                    ) {
                      scores.set(
                        current,
                        (
                          scores.get(
                            current
                          ) || 0
                        ) +
                          Math.max(
                            1,
                            12 - depth
                          )
                      );
                    }

                    current =
                      current.parentElement;
                    depth += 1;
                  }
                }
              }

              return (
                Array.from(
                  scores.entries()
                )
                  .sort(
                    (a, b) =>
                      b[1] - a[1] ||
                      b[0].scrollHeight -
                        a[0].scrollHeight
                  )[0]?.[0] ||
                (
                  Array.from(
                    document.querySelectorAll(
                      "div"
                    )
                  )
                    .filter((element) =>
                      isScrollable(element)
                    )
                    .sort(
                      (a, b) =>
                        b.scrollHeight -
                        a.scrollHeight
                    )[0] as
                    | HTMLElement
                    | undefined
                )
              );
            }

            const chatScroller =
              findChatScroller();

            if (!chatScroller) {
              return {
                found: false,
                moved: false,
                atTop: false,
                beforeTop: 0,
                afterTop: 0,
              };
            }

            const beforeTop =
              chatScroller.scrollTop;

            const distance = Math.max(
              120,
              chatScroller.clientHeight *
                stepRatio
            );

            chatScroller.scrollTop =
              Math.max(
                0,
                beforeTop - distance
              );

            const afterTop =
              chatScroller.scrollTop;

            return {
              found: true,
              moved:
                Math.abs(
                  afterTop - beforeTop
                ) > 1,
              atTop: afterTop <= 1,
              beforeTop,
              afterTop,
            };
          },
          {
            messageItemsSelector:
              config.selectors
                .messageItems,
            stepRatio,
          }
        );

      if (moveResult.moved) {
        movedSteps += 1;
      }

      if (moveResult.atTop) {
        reachedTop = true;
      }

      await page.waitForTimeout(waitMs);

      /**
       * Cuối mỗi batch chờ lâu hơn để Zalo có thời gian nạp và
       * render thêm message cũ phía trên.
       */
      if (
        (stepIndex + 1) %
          stepsPerBatch ===
        0
      ) {
        await page.waitForTimeout(
          settleMs
        );
      }

      const viewport =
        await captureVisibleDomMessages(
          page,
          config
        );

      await cacheViewportBlobImages(
        viewport
      );

      viewportCount += 1;

      const newItemCount =
        addViewport(
          viewport,
          true
        );

      if (newItemCount > 0) {
        consecutiveNoNewItems = 0;
      } else {
        consecutiveNoNewItems += 1;
      }

      /**
       * Không dừng chỉ vì đang đi qua một message rất cao.
       * - Ở đỉnh hoặc không còn di chuyển: ba viewport không có ID mới là đủ.
       * - Khi vẫn đang cuộn: cho phép tối đa sáu viewport không có ID mới.
       */
      if (
        consecutiveNoNewItems >= 3 &&
        (
          moveResult.atTop ||
          !moveResult.moved
        )
      ) {
        break;
      }

      if (
        consecutiveNoNewItems >= 6
      ) {
        break;
      }

      if (!moveResult.found) {
        break;
      }
    }
  } finally {
    /**
     * Trả giao diện về cuối nhóm sau khi đã lưu snapshot trong bộ nhớ.
     */
    await scrollChatToBottom(
      page,
      config.selectors.messageItems
    );

    await page.waitForTimeout(
      settleMs
    );
  }

  const items = orderedKeys
    .map((key) =>
      collected.get(key)
    )
    .filter(
      (
        item
      ): item is DomMessageSnapshot =>
        Boolean(item)
    )
    .map((item, order) => ({
      ...item,
      order,
    }));

  return {
    items,
    viewportCount,
    attemptedSteps,
    movedSteps,
    reachedTop,
    consecutiveNoNewItems,
    blobMediaCache,
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

  const schemaPath = path.join(
    NETWORK_LOG_DIR,
    "indexeddb-schema.json"
  );

  const samplesPath = path.join(
    NETWORK_LOG_DIR,
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
  const compact = String(input || "")
    .replace(/\s+/g, "")
    .trim();

  if (!compact) return false;

  /*
   * Hỗ trợ các dạng separator thực tế:
   * ➖➖///➖➖
   * ➖➖➖➖///➖➖➖
   * -----///-----
   * =====///=====
   *
   * Không yêu cầu số lượng dấu cố định.
   */
  if (
    compact.includes("///") &&
    /^[\-–—_=➖/]{5,}$/.test(compact)
  ) {
    return true;
  }

  return /^[\-–—_=➖]{5,}$/.test(compact);
}

function isIndexedDbProjectHeaderText(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const firstLine =
    makeStableText(
      text.split("\n")[0] || ""
    );

  return /^(?:.*\b)?(?:thong bao du an|du an moi|cap nhat du an|du an duy tri|cap nhat hinh anh va video phong)\b/.test(
    firstLine
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

function isIndexedDbHouseInfoText(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  if (!text) {
    return false;
  }

  const normalized =
    makeStableText(text);

  if (!normalized) {
    return false;
  }

  /*
   * ============================
   * 1. TIÊU ĐỀ BẮT ĐẦU DỰ ÁN
   * ============================
   *
   * Các dạng thực tế:
   *
   * DỰ ÁN MỚI: 1131 Trần Hưng Đạo Q5
   * THÔNG BÁO DỰ ÁN MỚI QUẬN 5
   * CẬP NHẬT DỰ ÁN DUY TRÌ
   * DỰ ÁN DUY TRÌ: 245 Nguyễn Biểu
   */
  const hasProjectHeader =
    /^(?:hifriendz\s*[-–—]\s*)?(?:thong bao\s+)?(?:cap nhat\s+)?du an(?:\s+moi|\s+duy tri)?\b/.test(
      normalized
    );

  if (hasProjectHeader) {
    return true;
  }

  /*
   * ============================
   * 2. DÒNG ĐỊA CHỈ RÚT GỌN
   * ============================
   *
   * Nhận:
   * 1131 Trần Hưng Đạo Q5
   * 298/2A Trần Phú P.An Đông Q5
   * 245 Nguyễn Biểu Quận 5
   *
   * Không nhận marker phòng vì yêu cầu:
   * - bắt đầu bằng số nhà;
   * - có tên đường;
   * - cuối hoặc gần cuối có Q/Quận.
   */
  const looksLikeAddressLine =
    /^\d+[a-z]?(?:(?:\/|-)\d+[a-z]?)*\s+[a-z].*\b(?:q\.?\s*\d{1,2}|quan\s*\d{1,2})\b/.test(
      normalized
    );

  if (looksLikeAddressLine) {
    return true;
  }

  /*
   * Ưu tiên logic cơ bản có sẵn.
   */
  if (isHouseInfoText(text)) {
    return true;
  }

  /*
   * ============================
   * 3. FORM THÔNG TIN TÒA NHÀ
   * ============================
   */
  const signals = [
    "du an moi",
    "du an duy tri",
    "thong bao du an",
    "cap nhat du an",
    "cap nhat thong tin",

    "dia chi",
    "quy mo",
    "tong so phong",

    "phi dich vu",
    "dien",
    "nuoc",
    "giu xe",
    "gui xe",

    "hoa hong",
    "thu cung",
    "khach nuoc ngoai",
    "coc toi thieu",
    "huy coc",
  ];

  const matchedSignals =
    signals.filter((signal) =>
      normalized.includes(signal)
    ).length;

  /*
   * Form dài chỉ cần có ít nhất 2 nhóm tín hiệu.
   *
   * Ví dụ tin 1131 Trần Hưng Đạo có:
   * - dự án mới
   * - điện
   * - nước
   * - phí dịch vụ
   * - hoa hồng
   */
  return matchedSignals >= 2;
}

/**
 * Chỉ nhận một dòng là marker phòng khi chính dòng đó
 * thể hiện rõ:
 *
 * - trạng thái phòng trống + mã/giá; hoặc
 * - bắt đầu bằng mã phòng hợp lệ + giá.
 *
 * Không dùng dữ liệu tiền cọc, hoa hồng, phí điện nước
 * trong phần thông tin tòa nhà để xác định phòng.
 */
function isStrongIndexedDbRoomMarkerLine(
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
   * Loại các section chắc chắn không phải phòng.
   *
   * Lưu ý: "diện tích" sau khi bỏ dấu là "dien tich",
   * không được hiểu nhầm thành dòng phí điện.
   */
  const blockedSection =
    /^(?:[-+•*]\s*)?(?:thong bao du an|du an moi|cap nhat du an|du an duy tri|dia chi|quy mo|tong so|so luong|dien(?!\s*tich)|nuoc|xe|giu xe|gui xe|phi|phi dich vu|dich vu|giat|may giat|coc|coc toi thieu|hoa hong|hh|huy coc|hop dong|hd|thu cung|khach nuoc ngoai|so luong nguoi|lien he)\b/.test(
      normalized
    );

  if (blockedSection) {
    return false;
  }

  const looksLikeFeeLine =
    /\b(?:phi|dich vu|dien(?!\s*tich)|nuoc|giat|xe|giu xe|gui xe|coc|hoa hong|hh)\b/.test(
      normalized
    );

  if (looksLikeFeeLine) {
    return false;
  }

  const hasPrice =
    /\b(?:gia|gia thue)\s*[:\-]?\s*\d/.test(
      normalized
    ) ||
    /\b\d+\s*(?:tr|trieu)\d{0,3}\b/.test(
      normalized
    ) ||
    /\b\d+(?:[.,]\d+)?\s*(?:tr|trieu)\b/.test(
      normalized
    ) ||
    /\b\d{1,3}(?:[.,]\d{3}){1,2}\s*(?:d|dong)?\b/.test(
      normalized
    );

  if (!hasPrice) {
    return false;
  }

  const hasVacancySignal =
    /\b(?:trong|trong san|phong trong|con trong|dang trong|available)\b/.test(
      normalized
    );

  /*
   * Hỗ trợ:
   * 301, P301, P.301, G01, P.G01, P. G01,
   * L1, L2, Trệt, Lửng, Lầu 1, Tầng 3.
   */
  const roomCodeToken =
    "(?:" +
    "tret|lung|" +
    "san\\s*thuong|tang\\s*thuong|" +
    "lau\\s*\\d{1,2}|tang\\s*\\d{1,2}|" +
    "(?:p\\s*\\.\\s*)?[a-z]{0,3}\\s*\\.?\\s*\\d{1,4}[a-z]?|" +
    "\\d{2,4}[a-z]?" +
    ")";

  const vacancyWithRoomCode =
    new RegExp(
      [
        "\\b(?:trong|trong\\s+san|phong\\s+trong|con\\s+trong|dang\\s+trong)",
        "\\s*(?:san\\s*)?",
        "(?:phong|ma|ma\\s+phong)?",
        "\\s*[:\\-]?\\s*",
        roomCodeToken,
        "\\b",
      ].join(""),
      "i"
    ).test(normalized);

  /*
   * Không cho địa chỉ dạng 413/54... bị nhận thành mã 413.
   * Sau mã có thể có mô tả trước khi tới giá:
   * P. G01 (CS+Duplex+2 giường ngủ): 10.000.000đ
   */
  const startsWithRoomCode =
    !/^\d+[a-z]?(?:\/\d+[a-z]?)+\b/.test(
      normalized
    ) &&
    new RegExp(
      `^\\s*(?:phong\\s+|ma\\s+|ma\\s+phong\\s+)?${roomCodeToken}\\b`,
      "i"
    ).test(normalized);

  /*
   * Marker có mã tầng đặt sau giá:
   * Diện tích 60m2 ... Giá 13tr ... Tầng 3
   */
  const containsFloorCode =
    /\b(?:tret|lung|san\s*thuong|tang\s*thuong|lau\s*\d{1,2}|tang\s*\d{1,2})\b/.test(
      normalized
    );

  const explicitVacantRoom =
    /\bphong\s+trong\b/.test(
      normalized
    ) && hasPrice;

  return (
    hasPrice &&
    (
      vacancyWithRoomCode ||
      startsWithRoomCode ||
      explicitVacantRoom ||
      containsFloorCode ||
      (
        hasVacancySignal &&
        /\b(?:ma|ma phong|phong)\b/.test(
          normalized
        )
      )
    )
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
   * Chặn các tin giao dịch không phải thông báo phòng trống.
   */
  const hasExplicitVacancy =
    /\b(?:trong|trong san|phong trong|con trong)\b/.test(
      normalized
    );

  const looksLikeTransaction =
    /\block\b/.test(
      normalized
    ) ||
    /\b(?:dt|đt)\s*[:\-]?\s*\d/i.test(
      normalized
    ) ||
    /\b(?:pass khach|bao lock|bill ok|chot khach)\b/.test(
      normalized
    );

  if (
    looksLikeTransaction &&
    !hasExplicitVacancy
  ) {
    return false;
  }

  /*
   * Message IndexedDB đôi khi chứa nhiều dòng:
   *
   * thông tin tòa nhà
   * ...
   * Trống L1 giá 4tr
   *
   * Vì vậy phải kiểm tra từng dòng riêng.
   * Không được lấy chữ "phòng" và tiền cọc/phí ở các dòng khác
   * rồi ghép lại thành marker giả.
   */
  const lines =
    text
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  for (const line of lines) {
    if (
      isStrongIndexedDbRoomMarkerLine(
        line
      )
    ) {
      return true;
    }
  }

  /*
   * Trường hợp marker được viết thành một đoạn ngắn
   * nhưng có xuống dòng không thuận lợi.
   *
   * Chỉ chạy với text ngắn để không nhận nhầm
   * toàn bộ form thông tin tòa nhà.
   */
  if (
    text.length <= 220 &&
    isStrongIndexedDbRoomMarkerLine(
      text
    )
  ) {
    return true;
  }

  return false;
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
  const parts = [
    room.houseInfoText,
    room.markerText,
    ...room.descriptionTexts,
  ].filter(Boolean);

  const uniqueParts:
    string[] = [];

  const seen =
    new Set<string>();

  for (const part of parts) {
    const key =
      makeStableText(part);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueParts.push(part);
  }

  room.fullText =
    uniqueParts
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

type IndexedDbSoftHouseContext = {
  key: string;
  texts: string[];
  lastTimestamp: number;
};

type IndexedDbSoftRoomDraft = {
  house:
    | IndexedDbSoftHouseContext
    | null;

  markerTexts: string[];
  markerMessageIds: string[];

  markerTimestamp: number;
  lastMarkerTimestamp: number;

  descriptionTexts: string[];
  mediaMessages: IndexedDbGroupMessage[];

  warnings: Set<string>;
};

function getIndexedDbSoftUniqueTextKey(
  input: string
) {
  return makeStableText(input)
    .replace(
      /[.,:;|()[\]{}+\-–—]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function pushIndexedDbSoftUniqueText(
  values: string[],
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const key =
    getIndexedDbSoftUniqueTextKey(
      text
    );

  if (
    !text ||
    !key ||
    values.some(
      (value) =>
        getIndexedDbSoftUniqueTextKey(
          value
        ) === key
    )
  ) {
    return;
  }

  values.push(text);
}

function extractIndexedDbSoftHouseIdentity(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const normalized =
    makeStableText(text);

  const districtMatch =
    normalized.match(
      /\b(?:q\.?|quan)\s*[:\-]?\s*(\d{1,2}|binh thanh|go vap|phu nhuan|tan binh|tan phu|thu duc|binh tan)\b/
    );

  const district =
    districtMatch?.[1] || "";

  const addressMatches =
    Array.from(
      normalized.matchAll(
        /(?:^|[\n,;|])\s*(\d+[a-z]?(?:(?:\/|-)\d+[a-z]?)*)(?:\s+|\s*,\s*)([a-z][a-z0-9.' -]{1,80}?)(?=\s*(?:,|;|\||\n|-)?\s*(?:(?:phuong|p\.?\s*)[^,;|\n-]{1,40}\s*(?:,|;|\||\n|-)?\s*)?(?:q\.?|quan)\b)/g
      )
    );

  const addressMatch =
    addressMatches[
      addressMatches.length - 1
    ];

  if (
    addressMatch?.[1] &&
    addressMatch?.[2]
  ) {
    const street =
      addressMatch[2]
        .replace(
          /\b(?:phuong|p\.?\s*)\b.*$/,
          ""
        )
        .trim();

    return {
      key: [
        addressMatch[1],
        street,
        district,
      ].join("|"),

      houseNumber:
        addressMatch[1],

      street,
      district,
    };
  }

  const simpleMatch =
    normalized.match(
      /(?:^|\n)\s*(\d+[a-z]?(?:(?:\/|-)\d+[a-z]?)*)(?:\s+)([a-z][a-z0-9.' -]{1,80}?)\s*(?:,|-)?\s*(?:q\.?|quan)\s*[:\-]?\s*(\d{1,2}|binh thanh|go vap|phu nhuan|tan binh|tan phu|thu duc|binh tan)\b/
    );

  if (
    simpleMatch?.[1] &&
    simpleMatch?.[2]
  ) {
    const street =
      simpleMatch[2].trim();

    return {
      key: [
        simpleMatch[1],
        street,
        simpleMatch[3] || "",
      ].join("|"),

      houseNumber:
        simpleMatch[1],

      street,

      district:
        simpleMatch[3] || "",
    };
  }

  return {
    key: "",
    houseNumber: "",
    street: "",
    district,
  };
}

function extractIndexedDbSoftRoomCode(
  input: string
) {
  const normalized =
    makeStableText(input);

  const floorMatch =
    normalized.match(
      /\b(?:lau|tang)\s*(\d{1,2})\b/
    );

  if (floorMatch?.[1]) {
    return `L${Number(
      floorMatch[1]
    )}`;
  }

  if (/\btret\b/.test(normalized)) {
    return "TRỆT";
  }

  if (/\blung\b/.test(normalized)) {
    return "LỬNG";
  }

  const codePatterns = [
    /\b(?:trong|trong san|con trong|phong trong)\s*(?:san\s*)?(?:phong|ma|ma phong)?\s*[:\-]?\s*((?:p\s*\.\s*)?[a-z]{0,3}\s*\.?\s*\d{1,4}[a-z]?|\d{2,4}[a-z]?)\b/,

    /^\s*(?:phong\s+|ma\s+|ma phong\s+)?((?:p\s*\.\s*)?[a-z]{0,3}\s*\.?\s*\d{1,4}[a-z]?|\d{2,4}[a-z]?)\b/,
  ];

  for (const pattern of codePatterns) {
    const match =
      normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const code =
      match[1]
        .replace(
          /^p\s*\.\s*/,
          ""
        )
        .replace(/[\s.]/g, "")
        .toUpperCase();

    if (code) {
      return code;
    }
  }

  return "";
}

function splitIndexedDbSoftTextMessage(
  input: string
) {
  const text =
    cleanIndexedDbRoomText(input);

  const lines =
    text
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  const markerIndexes:
    number[] = [];

  for (
    let index = 0;
    index < lines.length;
    index++
  ) {
    if (
      isStrongIndexedDbRoomMarkerLine(
        lines[index]
      )
    ) {
      markerIndexes.push(index);
    }
  }

  /*
   * Marker nhiều dòng như:
   * Diện tích 60m2
   * Giá 13tr
   * Tầng 3
   */
  if (
    markerIndexes.length === 0 &&
    isStrongIndexedDbRoomMarkerLine(
      text
    )
  ) {
    return {
      houseText: "",

      markers: [
        {
          text,
          descriptionTexts: [],
          summary: false,
        },
      ],
    };
  }

  if (markerIndexes.length === 0) {
    return {
      houseText:
        isIndexedDbHouseInfoText(
          text
        )
          ? text
          : "",

      markers: [] as Array<{
        text: string;
        descriptionTexts: string[];
        summary: boolean;
      }>,
    };
  }

  const firstMarkerIndex =
    markerIndexes[0];

  const prefixText =
    lines
      .slice(0, firstMarkerIndex)
      .join("\n")
      .trim();

  const houseText =
    prefixText &&
    (
      isIndexedDbHouseInfoText(
        prefixText
      ) ||
      Boolean(
        extractIndexedDbSoftHouseIdentity(
          prefixText
        ).key
      )
    )
      ? prefixText
      : "";

  const markers =
    markerIndexes.map(
      (
        markerIndex,
        markerPosition
      ) => {
        const nextMarkerIndex =
          markerIndexes[
            markerPosition + 1
          ] ?? lines.length;

        const descriptionTexts =
          lines
            .slice(
              markerIndex + 1,
              nextMarkerIndex
            )
            .filter(
              (line) =>
                !isIndexedDbNoiseText(
                  line
                ) &&
                !isIndexedDbHouseInfoText(
                  line
                ) &&
                !isStrongIndexedDbRoomMarkerLine(
                  line
                )
            );

        return {
          text:
            lines[markerIndex],

          descriptionTexts,

          summary:
            markerIndexes.length > 1,
        };
      }
    );

  return {
    houseText,
    markers,
  };
}

function buildRoomsFromIndexedDbSoftTimeline(
  params: {
    groupName: string;
    groupId: string;
    messages: IndexedDbGroupMessage[];
    maxGapMs: number;
  }
) {
  const rooms:
    IndexedDbRoomPreview[] = [];

  const messagesBySender =
    new Map<
      string,
      IndexedDbGroupMessage[]
    >();

  for (const message of params.messages) {
    const senderUid =
      String(
        message.fromUid || ""
      ).trim();

    const senderKey =
      senderUid ||
      "__UNKNOWN_SENDER__";

    const currentMessages =
      messagesBySender.get(
        senderKey
      ) || [];

    currentMessages.push(message);

    messagesBySender.set(
      senderKey,
      currentMessages
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

      if (timeDifference !== 0) {
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

    let currentHouse:
      | IndexedDbSoftHouseContext
      | null = null;

    let currentRoom:
      | IndexedDbSoftRoomDraft
      | null = null;

    let orphanMedia:
      IndexedDbGroupMessage[] = [];

    const drafts:
      IndexedDbSoftRoomDraft[] = [];

    const recentRoomByKey =
      new Map<
        string,
        IndexedDbSoftRoomDraft
      >();

    function createMediaOnlyDraft() {
      if (orphanMedia.length === 0) {
        return;
      }

      const firstMedia =
        orphanMedia[0];

      const timestamp =
        getIndexedDbMessageTimestamp(
          firstMedia
        );

      drafts.push({
        house: currentHouse,

        markerTexts: [
          "Phòng chỉ có media, chưa tìm thấy marker phòng.",
        ],

        markerMessageIds: [
          firstMedia.msgId,
        ].filter(Boolean),

        markerTimestamp:
          timestamp,

        lastMarkerTimestamp:
          timestamp,

        descriptionTexts: [],

        mediaMessages: [
          ...orphanMedia,
        ],

        warnings: new Set([
          "SOFT_TIMELINE_FALLBACK",
          "MEDIA_ONLY",
          "ROOM_CODE_MISSING",
        ]),
      });

      orphanMedia = [];
    }

    function applyHouseText(
      input: string,
      timestamp: number
    ) {
      const text =
        cleanIndexedDbRoomText(
          input
        );

      if (!text) {
        return;
      }

      const identity =
        extractIndexedDbSoftHouseIdentity(
          text
        );

      const currentKeyIsUnknown =
        Boolean(
          currentHouse?.key.startsWith(
            "__UNKNOWN_HOUSE__"
          )
        );

      if (
        identity.key &&
        currentHouse?.key &&
        !currentKeyIsUnknown &&
        identity.key !==
          currentHouse.key
      ) {
        currentRoom = null;
        createMediaOnlyDraft();

        currentHouse = {
          key: identity.key,
          texts: [text],
          lastTimestamp:
            timestamp,
        };

        return;
      }

      if (!currentHouse) {
        currentHouse = {
          key:
            identity.key ||
            [
              "__UNKNOWN_HOUSE__",
              senderKey,
              timestamp,
            ].join(":"),

          texts: [text],

          lastTimestamp:
            timestamp,
        };

        return;
      }

      if (
        identity.key &&
        currentKeyIsUnknown
      ) {
        currentHouse.key =
          identity.key;
      }

      pushIndexedDbSoftUniqueText(
        currentHouse.texts,
        text
      );

      currentHouse.lastTimestamp =
        timestamp;
    }

    for (
      const message of
      senderMessages
    ) {
      const timestamp =
        getIndexedDbMessageTimestamp(
          message
        );

      if (message.kind === "text") {
        const parts =
          splitIndexedDbSoftTextMessage(
            message.text
          );

        if (parts.houseText) {
          applyHouseText(
            parts.houseText,
            timestamp
          );
        }

        if (parts.markers.length > 0) {
          for (
            const marker of
            parts.markers
          ) {
            currentRoom = null;

            const roomCode =
              extractIndexedDbSoftRoomCode(
                marker.text
              );

            const activeHouse =
              currentHouse as
                | IndexedDbSoftHouseContext
                | null;

            const roomKey =
              roomCode
                ? [
                    activeHouse?.key ||
                      "__NO_HOUSE__",
                    roomCode,
                  ].join("|")
                : "";

            const existingRoom =
              roomKey
                ? recentRoomByKey.get(
                    roomKey
                  )
                : undefined;

            if (
              existingRoom &&
              existingRoom
                .mediaMessages
                .length === 0 &&
              (
                timestamp <= 0 ||
                existingRoom
                  .lastMarkerTimestamp <= 0 ||
                timestamp -
                  existingRoom
                    .lastMarkerTimestamp <=
                  params.maxGapMs * 3
              )
            ) {
              currentRoom =
                existingRoom;
            } else {
              currentRoom = {
                house: currentHouse,

                markerTexts: [],
                markerMessageIds: [],

                markerTimestamp:
                  timestamp,

                lastMarkerTimestamp:
                  timestamp,

                descriptionTexts: [],
                mediaMessages: [],

                warnings:
                  new Set([
                    "SOFT_TIMELINE_FALLBACK",
                  ]),
              };

              drafts.push(
                currentRoom
              );

              if (roomKey) {
                recentRoomByKey.set(
                  roomKey,
                  currentRoom
                );
              }
            }

            pushIndexedDbSoftUniqueText(
              currentRoom.markerTexts,
              marker.text
            );

            if (
              message.msgId &&
              !currentRoom
                .markerMessageIds
                .includes(
                  message.msgId
                )
            ) {
              currentRoom
                .markerMessageIds
                .push(
                  message.msgId
                );
            }

            currentRoom.markerTimestamp =
              Math.max(
                currentRoom
                  .markerTimestamp,
                timestamp
              );

            currentRoom.lastMarkerTimestamp =
              timestamp;

            for (
              const descriptionText of
              marker.descriptionTexts
            ) {
              pushIndexedDbSoftUniqueText(
                currentRoom
                  .descriptionTexts,
                descriptionText
              );
            }

            if (marker.summary) {
              currentRoom.warnings.add(
                "SUMMARY_MARKER"
              );
            }

            if (orphanMedia.length > 0) {
              const lastOrphan =
                orphanMedia[
                  orphanMedia.length - 1
                ];

              const orphanTimestamp =
                getIndexedDbMessageTimestamp(
                  lastOrphan
                );

              if (
                timestamp <= 0 ||
                orphanTimestamp <= 0 ||
                timestamp -
                  orphanTimestamp <=
                  params.maxGapMs
              ) {
                currentRoom
                  .mediaMessages
                  .push(
                    ...orphanMedia
                  );

                currentRoom.warnings.add(
                  "ORPHAN_MEDIA_ATTACHED_TO_NEXT_MARKER"
                );

                orphanMedia = [];
              }
            }
          }

          continue;
        }

        if (
          !parts.houseText &&
          !isIndexedDbNoiseText(
            message.text
          ) &&
          currentRoom
        ) {
          pushIndexedDbSoftUniqueText(
            currentRoom
              .descriptionTexts,
            message.text
          );
        }

        continue;
      }

      if (
        message.kind === "image" ||
        isIndexedDbVideoMessage(
          message
        )
      ) {
        const belongsToCurrentRoom =
          Boolean(
            currentRoom &&
            (
              currentRoom
                .lastMarkerTimestamp <= 0 ||
              timestamp <= 0 ||
              timestamp -
                currentRoom
                  .lastMarkerTimestamp <=
                params.maxGapMs
            )
          );

        if (
          belongsToCurrentRoom &&
          currentRoom
        ) {
          currentRoom
            .mediaMessages
            .push(message);
        } else {
          orphanMedia.push(message);
        }
      }
    }

    createMediaOnlyDraft();

    for (const draft of drafts) {
      const imageMessages =
        draft.mediaMessages.filter(
          (message) =>
            message.kind ===
            "image"
        );

      const videoMessages =
        draft.mediaMessages.filter(
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

      const warnings =
        new Set(
          draft.warnings
        );

      if (!draft.house) {
        warnings.add(
          "NO_HOUSE_INFO_IN_SOFT_TIMELINE"
        );
      }

      if (imageUrls.length === 0) {
        warnings.add(
          "NO_IMAGES"
        );
      }

      if (
        imageUrls.length === 0 &&
        videoMessages.length === 0
      ) {
        warnings.add(
          "NO_MEDIA"
        );
      }

      if (
        warnings.has(
          "SUMMARY_MARKER"
        ) &&
        imageUrls.length === 0 &&
        videoMessages.length === 0
      ) {
        warnings.add(
          "SUMMARY_MARKER_NO_MEDIA"
        );
      }

      for (const album of albums) {
        if (!album.complete) {
          warnings.add(
            [
              "INCOMPLETE_ALBUM",
              album.albumKey,
              `${album.actualImageCount}/${album.expectedImageCount}`,
            ].join(":")
          );
        }
      }

      if (
        videoMessages.length > 0 &&
        videoPayloadMap.size === 0
      ) {
        warnings.add(
          [
            "VIDEO_SOURCE_URL_MISSING",
            String(
              videoMessages.length
            ),
          ].join(":")
        );
      }

      const markerMessageId =
        draft.markerMessageIds[
          draft.markerMessageIds
            .length - 1
        ] ||
        draft.mediaMessages[0]
          ?.msgId ||
        "";

      const sourceHash =
        hash(
          [
            "indexeddb-soft-room",
            params.groupName,
            params.groupId,
            ...draft.markerMessageIds,
            ...imageMessageIds,
            ...videoMessageIds,
          ].join("|")
        );

      const room:
        IndexedDbRoomPreview = {
          sourceHash,

          groupId:
            params.groupId,

          senderUid:
            senderKey ===
            "__UNKNOWN_SENDER__"
              ? ""
              : senderKey,

          houseInfoText:
            draft.house
              ?.texts
              .join("\n\n")
              .trim() || "",

          markerText:
            draft.markerTexts
              .join("\n")
              .trim(),

          descriptionTexts:
            draft.descriptionTexts,

          fullText: "",

          markerMessageId,

          markerTimestamp:
            draft.markerTimestamp,

          albums,
          imageUrls,
          imageMessageIds,

          hasVideo:
            videoMessages.length > 0,

          videoMessageIds,
          videoUrls,
          videoThumbUrls,

          videos:
            Array.from(
              videoPayloadMap.values()
            ),

          warnings:
            Array.from(warnings),
        };

      refreshIndexedDbRoomFullText(
        room
      );

      rooms.push(room);
    }
  }

  return rooms.sort(
    (a, b) =>
      b.markerTimestamp -
      a.markerTimestamp
  );
}

/**
 * Chỉ tạo block nằm giữa hai dấu phân cách.
 *
 * Ví dụ:
 * Dấu 1
 * Nội dung block
 * Dấu 2
 */
function splitIndexedDbClosedBlocks(
  messages: IndexedDbGroupMessage[]
) {
  const blocks:
    IndexedDbGroupMessage[][] =
    [];

  let currentBlock:
    IndexedDbGroupMessage[] =
    [];

  function flushCurrentBlock() {
    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
  }

  for (const message of messages) {
    const messageText =
      message.kind === "text"
        ? cleanIndexedDbRoomText(
            message.text
          )
        : "";

   const isSeparator =
      Boolean(messageText) &&
      isIndexedDbSeparatorText(
        messageText
      );

    if (isSeparator) {
      flushCurrentBlock();
      continue;
    }

    const startsNewProject =
      Boolean(messageText) &&
      isIndexedDbProjectHeaderText(
        messageText
      );

    /*
     * Tin mở đầu dự án cũng là ranh giới block.
     * Nhờ vậy Reader hoạt động cả khi nhóm không gửi
     * separator hoặc dùng separator không đồng nhất.
     */
    if (
      startsNewProject &&
      currentBlock.length > 0
    ) {
      flushCurrentBlock();
    }

    currentBlock.push(message);
  }

  /*
   * Block mới nhất có thể chưa có separator đóng.
   * Vẫn phải đọc vì đây thường chính là phòng mới nhất.
   */
  flushCurrentBlock();

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
    maxGapMs,
  } = params;

  /*
   * Vẫn sắp message cũ → mới để nhận biết:
   * - Media trước marker.
   * - Mô tả sau marker.
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

  const hasSeparator =
    messages.some((message) => {
      if (message.kind !== "text") {
        return false;
      }

      const text =
        cleanIndexedDbRoomText(
          message.text
        );

      return (
        Boolean(text) &&
        isIndexedDbSeparatorText(
          text
        )
      );
    });

  /*
   * Nhóm không dùng separator:
   * tòa nhà → marker → media → marker tiếp theo / tòa tiếp theo.
   *
   * Khi có ít nhất một separator, giữ nguyên parser block chính.
   */
  if (!hasSeparator) {
    console.log(
      "Không tìm thấy separator tòa nhà; Reader chuyển sang soft timeline fallback."
    );

    return buildRoomsFromIndexedDbSoftTimeline({
      groupName,
      groupId,
      messages,
      maxGapMs,
    });
  }

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
    const block =
      blocks[blockIndex];

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
       * Quan trọng:
       *
       * Quét toàn bộ block trước để lấy thông tin
       * tòa nhà, nên thông tin này có thể nằm:
       * - Trước ảnh.
       * - Sau ảnh.
       * - Trước marker.
       * - Sau marker.
       *
       * Miễn cùng block và cùng người gửi.
       */
      const houseInfoTextMap =
        new Map<string, string>();

      for (const message of senderMessages) {
        if (message.kind !== "text") {
          continue;
        }

        const text =
          cleanIndexedDbRoomText(
            message.text
          );

        if (
          !text ||
          !isIndexedDbHouseInfoText(text)
        ) {
          continue;
        }

        const key = makeStableText(text);

        if (
          key &&
          !houseInfoTextMap.has(key)
        ) {
          houseInfoTextMap.set(
            key,
            text
          );
        }
      }

      const houseInfoTexts =
  Array.from(
    new Map(
      senderMessages
        .filter(
          (message) =>
            message.kind === "text"
        )
        .map((message) =>
          cleanIndexedDbRoomText(
            message.text
          )
        )
        .filter(
          (text) =>
            Boolean(text) &&
            isIndexedDbHouseInfoText(
              text
            )
        )
        .map((text) => [
          makeStableText(text),
          text,
        ])
    ).values()
  );

const houseInfoText =
  houseInfoTexts
    .join("\n\n")
    .trim();

if (!houseInfoText) {
  console.warn(
    [
      "Không tìm thấy dữ liệu tòa nhà trong block.",
      `Block index: ${blockIndex}.`,
      `Sender: ${senderKey}.`,
      `Số message: ${senderMessages.length}.`,
    ].join(" ")
  );
} else {
  console.log(
    [
      "Đã ghép dữ liệu tòa nhà:",
      houseInfoText
        .split("\n")[0]
        ?.slice(0, 100) || "-",
    ].join(" ")
  );
}

      if (!houseInfoText) {
        console.warn(
          [
            "Không tìm thấy dữ liệu tòa nhà trong block.",
            `Block index: ${blockIndex}.`,
            `Sender: ${senderKey}.`,
            `Số message: ${senderMessages.length}.`,
          ].join(" ")
        );
      } else {
        console.log(
          [
            "Đã ghép dữ liệu tòa nhà:",
            houseInfoText
              .split("\n")[0]
              ?.slice(0, 100) || "-",
          ].join(" ")
        );
      }

      /*
       * Tìm tất cả marker phòng trong block
       * của người gửi này.
       */
      const roomMarkerCandidates =
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

      /*
       * Tin house-info đôi khi cũng có một dòng kiểu:
       *
       *   202: 8.500.000 phòng trống sẵn
       *
       * nên bản thân nó vượt qua bộ nhận diện marker. Khi phía sau
       * có album và một marker riêng, không được tạo thêm một room
       * từ chính house-info đó.
       *
       * Chỉ loại house-info candidate khi:
       * - Có một marker độc lập nằm phía sau; và
       * - Giữa hai message có ảnh hoặc video.
       *
       * Nếu block không có marker độc lập, house-info vẫn được giữ
       * làm fallback để không bỏ sót các bài đăng gộp mọi thứ vào
       * một message duy nhất.
       */
      const standaloneRoomMarkers =
        roomMarkerCandidates.filter(
          ({ message }) => {
            const text =
              cleanIndexedDbRoomText(
                message.text
              );

            return !isIndexedDbHouseInfoText(
              text
            );
          }
        );

      const roomMarkers =
        roomMarkerCandidates.filter(
          (candidate) => {
            const candidateText =
              cleanIndexedDbRoomText(
                candidate.message.text
              );

            if (
              !isIndexedDbHouseInfoText(
                candidateText
              )
            ) {
              return true;
            }

            const nextStandaloneMarker =
              standaloneRoomMarkers.find(
                (standaloneMarker) =>
                  standaloneMarker.index >
                  candidate.index
              );

            if (!nextStandaloneMarker) {
              return true;
            }

            const hasMediaBetween =
              senderMessages
                .slice(
                  candidate.index + 1,
                  nextStandaloneMarker.index
                )
                .some(
                  (message) =>
                    message.kind === "image" ||
                    isIndexedDbVideoMessage(
                      message
                    )
                );

            return !hasMediaBetween;
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

        const nextMarker =
          roomMarkers[
            markerPosition +
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
 * Bảo vệ lần cuối:
 *
 * Chỉ tiếp tục tạo phòng khi trong markerMessage
 * thực sự có ít nhất một dòng marker phòng mạnh.
 *
 * Tin chỉ chứa:
 * - thông tin dự án;
 * - địa chỉ;
 * - điện nước;
 * - phí;
 * - cọc;
 * - hoa hồng;
 *
 * sẽ bị bỏ qua hoàn toàn.
 */
const hasStrongRoomMarker =
  markerText
    .split("\n")
    .map((line) =>
      line.trim()
    )
    .filter(Boolean)
    .some((line) =>
      isStrongIndexedDbRoomMarkerLine(
        line
      )
    );

if (!hasStrongRoomMarker) {
  console.warn(
    [
      "Bỏ qua tin thông tin tòa nhà",
      "vì không có marker phòng hợp lệ:",
      markerText.slice(0, 120),
    ].join(" ")
  );

  continue;
}

/*
 * ============================
 * MEDIA CỦA PHÒNG
 * ============================
 */
        const mediaStartIndex =
          previousMarker
            ? previousMarker.index + 1
            : 0;

        const mediaEndIndex =
          nextMarker
            ? nextMarker.index
            : senderMessages.length;

        const messagesBeforeMarker =
          senderMessages
            .slice(
              mediaStartIndex,
              marker.index
            )
            .filter((message) => {
              const timestamp =
                getIndexedDbMessageTimestamp(
                  message
                );

              return (
                markerTimestamp <= 0 ||
                timestamp <= 0 ||
                markerTimestamp - timestamp <=
                  maxGapMs
              );
            });

        const messagesAfterMarker =
          senderMessages
            .slice(
              marker.index + 1,
              mediaEndIndex
            )
            .filter((message) => {
              const timestamp =
                getIndexedDbMessageTimestamp(
                  message
                );

              return (
                markerTimestamp <= 0 ||
                timestamp <= 0 ||
                timestamp - markerTimestamp <=
                  maxGapMs
              );
            });

        const beforeMediaMessages =
          messagesBeforeMarker.filter(
            (message) =>
              message.kind === "image" ||
              isIndexedDbVideoMessage(
                message
              )
          );

        const afterMediaMessages =
          messagesAfterMarker.filter(
            (message) =>
              message.kind === "image" ||
              isIndexedDbVideoMessage(
                message
              )
          );

        const selectedMediaMessages =
          beforeMediaMessages.length > 0
            ? beforeMediaMessages
            : afterMediaMessages;

        const imageMessages =
          selectedMediaMessages.filter(
            (message) =>
              message.kind === "image"
          );

        const videoMessages =
          selectedMediaMessages.filter(
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

        /*
         * ============================
         * MÔ TẢ CỦA PHÒNG
         * ============================
         *
         * Mô tả bắt đầu sau marker.
         *
         * Dừng khi:
         * - Gặp ảnh mới.
         * - Gặp video mới.
         * - Gặp marker tiếp theo.
         *
         * Ảnh/video mới là media của phòng sau.
         */
        const descriptionTexts:
          string[] = [];

        const descriptionEndIndex =
          nextMarker
            ? nextMarker.index
            : senderMessages.length;

        for (
          let messageIndex =
            marker.index + 1;
          messageIndex <
          descriptionEndIndex;
          messageIndex++
        ) {
          const message =
            senderMessages[
              messageIndex
            ];

          if (
            message.kind ===
              "image" ||
            isIndexedDbVideoMessage(
              message
            )
          ) {
            break;
          }

          if (
            message.kind !==
            "text"
          ) {
            continue;
          }

          const text =
            cleanIndexedDbRoomText(
              message.text
            );

          if (!text) {
            continue;
          }

          /*
           * House info đã được lấy chung
           * cho toàn block, không đưa vào mô tả.
           */
          if (
            isIndexedDbHouseInfoText(
              text
            )
          ) {
            continue;
          }

          if (
            isIndexedDbRoomMarkerText(
              text
            )
          ) {
            break;
          }

          if (
            isIndexedDbNoiseText(
              text
            )
          ) {
            continue;
          }

          if (
            !descriptionTexts.includes(
              text
            )
          ) {
            descriptionTexts.push(
              text
            );
          }
        }

        const warnings:
          string[] = [];

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
              markerMessage.msgId,
              ...imageMessageIds,
              ...videoMessageIds,
            ].join("|")
          );

        const room:
          IndexedDbRoomPreview =
          {
            sourceHash,

            groupId,

            senderUid:
              senderKey ===
              "__UNKNOWN_SENDER__"
                ? ""
                : senderKey,

            houseInfoText,

            markerText,

            descriptionTexts,

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
   * Việc ghép block phía trên vẫn chạy cũ → mới.
   * Sau khi ghép xong, trả kết quả mới → cũ để:
   * - preview ưu tiên phòng mới nhất;
   * - import xử lý phòng mới trước;
   * - dễ loại bản cập nhật cũ cùng địa chỉ + mã phòng.
   */
  return rooms.sort(
    (a, b) =>
      b.markerTimestamp -
      a.markerTimestamp
  );
}

function normalizeIndexedDbFreshnessText(
  input: any
) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIndexedDbFreshnessAddress(
  room: IndexedDbRoomPreview
) {
  const text = [
    room.houseInfoText,
    room.markerText,
    room.fullText,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = text
    .split("\n")
    .map((line) =>
      line.trim()
    )
    .filter(Boolean);

  for (const line of lines) {
    const normalized =
      normalizeIndexedDbFreshnessText(
        line
      );

    const addressMatch =
      normalized.match(
        /(?:^|\b)dia chi\s*[:\-]?\s*(.+)$/
      );

    const candidate =
      normalizeIndexedDbFreshnessText(
        addressMatch?.[1] || ""
      );

    if (
      candidate &&
      /\d/.test(candidate) &&
      candidate.length >= 8 &&
      candidate.length <= 160
    ) {
      return candidate;
    }
  }

  return "";
}

function extractIndexedDbFreshnessRoomCode(
  room: IndexedDbRoomPreview
) {
  const lines = String(
    room.markerText || ""
  )
    .split("\n")
    .map((line) =>
      line.trim()
    )
    .filter(Boolean);

  for (const rawLine of lines) {
    if (
      !isStrongIndexedDbRoomMarkerLine(
        rawLine
      )
    ) {
      continue;
    }

    const line =
      normalizeIndexedDbFreshnessText(
        rawLine
      );

    const patterns = [
      /(?:^|\b)(?:trong|phong|ma|p)\s*[.:#-]?\s*([a-z]{0,3}\d{1,4})\b/,
      /^([a-z]{0,3}\d{1,4})\b(?=\s+(?:gia\s*)?\d)/,
      /(?:^|\b)(tret|san thuong|ap mai|lau\s*\d+|tang\s*\d+)\b/,
    ];

    for (const pattern of patterns) {
      const match =
        line.match(pattern);

      if (match?.[1]) {
        return match[1]
          .replace(/\s+/g, "")
          .trim();
      }
    }
  }

  return "";
}

function keepNewestIndexedDbRoomVersions(
  rooms: IndexedDbRoomPreview[]
) {
  const ordered = [...rooms].sort(
    (a, b) =>
      b.markerTimestamp -
      a.markerTimestamp
  );

  const seen = new Set<string>();
  const kept:
    IndexedDbRoomPreview[] = [];

  let skippedOlderVersions = 0;

  for (const room of ordered) {
    const address =
      extractIndexedDbFreshnessAddress(
        room
      );

    const roomCode =
      extractIndexedDbFreshnessRoomCode(
        room
      );

    /**
     * Chỉ dedupe khi cả địa chỉ và mã phòng đều chắc chắn.
     * Nếu thiếu một trong hai thì giữ nguyên để tránh xóa nhầm.
     */
    const freshnessKey =
      address && roomCode
        ? `${address}|${roomCode}`
        : "";

    if (
      freshnessKey &&
      seen.has(freshnessKey)
    ) {
      skippedOlderVersions += 1;
      continue;
    }

    if (freshnessKey) {
      seen.add(freshnessKey);
    }

    kept.push(room);
  }

  return {
    rooms: kept,
    skippedOlderVersions,
  };
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

  const rawGroupEntry =
    params.config.groups.find((entry) => {
      if (typeof entry === "string") {
        return entry.trim() === params.groupName;
      }

      return String(entry.name || "").trim() === params.groupName;
    });

  const parserName: "legacy" | "semantic-timeline" =
    rawGroupEntry && typeof rawGroupEntry === "object" &&
    rawGroupEntry.parser === "legacy"
      ? "legacy"
      : "semantic-timeline";

  const parserOptions: SemanticParserOptions | undefined =
    rawGroupEntry && typeof rawGroupEntry === "object"
      ? rawGroupEntry.parserOptions
      : undefined;

  console.log(
    [
      "Parser phòng:",
      parserName,
      `(${params.groupName})`,
    ].join(" ")
  );

  const builtRooms: IndexedDbRoomPreview[] =
    parserName === "legacy"
      ? buildRoomsFromIndexedDbMessages({
          groupName: params.groupName,
          groupId: params.groupId,
          messages: params.messages,
          maxGapMs,
        })
      : buildSemanticTimelineRooms({
          groupName: params.groupName,
          groupId: params.groupId,
          messages: params.messages,
          maxGapMs,
          parserOptions,
        });

  const newestRoomVersions =
    keepNewestIndexedDbRoomVersions(
      builtRooms
    );

  const rooms =
    newestRoomVersions.rooms;

  const outputPath = path.join(
    NETWORK_LOG_DIR,
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

          skippedOlderVersions:
            newestRoomVersions
              .skippedOlderVersions,
        },

        rooms,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    [
      `Đã tạo preview ${rooms.length} phòng`,
      newestRoomVersions
        .skippedOlderVersions > 0
        ? `(đã bỏ ${newestRoomVersions.skippedOlderVersions} bản cập nhật cũ hơn)`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
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

  const orderedRooms = [...rooms].sort(
    (a, b) =>
      b.markerTimestamp -
      a.markerTimestamp
  );

  /*
   * Chỉ khi khóa indexedDbImportSourceHashes
   * thực sự xuất hiện trong config thì Reader
   * mới bật chế độ whitelist.
   *
   * Nếu khóa có mặt nhưng sai kiểu hoặc là mảng
   * rỗng, Reader chặn toàn bộ import thay vì vô tình
   * quay về chế độ import tất cả phòng.
   */
  const hasSourceHashFilter =
    Object.prototype.hasOwnProperty.call(
      config,
      "indexedDbImportSourceHashes"
    );

  const configuredSourceHashes =
    Array.isArray(
      config.indexedDbImportSourceHashes
    )
      ? config.indexedDbImportSourceHashes
      : [];

  const allowedSourceHashes =
    new Set(
      configuredSourceHashes
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    );

  if (
    hasSourceHashFilter &&
    !Array.isArray(
      config.indexedDbImportSourceHashes
    )
  ) {
    console.warn(
      "indexedDbImportSourceHashes sai định dạng; Reader sẽ không import phòng nào."
    );
  }

  /*
   * Nếu indexedDbImportLimit có mặt nhưng không phải
   * số hợp lệ, giới hạn được đặt về 0 để fail-safe.
   */
  const hasImportLimit =
    Object.prototype.hasOwnProperty.call(
      config,
      "indexedDbImportLimit"
    );

  const parsedImportLimit =
    Number(
      config.indexedDbImportLimit
    );

  const importLimit =
    hasImportLimit
      ? Number.isFinite(
          parsedImportLimit
        )
        ? Math.max(
            0,
            Math.floor(
              parsedImportLimit
            )
          )
        : 0
      : null;

  if (
    hasImportLimit &&
    !Number.isFinite(
      parsedImportLimit
    )
  ) {
    console.warn(
      "indexedDbImportLimit không hợp lệ; Reader sẽ không import phòng nào."
    );
  }

  let selectedCount = 0;
  let filteredOutCount = 0;
  let limitedOutCount = 0;

  console.log(
    [
      "Bộ lọc IndexedDB import:",
      hasSourceHashFilter
        ? `${allowedSourceHashes.size} sourceHash được phép`
        : "không giới hạn sourceHash",
      importLimit === null
        ? "không giới hạn số phòng"
        : `tối đa ${importLimit} phòng/lượt`,
      `${orderedRooms.length} phòng trong preview`,
    ].join(" ")
  );

  for (const room of orderedRooms) {
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

    if (
      hasSourceHashFilter &&
      !allowedSourceHashes.has(
        room.sourceHash
      )
    ) {
      filteredOutCount += 1;
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

    if (
      importLimit !== null &&
      selectedCount >=
        importLimit
    ) {
      limitedOutCount += 1;
      skippedCount += 1;
      continue;
    }

    /*
     * Giới hạn tính theo số phòng đã bắt đầu thử gửi,
     * kể cả API thành công hay lỗi hoàn toàn.
     */
    selectedCount += 1;

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
      `${filteredOutCount} ngoài whitelist`,
      `${limitedOutCount} vượt giới hạn`,
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
  groupKey: string,
  config: Config,
  groupRefs: SavedGroupRefs
) {
  const rawScanLimit = Number(
    config.indexedDbGroupScanLimit ?? 30000
  );

  const scanLimit = Math.max(
    1000,
    Math.min(
      300000,
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
      20000,
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
      7 * 24 * 60 * 60 * 1000,
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

  const savedGroupRef =
  groupRefs[groupKey] ||
  null;

const preferredGroupId =
  String(
    savedGroupRef
      ?.groupId || ""
  ).trim();

if (preferredGroupId) {
  console.log(
    [
      "Đã nạp Group ID đã lưu:",
      `${groupKey} → ${preferredGroupId}`,
    ].join(" ")
  );
}

  /**
   * Zalo đặt tin mới nhất ở dưới cùng và chỉ giữ các bubble gần viewport.
   * Vì vậy phải chụp trong lúc cuộn từ dưới lên, không được quay xuống cuối
   * rồi mới chụp một lần.
   */
  const domScrollCapture =
    await captureDomMessagesWhileScrollingUp(
      page,
      config
    );

  const domMessageSnapshot =
    domScrollCapture.items;

  const domSnapshotPath =
    path.join(
      NETWORK_LOG_DIR,
      "active-group-dom-snapshot.json"
    );

  fs.writeFileSync(
    domSnapshotPath,
    JSON.stringify(
      {
        capturedAt:
          new Date().toISOString(),
        groupName,
        itemCount:
          domMessageSnapshot.length,

        scrollCapture: {
          viewportCount:
            domScrollCapture.viewportCount,
          attemptedSteps:
            domScrollCapture.attemptedSteps,
          movedSteps:
            domScrollCapture.movedSteps,
          reachedTop:
            domScrollCapture.reachedTop,
          consecutiveNoNewItems:
            domScrollCapture.consecutiveNoNewItems,

          blobMediaCache:
            domScrollCapture.blobMediaCache,
        },

        items:
          domMessageSnapshot,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    [
      "Đã tích lũy DOM khi cuộn lên:",
      `${domMessageSnapshot.length} item,`,
      `${domScrollCapture.viewportCount} viewport,`,
      `${domScrollCapture.movedSteps}/${domScrollCapture.attemptedSteps} bước có di chuyển`,
    ].join(" ")
  );

  console.log(
    [
      "Đã lưu blob ảnh DOM:",
      `${domScrollCapture.blobMediaCache.cachedCount} mới,`,
      `${domScrollCapture.blobMediaCache.reusedCount} dùng lại,`,
      `${domScrollCapture.blobMediaCache.failedCount} lỗi,`,
      `${(domScrollCapture.blobMediaCache.totalBytes / 1024 / 1024).toFixed(2)} MB`,
    ].join(" ")
  );

  console.log(
    `Thư mục blob ảnh DOM: ${domScrollCapture.blobMediaCache.cacheDir}`
  );

  console.log(
    `File DOM snapshot: ${domSnapshotPath}`
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
        groupName,
        preferredGroupId,
        messageItemsSelector,
        messageTextSelector,
        domMessageSnapshot,
        scanLimit,
        messageLimit,
        contextBeforeMs,
        contextAfterMs,
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
       * zdb/message có thể chứa ciphertext Base64.
       * Không được đưa chuỗi này vào parser như text thật.
       */
      function isLikelyEncryptedMessageText(
        input: any
      ) {
        const text =
          String(input || "")
            .trim();

        if (text.length < 24) {
          return false;
        }

        if (/\s/.test(text)) {
          return false;
        }

        return (
          /^[A-Za-z0-9+/=]+$/.test(
            text
          ) &&
          text.length % 4 === 0
        );
      }

      /**
       * Chuyển record sidx/idx_queue thành cấu trúc nội dung
       * Reader đang sử dụng. Timeline vẫn lấy từ zdb/message;
       * sidx chỉ bổ sung payload đã giải mã theo đúng msgId.
       */
      function extractDecodedSidxContent(
        input: any
      ) {
        const value = input || {};

        const msgType = Number(
          value.msgType || 0
        );

        const originMsgType =
          String(
            value.originMsgType || ""
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

        if (
          msgType === 1 &&
          typeof value.message ===
            "string" &&
          value.message.trim() &&
          !isLikelyEncryptedMessageText(
            value.message
          )
        ) {
          kind = "text";
          text = value.message;
        }

        const rawMessage =
          value.message &&
          typeof value.message ===
            "object"
            ? value.message
            : safeJsonParse(
                value.message
              );

        if (
          (
            msgType === 2 ||
            originMsgType ===
              "chat.photo"
          ) &&
          rawMessage &&
          typeof rawMessage ===
            "object"
        ) {
          const media = rawMessage;

          const params =
            safeJsonParse(
              media.params
            ) ||
            (
              media.params &&
              typeof media.params ===
                "object"
                ? media.params
                : {}
            );

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
                  String(
                    url || ""
                  ).trim()
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

          if (imageUrls.length > 0) {
            kind = "image";
          }
        }

        if (
          (
            msgType === 18 ||
            originMsgType ===
              "chat.video.msg"
          ) &&
          rawMessage &&
          typeof rawMessage ===
            "object"
        ) {
          const videoMessage =
            rawMessage;

          const videoParams =
            safeJsonParse(
              videoMessage.params
            ) ||
            (
              videoMessage.params &&
              typeof videoMessage.params ===
                "object"
                ? videoMessage.params
                : {}
            );

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
                    directThumbUrls.includes(
                      url
                    ) ||
                    discoveredThumbUrls.includes(
                      url
                    )
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

          videoUrls = Array.from(
            new Set([
              ...directVideoUrls,
              ...discoveredVideoUrls,
            ])
          );

          videoThumbUrls = Array.from(
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

        const rawSenderName =
          String(
            value.dName || ""
          ).trim();

        const senderName =
          rawSenderName &&
          !isLikelyEncryptedMessageText(
            rawSenderName
          )
            ? rawSenderName
            : "";

        return {
          msgType,
          kind,
          text,
          imageUrls,
          groupLayoutId,
          imageIndex,
          totalImages,
          videoUrls,
          videoThumbUrls,
          videoDebug,
          senderName,
          originMsgType,
          fromUid: String(
            value.fromUid || ""
          ),
          toUid: String(
            value.toUid || ""
          ),
        };
      }

      /**
 * Lấy các chuỗi có dạng group ID của Zalo.
 *
 * Ví dụ:
 * g4319231181333246036
 */
function extractGroupIdsFromText(
  input: any
) {
  const text =
    String(input ?? "");

  const matches =
    text.match(
      /g\d{6,}/g
    ) || [];

  return Array.from(
    new Set(
      matches
        .map((value) =>
          String(value).trim()
        )
        .filter(Boolean)
    )
  );
}

/**
 * Tìm group ID có liên quan trực tiếp
 * tới tên nhóm đang mở.
 *
 * Không lấy bừa tất cả group ID trong trang.
 * Một mã chỉ được giữ khi nó nằm:
 *
 * - trong phần tử có tên nhóm;
 * - trong dữ liệu nội bộ gần tên nhóm;
 * - hoặc trong trạng thái trang có cả tên nhóm.
 */
function findActiveGroupIdHints(
  activeGroupName: string
) {
  const normalizedTargetName =
    normalizeText(
      activeGroupName
    );

  const hintMap =
    new Map<
      string,
      {
        confidence: number;
        sources: Set<string>;
      }
    >();

  function addGroupId(
    groupId: string,
    source: string,
    confidence: number
  ) {
    const normalizedGroupId =
      String(groupId || "")
        .trim();

    if (
      !/^g\d{6,}$/.test(
        normalizedGroupId
      )
    ) {
      return;
    }

    const current =
      hintMap.get(
        normalizedGroupId
      ) || {
        confidence: 0,
        sources:
          new Set<string>(),
      };

    current.confidence =
      Math.max(
        current.confidence,
        confidence
      );

    current.sources.add(
      source
    );

    hintMap.set(
      normalizedGroupId,
      current
    );
  }

  function addGroupIdsFromText(
    input: any,
    source: string,
    confidence: number
  ) {
    for (
      const groupId of
      extractGroupIdsFromText(
        input
      )
    ) {
      addGroupId(
        groupId,
        source,
        confidence
      );
    }
  }

  /**
   * Lấy group ID trong một object
   * ở phạm vi nông.
   *
   * Dùng khi đã biết object này hoặc
   * object con có chứa đúng tên nhóm.
   */
  function collectIdsShallow(
    input: any,
    source: string,
    confidence: number
  ) {
    if (
      !input ||
      typeof input !== "object"
    ) {
      return;
    }

    let entries:
      Array<[string, any]> =
      [];

    try {
      entries =
        Object.entries(input)
          .slice(0, 150);
    } catch {
      return;
    }

    for (
      const [
        key,
        value,
      ] of entries
    ) {
      if (
        typeof value ===
          "string" ||
        typeof value ===
          "number"
      ) {
        addGroupIdsFromText(
          value,
          `${source}.${key}`,
          confidence
        );

        continue;
      }

      if (
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(value)
      ) {
        try {
          for (
            const [
              childKey,
              childValue,
            ] of Object.entries(
              value
            ).slice(0, 80)
          ) {
            if (
              typeof childValue ===
                "string" ||
              typeof childValue ===
                "number"
            ) {
              addGroupIdsFromText(
                childValue,
                `${source}.${key}.${childKey}`,
                confidence - 2
              );
            }
          }
        } catch {
          // Bỏ qua object không đọc được.
        }
      }
    }
  }

  /**
   * Tìm object có chứa đúng tên nhóm.
   * Khi tìm thấy, lấy group ID trong
   * object đó và một số object cha gần nhất.
   */
  function inspectNameLinkedObject(
    input: any,
    source: string,
    confidence: number
  ) {
    if (
      !input ||
      typeof input !== "object" ||
      !normalizedTargetName
    ) {
      return;
    }

    const seen =
      new WeakSet<object>();

    let visitedCount = 0;

    function visit(
      value: any,
      depth: number,
      parents: any[]
    ) {
      if (
        value == null ||
        depth > 6 ||
        visitedCount > 2500
      ) {
        return;
      }

      if (
        typeof value !== "object"
      ) {
        return;
      }

      if (
        seen.has(value)
      ) {
        return;
      }

      seen.add(value);
      visitedCount += 1;

      let entries:
        Array<[string, any]> =
        [];

      try {
        entries =
          Object.entries(value)
            .slice(0, 150);
      } catch {
        return;
      }

      const primitiveValues =
        entries
          .filter(
            ([
              _key,
              item,
            ]) =>
              typeof item ===
                "string" ||
              typeof item ===
                "number"
          )
          .map(
            ([
              key,
              item,
            ]) => ({
              key,
              value:
                String(item),
            })
          );

      const containsTargetName =
        primitiveValues.some(
          (item) => {
            const normalizedValue =
              normalizeText(
                item.value
              );

            return (
              normalizedValue ===
                normalizedTargetName ||
              (
                normalizedTargetName
                  .length >= 4 &&
                normalizedValue.includes(
                  normalizedTargetName
                )
              )
            );
          }
        );

      if (
        containsTargetName
      ) {
        collectIdsShallow(
          value,
          source,
          confidence
        );

        /*
         * Có trường hợp:
         * - object con chứa tên nhóm;
         * - object cha chứa groupId.
         */
        for (
          const parent of
          parents.slice(-3)
        ) {
          collectIdsShallow(
            parent,
            `${source}.parent`,
            confidence - 4
          );
        }
      }

      for (
        const [
          key,
          childValue,
        ] of entries
      ) {
        if (
          childValue &&
          typeof childValue ===
            "object"
        ) {
          visit(
            childValue,
            depth + 1,
            [
              ...parents,
              value,
            ].slice(-4)
          );
        }
      }
    }

    visit(
      input,
      0,
      []
    );
  }

  /*
   * ==================================
   * 1. ĐỊA CHỈ VÀ TRẠNG THÁI TRANG
   * ==================================
   */
  addGroupIdsFromText(
    window.location.href,
    "location",
    85
  );

  try {
    inspectNameLinkedObject(
      window.history.state,
      "history.state",
      90
    );
  } catch {
    // Trạng thái trang không đọc được.
  }

  /*
   * ==================================
   * 2. BỘ NHỚ TRÌNH DUYỆT
   * ==================================
   */
  function inspectStorage(
    storage: Storage,
    source: string
  ) {
    const maxItems =
      Math.min(
        storage.length,
        500
      );

    for (
      let index = 0;
      index < maxItems;
      index++
    ) {
      const key =
        storage.key(index);

      if (!key) {
        continue;
      }

      let rawValue = "";

      try {
        rawValue =
          storage.getItem(key) ||
          "";
      } catch {
        continue;
      }

      if (!rawValue) {
        continue;
      }

      const normalizedRaw =
        normalizeText(
          rawValue
        );

      /*
       * Chuỗi có trực tiếp cả tên nhóm
       * và group ID.
       */
      if (
        normalizedRaw.includes(
          normalizedTargetName
        )
      ) {
        addGroupIdsFromText(
          rawValue,
          `${source}.${key}`,
          72
        );
      }

      /*
       * Thử đọc JSON khi kích thước hợp lý.
       */
      if (
        rawValue.length <=
        1_000_000
      ) {
        try {
          const parsed =
            JSON.parse(
              rawValue
            );

          inspectNameLinkedObject(
            parsed,
            `${source}.${key}`,
            68
          );
        } catch {
          // Không phải JSON.
        }
      }
    }
  }

  try {
    inspectStorage(
      window.localStorage,
      "localStorage"
    );
  } catch {
    // Không truy cập được localStorage.
  }

  try {
    inspectStorage(
      window.sessionStorage,
      "sessionStorage"
    );
  } catch {
    // Không truy cập được sessionStorage.
  }

  /*
   * ==================================
   * 3. NHÓM ĐANG HIỂN THỊ TRÊN GIAO DIỆN
   * ==================================
   */
  const possibleElements =
    Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          "div",
          "span",
          "p",
          "h1",
          "h2",
          "h3",
          "[role='button']",
          "[role='listitem']",
          "[aria-selected='true']",
        ].join(",")
      )
    )
      .filter(
       (element) => {
          const rect =
            element.getBoundingClientRect();

          if (
            rect.width <= 0 ||
            rect.height <= 0
          ) {
            return false;
          }

          const rawText =
            String(
              element.innerText ||
              element.textContent ||
              ""
            ).trim();

          if (!rawText) {
            return false;
          }

          const normalizedText =
            normalizeText(
              rawText
            );

          return (
            normalizedText ===
              normalizedTargetName ||
            (
              normalizedText.length <=
                normalizedTargetName
                  .length + 100 &&
              normalizedText.includes(
                normalizedTargetName
              )
            )
          );
        }
      )
      .slice(0, 50);

  for (
    const element of
    possibleElements
  ) {
    let current:
      HTMLElement | null =
      element;

    /*
     * Đi ngược lên tối đa 8 lớp cha,
     * vì groupId thường nằm trên container
     * của hàng hội thoại, không nằm trên chữ.
     */
    for (
      let level = 0;
      level < 8 &&
      current;
      level++
    ) {
      for (
        const attribute of
        Array.from(
          current.attributes
        )
      ) {
        addGroupIdsFromText(
          attribute.value,
          `dom.attribute.${attribute.name}`,
          100 - level
        );
      }

      addGroupIdsFromText(
        current.id,
        "dom.id",
        98 - level
      );

      /*
       * Zalo Web dùng dữ liệu nội bộ
       * của React. Chỉ đọc các khóa React
       * của chính phần tử gần tên nhóm.
       */
      try {
        const internalKeys =
          Object.keys(
            current as any
          ).filter(
            (key) =>
              key.startsWith(
                "__reactProps$"
              ) ||
              key.startsWith(
                "__reactFiber$"
              ) ||
              key ===
                "__vueParentComponent"
          );

        for (
          const internalKey of
          internalKeys
        ) {
          inspectNameLinkedObject(
            (current as any)[
              internalKey
            ],
            `dom.${internalKey}`,
            92 - level
          );
        }
      } catch {
        // Bỏ qua dữ liệu nội bộ không đọc được.
      }

      current =
        current.parentElement;
    }
  }

  return Array.from(
    hintMap.entries()
  )
    .map(
      ([
        groupId,
        value,
      ]) => ({
        groupId,

        confidence:
          value.confidence,

        sources:
          Array.from(
            value.sources
          ),
      })
    )
    .sort(
      (a, b) =>
        b.confidence -
        a.confidence
    );
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

      const zdbDatabaseNames =
        databaseInfos
          .map((item: any) =>
            String(item?.name || "")
          )
          .filter((name: string) =>
            name.startsWith("zdb_")
          );

/*
 * Tìm group ID từ nhóm đang mở.
 *
 * Đây là nguồn chính.
 * Cách so sánh nội dung tin nhắn cũ
 * vẫn được giữ làm dự phòng.
 */
/**
 * Group ID tìm được trực tiếp
 * từ nhóm đang mở trên giao diện.
 */
const uiActiveGroupHints =
  findActiveGroupIdHints(
    groupName
  );

const normalizedPreferredGroupId =
  String(
    preferredGroupId || ""
  ).trim();

/**
 * Danh sách dùng trong quá trình quét.
 *
 * Group ID đã lưu được ưu tiên cao nhất,
 * nhưng vẫn giữ danh sách từ giao diện
 * để phát hiện trường hợp mở nhầm nhóm.
 */
const activeGroupHints = [
  ...uiActiveGroupHints,
];

if (
  /^g\d{6,}$/.test(
    normalizedPreferredGroupId
  ) &&
  !activeGroupHints.some(
    (item) =>
      item.groupId ===
      normalizedPreferredGroupId
  )
) {
  activeGroupHints.unshift({
    groupId:
      normalizedPreferredGroupId,

    confidence: 1000,

    sources: [
      "saved_group_ref",
    ],
  });
}

const activeGroupHintMap =
  new Map<
    string,
    {
      confidence: number;
      sources: string[];
    }
  >(
    activeGroupHints.map(
      (item) => [
        item.groupId,
        {
          confidence:
            item.confidence,

          sources:
            item.sources,
        },
      ]
    )
  );

    type Candidate = {
      /**
       * Nguồn chính: zdb_[account]/message.
       * Nguồn dự phòng: sidx_[account]/idx_queue.
       */
      databaseName: string;

      messageStoreName:
        | "message"
        | "idx_queue";

      groupId: string;
      score: number;
      matches: string[];
      latestTimestamp: number;

      source?:
        | "saved_group_ref"
        | "active_group_ui"
        | "active_group"
        | "visible_text"
        | "dom_message_id";

      matchedTimestamps: number[];

      /**
       * Bằng chứng trực tiếp:
       * ID bubble đang nhìn thấy trên DOM
       * trùng với msgId/cliMsgId trong zdb.
       */
      domIdMatchCount: number;
      matchedDomIds: string[];

      /**
       * Bằng chứng dự phòng:
       * text đang hiển thị trùng với text trong sidx.
       */
      visibleMatchCount: number;
      longestVisibleMatchLength: number;
    };

      const candidateMap =
        new Map<string, Candidate>();

      /**
       * ==================================
       * NGUỒN CHÍNH: zdb_[account]/message
       * ==================================
       *
       * Dùng Group ID đã lưu hoặc Group ID chắc chắn từ UI,
       * rồi truy vấn trực tiếp index theo toUid.
       */
      /**
       * ID message đang hiện trong đúng khung chat.
       *
       * Đây là bằng chứng mạnh nhất để biết Group ID nào
       * thật sự thuộc nhóm đang mở, vì msgId/cliMsgId phải
       * tồn tại trong timeline của đúng Group ID đó.
       */
      const domMessageIdSet =
        new Set<string>(
          (
            Array.isArray(
              domMessageSnapshot
            )
              ? domMessageSnapshot
              : []
          )
            .flatMap(
              (item: any) =>
                Array.isArray(
                  item?.idCandidates
                )
                  ? item.idCandidates
                  : []
            )
            .map((value: any) =>
              String(value || "")
                .trim()
            )
            .filter((value: string) =>
              /^\d{10,20}$/.test(
                value
              )
            )
        );

      /**
       * Không chỉ đọc candidate đầu tiên.
       *
       * Khi Zalo trả về nhiều Group ID từ DOM,
       * Reader phải kiểm tra từng mã bằng msgId/cliMsgId
       * của các bubble đang thật sự hiển thị.
       */
      const groupIdsForDirectRead =
        Array.from(
          new Set(
            [
              normalizedPreferredGroupId,

              ...uiActiveGroupHints
                .filter(
                  (item) =>
                    Number(
                      item.confidence
                    ) >= 95
                )
                .map((item) =>
                  String(
                    item.groupId || ""
                  ).trim()
                ),
            ].filter(
              (groupId) =>
                /^g\d{6,}$/.test(
                  groupId
                )
            )
          )
        );

      for (
        const groupIdForRead of
        groupIdsForDirectRead
      ) {
        for (
          const databaseName of
          zdbDatabaseNames
        ) {
          let db:
            | IDBDatabase
            | null = null;

          try {
            db = await openDatabase(
              databaseName
            );

            if (
              !db.objectStoreNames.contains(
                "message"
              )
            ) {
              continue;
            }

            const transaction =
              db.transaction(
                "message",
                "readonly"
              );

            const messageStore =
              transaction.objectStore(
                "message"
              );

            if (
              !messageStore.indexNames.contains(
                "userId_sendDttm_msgId"
              )
            ) {
              continue;
            }

            const messageIndex =
              messageStore.index(
                "userId_sendDttm_msgId"
              );

            const groupRange =
              IDBKeyRange.bound(
                [groupIdForRead],
                [
                  groupIdForRead,
                  [],
                ]
              );

            const directRead =
              await new Promise<{
                latestMessage:
                  any | null;
                domIdMatchCount:
                  number;
                matchedDomIds:
                  string[];
              }>(
                (resolve, reject) => {
                  const cursorRequest =
                    messageIndex.openCursor(
                      groupRange,
                      "prev"
                    );

                  const matchedDomIds =
                    new Set<string>();

                  let latestMessage:
                    any | null = null;

                  let scanned = 0;

                  const maxVerifyScan =
                    Math.min(
                      3_000,
                      Math.max(
                        200,
                        messageLimit
                      )
                    );

                  cursorRequest.onerror =
                    () =>
                      reject(
                        cursorRequest.error ||
                          new Error(
                            `Không đọc được ${databaseName}/message`
                          )
                      );

                  cursorRequest.onsuccess =
                    () => {
                      const cursor =
                        cursorRequest.result;

                      if (
                        !cursor ||
                        scanned >=
                          maxVerifyScan
                      ) {
                        resolve({
                          latestMessage,

                          domIdMatchCount:
                            matchedDomIds.size,

                          matchedDomIds:
                            Array.from(
                              matchedDomIds
                            ).slice(0, 20),
                        });

                        return;
                      }

                      scanned += 1;

                      const value =
                        cursor.value || {};

                      if (!latestMessage) {
                        latestMessage =
                          value;
                      }

                      const recordIds = [
                        value.msgId,
                        value.cliMsgId,
                        value.id,
                        value.messageId,
                        value.msg_id,
                        value.cli_msg_id,
                        cursor.primaryKey,
                        cursor.key,
                      ]
                        .map((item) =>
                          String(
                            item || ""
                          ).trim()
                        )
                        .filter(Boolean);

                      for (
                        const recordId of
                        recordIds
                      ) {
                        if (
                          domMessageIdSet.has(
                            recordId
                          )
                        ) {
                          matchedDomIds.add(
                            recordId
                          );
                        }
                      }

                      /**
                       * Ba ID trực tiếp đã đủ chắc chắn.
                       * Vẫn yêu cầu đã quét tối thiểu 30 record
                       * để tránh dừng quá sớm ở dữ liệu bất thường.
                       */
                      if (
                        matchedDomIds.size >=
                          3 &&
                        scanned >= 30
                      ) {
                        resolve({
                          latestMessage,

                          domIdMatchCount:
                            matchedDomIds.size,

                          matchedDomIds:
                            Array.from(
                              matchedDomIds
                            ).slice(0, 20),
                        });

                        return;
                      }

                      cursor.continue();
                    };
                }
              );

            if (
              !directRead.latestMessage
            ) {
              continue;
            }

            const latestTimestamp =
              Number(
                directRead
                  .latestMessage
                  .sendDttm ||
                  directRead
                    .latestMessage
                    .serverTime ||
                  directRead
                    .latestMessage
                    .cliMsgId ||
                  0
              );

            const directCandidate:
              Candidate = {
                databaseName,

                messageStoreName:
                  "message",

                groupId:
                  groupIdForRead,

                score:
                  3_000_000 +
                  directRead
                    .domIdMatchCount *
                    10_000_000,

                matches: [
                  `Đọc trực tiếp ${databaseName}/message`,

                  ...directRead
                    .matchedDomIds
                    .map(
                      (id) =>
                        `DOM message ID: ${id}`
                    ),
                ],

                latestTimestamp:
                  Number.isFinite(
                    latestTimestamp
                  )
                    ? latestTimestamp
                    : 0,

                matchedTimestamps:
                  Number.isFinite(
                    latestTimestamp
                  ) &&
                  latestTimestamp > 0
                    ? [
                        latestTimestamp,
                      ]
                    : [],

                domIdMatchCount:
                  directRead
                    .domIdMatchCount,

                matchedDomIds:
                  directRead
                    .matchedDomIds,

                visibleMatchCount: 0,

                longestVisibleMatchLength:
                  0,

                source:
                  directRead
                    .domIdMatchCount >
                  0
                    ? "dom_message_id"
                    : (
                        normalizedPreferredGroupId ===
                        groupIdForRead
                          ? "saved_group_ref"
                          : "active_group_ui"
                      ),
              };

            candidateMap.set(
              `${databaseName}__${groupIdForRead}`,
              directCandidate
            );

            /**
             * Group ID chỉ thuộc một tài khoản Zalo.
             */
            break;
          } catch {
            // Thử zdb_* tiếp theo.
          } finally {
            db?.close();
          }
        }
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

const messageTimestamp =
  Number(
    value.sendDttm ||
      value.serverTime ||
      value.cliMsgId ||
      0
  );

/*
 * ==================================
 * NGUỒN CHÍNH:
 * GROUP ID CỦA NHÓM ĐANG MỞ
 * ==================================
 */
const activeGroupHint =
  activeGroupHintMap.get(
    groupId
  );

if (activeGroupHint) {
  const candidateKey =
    `${databaseName}__${groupId}`;

  const current:
    Candidate =
    candidateMap.get(
      candidateKey
    ) ?? {
      databaseName,
      messageStoreName:
        "idx_queue",
      groupId,
      score: 0,
      matches: [],
      latestTimestamp: 0,
      matchedTimestamps: [],
      domIdMatchCount: 0,
      matchedDomIds: [],
      visibleMatchCount: 0,
      longestVisibleMatchLength: 0,
      source:
        "active_group",
    };

  /*
   * Điểm ưu tiên cao hơn cách khớp text.
   * Confidence giúp chọn đúng khi giao diện
   * trả về nhiều mã gợi ý.
   */
  current.score =
    Math.max(
      current.score,
      1_000_000 +
        activeGroupHint
          .confidence *
          1_000
    );

  current.source =
    "active_group";

  current.latestTimestamp =
    Math.max(
      current.latestTimestamp,
      Number.isFinite(
        messageTimestamp
      )
        ? messageTimestamp
        : 0
    );

      /*
      * Chỉ giữ timestamp mới nhất,
      * không đưa hàng nghìn timestamp
      * vào file debug.
      */
      if (
        current.latestTimestamp >
        0
      ) {
        current.matchedTimestamps = [
          current.latestTimestamp,
        ];
      }

      const activeGroupMatch =
        `Nhóm đang mở: ${groupName}`;

      if (
        !current.matches.includes(
          activeGroupMatch
        )
      ) {
        current.matches.push(
          activeGroupMatch
        );
      }

      candidateMap.set(
        candidateKey,
        current
      );
    }

    /*
    * ==================================
    * NGUỒN DỰ PHÒNG:
    * SO KHỚP TEXT ĐANG HIỂN THỊ
    * ==================================
    */
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
                  messageStoreName:
                    "idx_queue",
                  groupId,
                  score: 0,
                  matches:
                    [] as string[],
                  latestTimestamp: 0,
                  matchedTimestamps:
                    [] as number[],
                  domIdMatchCount: 0,
                  matchedDomIds:
                    [] as string[],
                  visibleMatchCount: 0,
                  longestVisibleMatchLength:
                    0,
                  source:
                    "visible_text",
                };

              if (!current.source) {
                current.source =
                  "visible_text";
              }

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

                      current.visibleMatchCount +=
                        1;
                    }

                    current.longestVisibleMatchLength =
                      Math.max(
                        current
                          .longestVisibleMatchLength,
                        matchedText.length
                      );
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
        /**
         * Ưu tiên bằng chứng trực tiếp từ msgId/cliMsgId DOM.
         */
        if (
          b.domIdMatchCount !==
          a.domIdMatchCount
        ) {
          return (
            b.domIdMatchCount -
            a.domIdMatchCount
          );
        }

        /**
         * Sau đó mới ưu tiên số text thật sự khớp.
         */
        if (
          b.visibleMatchCount !==
          a.visibleMatchCount
        ) {
          return (
            b.visibleMatchCount -
            a.visibleMatchCount
          );
        }

        if (
          b.longestVisibleMatchLength !==
          a.longestVisibleMatchLength
        ) {
          return (
            b.longestVisibleMatchLength -
            a.longestVisibleMatchLength
          );
        }

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          b.latestTimestamp -
          a.latestTimestamp
        );
      });

      /**
       * ==================================
       * XÁC MINH GROUP ID
       * ==================================
       *
       * Mức 1:
       * - msgId/cliMsgId của bubble DOM trùng zdb.
       *
       * Mức 2:
       * - text dài đang hiển thị trùng sidx.
       *
       * Nếu nhiều Group ID có bằng chứng ngang nhau,
       * không tự chọn để tránh nhập nhầm nhóm.
       */
      const directEvidenceByGroup =
        new Map<
          string,
          Candidate
        >();

      for (
        const candidate of
        candidates
      ) {
        if (
          candidate.domIdMatchCount <=
          0
        ) {
          continue;
        }

        const current =
          directEvidenceByGroup.get(
            candidate.groupId
          );

        if (
          !current ||
          candidate.domIdMatchCount >
            current.domIdMatchCount
        ) {
          directEvidenceByGroup.set(
            candidate.groupId,
            candidate
          );
        }
      }

      const directEvidence =
        Array.from(
          directEvidenceByGroup.values()
        ).sort(
          (a, b) =>
            b.domIdMatchCount -
              a.domIdMatchCount ||
            b.latestTimestamp -
              a.latestTimestamp
        );

      const bestDirectEvidence =
        directEvidence[0] || null;

      const secondDirectEvidence =
        directEvidence.find(
          (candidate) =>
            candidate.groupId !==
            bestDirectEvidence
              ?.groupId
        ) || null;

      const directWinnerIsUnique =
        Boolean(
          bestDirectEvidence &&
          (
            !secondDirectEvidence ||
            bestDirectEvidence
              .domIdMatchCount >
              secondDirectEvidence
                .domIdMatchCount
          )
        );

      const textEvidenceByGroup =
        new Map<
          string,
          Candidate
        >();

      for (
        const candidate of
        candidates
      ) {
        if (
          candidate.visibleMatchCount <=
            0 ||
          candidate
            .longestVisibleMatchLength <
            40
        ) {
          continue;
        }

        const current =
          textEvidenceByGroup.get(
            candidate.groupId
          );

        if (
          !current ||
          candidate.visibleMatchCount >
            current.visibleMatchCount ||
          (
            candidate.visibleMatchCount ===
              current.visibleMatchCount &&
            candidate
              .longestVisibleMatchLength >
              current
                .longestVisibleMatchLength
          )
        ) {
          textEvidenceByGroup.set(
            candidate.groupId,
            candidate
          );
        }
      }

      const textEvidence =
        Array.from(
          textEvidenceByGroup.values()
        ).sort(
          (a, b) =>
            b.visibleMatchCount -
              a.visibleMatchCount ||
            b.longestVisibleMatchLength -
              a.longestVisibleMatchLength ||
            b.latestTimestamp -
              a.latestTimestamp
        );

      const bestTextEvidence =
        textEvidence[0] || null;

      const secondTextEvidence =
        textEvidence.find(
          (candidate) =>
            candidate.groupId !==
            bestTextEvidence
              ?.groupId
        ) || null;

      const textWinnerIsUnique =
        Boolean(
          bestTextEvidence &&
          (
            !secondTextEvidence ||
            bestTextEvidence
              .visibleMatchCount >
              secondTextEvidence
                .visibleMatchCount ||
            (
              bestTextEvidence
                .visibleMatchCount ===
                secondTextEvidence
                  .visibleMatchCount &&
              bestTextEvidence
                .longestVisibleMatchLength >=
                secondTextEvidence
                  .longestVisibleMatchLength +
                  80
            )
          )
        );

      const verifiedEvidence =
        directWinnerIsUnique
          ? bestDirectEvidence
          : (
              textWinnerIsUnique
                ? bestTextEvidence
                : null
            );

      const verifiedGroupId =
        String(
          verifiedEvidence
            ?.groupId || ""
        ).trim();

      const groupIdVerificationSource =
        directWinnerIsUnique
          ? "dom_message_id"
          : (
              textWinnerIsUnique
                ? "visible_text"
                : null
            );

      let bestCandidate:
        Candidate | null =
        candidates[0] || null;

      /**
       * Sau khi xác minh Group ID bằng sidx,
       * vẫn ưu tiên đọc timeline đầy đủ từ zdb/message.
       */
      if (
        /^g\d{6,}$/.test(
          verifiedGroupId
        )
      ) {
        const directCandidateForVerifiedGroup =
          candidates.find(
            (candidate) =>
              candidate.groupId ===
                verifiedGroupId &&
              candidate.messageStoreName ===
                "message"
          ) || null;

        bestCandidate =
          directCandidateForVerifiedGroup ||
          verifiedEvidence;

        if (
          bestCandidate &&
          verifiedEvidence
        ) {
          bestCandidate.matchedTimestamps =
            Array.from(
              new Set([
                ...bestCandidate
                  .matchedTimestamps,
                ...verifiedEvidence
                  .matchedTimestamps,
              ])
            );

          bestCandidate.domIdMatchCount =
            Math.max(
              bestCandidate
                .domIdMatchCount,
              verifiedEvidence
                .domIdMatchCount
            );

          bestCandidate.visibleMatchCount =
            Math.max(
              bestCandidate
                .visibleMatchCount,
              verifiedEvidence
                .visibleMatchCount
            );

          bestCandidate.longestVisibleMatchLength =
            Math.max(
              bestCandidate
                .longestVisibleMatchLength,
              verifiedEvidence
                .longestVisibleMatchLength
            );

          bestCandidate.source =
            groupIdVerificationSource ||
            bestCandidate.source;
        }
      }

      if (!bestCandidate) {
      const strongestUiHint =
        uiActiveGroupHints.find(
          (item) =>
            Number(
              item.confidence
            ) >= 95
        ) || null;

      /**
       * Dù chưa tìm được message trong idx_queue,
       * Reader vẫn có thể đã biết chính xác Group ID.
       */
      const resolvedGroupId =
        /^g\d{6,}$/.test(
          normalizedPreferredGroupId
        )
          ? normalizedPreferredGroupId
          : (
              strongestUiHint
                ?.groupId ||
              null
            );

      const groupIdSource =
        /^g\d{6,}$/.test(
          normalizedPreferredGroupId
        )
          ? "saved_group_ref"
          : (
              strongestUiHint
                ? "active_group_ui"
                : null
            );

      return {
        ok: false,

        error:
          resolvedGroupId
            ? (
                "Đã xác định được Group ID, nhưng chưa tìm thấy message tương ứng trong IndexedDB."
              )
            : (
                "Không lấy được Group ID từ nhóm đang mở và cũng không khớp được text đang hiển thị."
              ),

        visibleTexts,

        /**
         * Chỉ các mã thật sự tìm thấy
         * từ giao diện hiện tại.
         */
        uiActiveGroupHints,

        /**
         * Gồm cả Group ID đã lưu,
         * nếu có.
         */
        activeGroupHints,

        candidates: [],

        databaseName: null,
        messageStoreName: null,

        groupId:
          resolvedGroupId,

        groupIdSource,

        groupIdVerified:
          Boolean(
            verifiedGroupId
          ),

        verifiedGroupId:
          verifiedGroupId ||
          null,

        groupIdVerificationSource,

        matchedTimeStart: null,
        matchedTimeEnd: null,

        anchorTimestamp: null,

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

      /*
       * Chưa chốt export window ở đây.
       * visible text chỉ dùng để nhận diện group ID,
       * không được dùng làm mốc chọn phòng mới nhất.
       */
      let exportWindowStart:
        number | null = null;

      let exportWindowEnd:
        number | null = null;

      let selectedDb: IDBDatabase | null =
        null;

      try {
        selectedDb = await openDatabase(
          bestCandidate.databaseName
        );

        const transaction =
          selectedDb.transaction(
            bestCandidate.messageStoreName,
            "readonly"
          );

        const store =
          transaction.objectStore(
            bestCandidate.messageStoreName
          );

        const groupMessages: any[] = [];

        await new Promise<void>(
          (resolve, reject) => {
            let scanned = 0;

            let cursorRequest:
              IDBRequest<
                IDBCursorWithValue | null
              >;

            if (
              bestCandidate.messageStoreName ===
                "message" &&
              store.indexNames.contains(
                "userId_sendDttm_msgId"
              )
            ) {
              const messageIndex =
                store.index(
                  "userId_sendDttm_msgId"
                );

              const groupRange =
                IDBKeyRange.bound(
                  [bestCandidate.groupId],
                  [
                    bestCandidate.groupId,
                    [],
                  ]
                );

              cursorRequest =
                messageIndex.openCursor(
                  groupRange,
                  "prev"
                );
            } else {
              cursorRequest =
                store.openCursor(
                  null,
                  "prev"
                );
            }

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

              const selectedReadLimit =
                bestCandidate.messageStoreName ===
                "message"
                  ? messageLimit
                  : scanLimit;

             if (
                !cursor ||
                scanned >=
                  selectedReadLimit
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
                  "string" &&
                !isLikelyEncryptedMessageText(
                  value.message
                )
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
                senderName:
                  isLikelyEncryptedMessageText(
                    value.dName
                  )
                    ? ""
                    : String(
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

        /**
         * ==================================
         * BỔ SUNG NỘI DUNG ĐÃ GIẢI MÃ TỪ sidx
         * ==================================
         *
         * zdb/message quyết định timeline. sidx/idx_queue chỉ được
         * tra trực tiếp theo msgId để lấy text/ảnh/video đã giải mã.
         */
        const contentEnrichment = {
          attempted: false,
          databaseName: null as
            | string
            | null,
          requestedCount:
            groupMessages.length,
          matchedRecordCount: 0,
          decodedTextCount: 0,
          decodedImageCount: 0,
          decodedVideoCount: 0,
          photoRecordWithoutUrlCount: 0,
        };

        if (
          bestCandidate.messageStoreName ===
          "message"
        ) {
          const accountSuffix =
            bestCandidate.databaseName
              .startsWith("zdb_")
              ? bestCandidate.databaseName
                  .slice(
                    "zdb_".length
                  )
              : "";

          const sidxDatabaseName =
            accountSuffix
              ? `sidx_${accountSuffix}`
              : "";

          if (
            sidxDatabaseName &&
            searchDatabaseNames.includes(
              sidxDatabaseName
            )
          ) {
            let sidxDb:
              | IDBDatabase
              | null = null;

            contentEnrichment.attempted =
              true;

            contentEnrichment.databaseName =
              sidxDatabaseName;

            try {
              sidxDb = await openDatabase(
                sidxDatabaseName
              );

              if (
                sidxDb.objectStoreNames.contains(
                  "idx_queue"
                )
              ) {
                const sidxTransaction =
                  sidxDb.transaction(
                    "idx_queue",
                    "readonly"
                  );

                const sidxStore =
                  sidxTransaction.objectStore(
                    "idx_queue"
                  );

                /**
                 * Tạo toàn bộ request trước khi await để transaction
                 * không tự đóng giữa chừng.
                 */
                const sidxRequests =
                  groupMessages.map(
                    (message) => {
                      const msgId =
                        String(
                          message.msgId ||
                            ""
                        ).trim();

                      if (!msgId) {
                        return Promise.resolve(
                          null
                        );
                      }

                      return requestToPromise(
                        sidxStore.get(
                          msgId
                        )
                      ).catch(
                        () => null
                      );
                    }
                  );

                const sidxValues =
                  await Promise.all(
                    sidxRequests
                  );

                for (
                  let messageIndex = 0;
                  messageIndex <
                  groupMessages.length;
                  messageIndex++
                ) {
                  const sidxValue =
                    sidxValues[
                      messageIndex
                    ];

                  if (!sidxValue) {
                    continue;
                  }

                  contentEnrichment
                    .matchedRecordCount += 1;

                  const decoded =
                    extractDecodedSidxContent(
                      sidxValue
                    );

                  const message =
                    groupMessages[
                      messageIndex
                    ];

                  if (
                    decoded.kind ===
                      "text" &&
                    decoded.text
                  ) {
                    message.kind =
                      "text";
                    message.text =
                      decoded.text;
                    message.contentSource =
                      "sidx";

                    contentEnrichment
                      .decodedTextCount += 1;
                  }

                  if (
                    decoded.kind ===
                      "image" &&
                    decoded.imageUrls
                      .length > 0
                  ) {
                    message.kind =
                      "image";
                    message.imageUrls =
                      decoded.imageUrls;
                    message.groupLayoutId =
                      decoded.groupLayoutId;
                    message.imageIndex =
                      decoded.imageIndex;
                    message.totalImages =
                      decoded.totalImages;
                    message.contentSource =
                      "sidx";

                    contentEnrichment
                      .decodedImageCount += 1;
                  } else if (
                    decoded.msgType === 2 ||
                    decoded.originMsgType ===
                      "chat.photo"
                  ) {
                    contentEnrichment
                      .photoRecordWithoutUrlCount += 1;
                  }

                  if (
                    decoded.videoUrls.length > 0 ||
                    decoded.videoThumbUrls.length > 0
                  ) {
                    message.videoUrls =
                      decoded.videoUrls;
                    message.videoThumbUrls =
                      decoded.videoThumbUrls;
                    message.videoDebug =
                      decoded.videoDebug;
                    message.contentSource =
                      "sidx";

                    contentEnrichment
                      .decodedVideoCount += 1;
                  }

                  if (decoded.senderName) {
                    message.senderName =
                      decoded.senderName;
                  }

                  if (decoded.originMsgType) {
                    message.originMsgType =
                      decoded.originMsgType;
                  }

                  if (
                    !message.fromUid &&
                    decoded.fromUid
                  ) {
                    message.fromUid =
                      decoded.fromUid;
                  }

                  if (
                    !message.toUid &&
                    decoded.toUid
                  ) {
                    message.toUid =
                      decoded.toUid;
                  }
                }
              }
            } catch {
              /**
               * Không làm hỏng timeline zdb khi sidx chưa sẵn sàng.
               */
            } finally {
              sidxDb?.close();
            }
          }
        }

        /**
         * ==================================
         * BỔ SUNG NỘI DUNG TỪ DOM ĐANG HIỂN THỊ
         * ==================================
         *
         * Chỉ áp dụng cho message zdb còn rỗng sau khi tra sidx.
         * Ưu tiên:
         * 1. Match trực tiếp msgId/cliMsgId từ attribute DOM.
         * 2. Match theo mốc thời gian đang hiển thị, ví dụ "17:54 Hôm qua".
         *
         * Không ghi đè payload đã giải mã từ sidx.
         */
        const domHydration = {
          attempted:
            Array.isArray(
              domMessageSnapshot
            ) &&
            domMessageSnapshot.length > 0,
          itemCount:
            Array.isArray(
              domMessageSnapshot
            )
              ? domMessageSnapshot.length
              : 0,
          directMatchCount: 0,
          timeMatchCount: 0,
          decodedTextCount: 0,
          decodedImageCount: 0,
          decodedVideoCount: 0,
          unmatchedItemCount: 0,
          rejectedTextItemCount: 0,
          ambiguousTextMatchCount: 0,
          newestApproxTimestamp: null as
            | number
            | null,
        };

        if (
          domHydration.attempted
        ) {
          const messageByAnyId =
            new Map<string, any>();

          for (
            const message of
            groupMessages
          ) {
            const msgId =
              String(
                message.msgId || ""
              ).trim();

            const cliMsgId =
              String(
                message.cliMsgId || ""
              ).trim();

            if (msgId) {
              messageByAnyId.set(
                msgId,
                message
              );
            }

            if (cliMsgId) {
              messageByAnyId.set(
                cliMsgId,
                message
              );
            }
          }

          function isBlankTextMessage(
            message: any
          ) {
            return (
              Number(
                message?.msgType || 0
              ) === 1 &&
              !String(
                message?.text || ""
              ).trim()
            );
          }

          function isBlankImageMessage(
            message: any
          ) {
            return (
              (
                Number(
                  message?.msgType || 0
                ) === 2 ||
                String(
                  message?.originMsgType || ""
                ) === "chat.photo"
              ) &&
              !(
                Array.isArray(
                  message?.imageUrls
                ) &&
                message.imageUrls.length > 0
              )
            );
          }

          function isBlankVideoMessage(
            message: any
          ) {
            return (
              (
                Number(
                  message?.msgType || 0
                ) === 18 ||
                String(
                  message?.originMsgType || ""
                ) === "chat.video.msg"
              ) &&
              !(
                Array.isArray(
                  message?.videoUrls
                ) &&
                message.videoUrls.length > 0
              )
            );
          }

          function isSuspiciousDomTextItem(
            domItem: any
          ) {
            const text = String(
              domItem?.text || ""
            ).trim();

            if (!text) {
              return false;
            }

            const idCount =
              Array.isArray(
                domItem?.idCandidates
              )
                ? domItem.idCandidates.length
                : 0;

            const separatorCount =
              (
                text.match(
                  /➖+\s*\/{3}\s*➖+/g
                ) || []
              ).length;

            const timeCount =
              (
                text.match(
                  /\b\d{1,2}:\d{2}\b/g
                ) || []
              ).length;

            const projectHeaderCount =
              (
                text.match(
                  /(?:THÔNG BÁO DỰ ÁN|CẬP NHẬT DỰ ÁN|Địa chỉ:)/gi
                ) || []
              ).length;

            return (
              Number(
                domItem?.descendantIdentityCount ||
                  0
              ) >= 2 ||
              idCount > 4 ||
              (
                text.length > 1800 &&
                (
                  separatorCount >= 2 ||
                  timeCount >= 3 ||
                  projectHeaderCount >= 3
                )
              ) ||
              (
                separatorCount >= 3 &&
                timeCount >= 3
              ) ||
              (
                projectHeaderCount >= 4 &&
                timeCount >= 2
              )
            );
          }

          function markDomSource(
            message: any,
            domItem: any
          ) {
            message.contentSource =
              "dom";

            message.domHydration = {
              order: Number(
                domItem?.order || 0
              ),
              timeText: String(
                domItem?.timeText || ""
              ),
              approxTimestamp:
                Number(
                  domItem?.approxTimestamp || 0
                ) || null,
            };

            if (
              !message.senderName &&
              domItem?.senderName
            ) {
              message.senderName =
                String(
                  domItem.senderName
                );
            }
          }

          function findClosestBlankMessage(
            params: {
              approxTimestamp: number;
              kind:
                | "text"
                | "image"
                | "video";
              maxDistanceMs: number;
              fromUid?: string;
              minTimestamp?: number;
              maxTimestamp?: number;
              excludedMessages?: Set<any>;
            }
          ) {
            const {
              approxTimestamp,
              kind,
              maxDistanceMs,
              fromUid,
              minTimestamp,
              maxTimestamp,
              excludedMessages,
            } = params;

            const candidates =
              groupMessages.filter(
                (message) => {
                  if (
                    excludedMessages?.has(
                      message
                    )
                  ) {
                    return false;
                  }

                  const timestamp =
                    Number(
                      message.sendDttm ||
                        message.serverTime ||
                        0
                    );

                  if (
                    !Number.isFinite(
                      timestamp
                    ) ||
                    timestamp <= 0
                  ) {
                    return false;
                  }

                  if (
                    minTimestamp != null &&
                    timestamp <
                      minTimestamp
                  ) {
                    return false;
                  }

                  if (
                    maxTimestamp != null &&
                    timestamp >
                      maxTimestamp
                  ) {
                    return false;
                  }

                  if (
                    fromUid &&
                    message.fromUid &&
                    String(
                      message.fromUid
                    ) !== fromUid
                  ) {
                    return false;
                  }

                  const blank =
                    kind === "text"
                      ? isBlankTextMessage(
                          message
                        )
                      : kind === "image"
                        ? isBlankImageMessage(
                            message
                          )
                        : isBlankVideoMessage(
                            message
                          );

                  return (
                    blank &&
                    Math.abs(
                      timestamp -
                        approxTimestamp
                    ) <=
                      maxDistanceMs
                  );
                }
              );

            return candidates.sort(
              (a, b) => {
                const distanceA =
                  Math.abs(
                    Number(
                      a.sendDttm || 0
                    ) -
                      approxTimestamp
                  );

                const distanceB =
                  Math.abs(
                    Number(
                      b.sendDttm || 0
                    ) -
                      approxTimestamp
                  );

                return (
                  distanceA - distanceB ||
                  Number(
                    a.sendDttm || 0
                  ) -
                    Number(
                      b.sendDttm || 0
                    )
                );
              }
            )[0] || null;
          }

          const assignedTextMessages =
            new Set<any>();

          const assignedImageMessages =
            new Set<any>();

          const assignedVideoMessages =
            new Set<any>();

          const assignedDomImageUrls =
            new Set<string>();

          const domItems =
            [...domMessageSnapshot]
              .filter(Boolean)
              .sort(
                (a: any, b: any) =>
                  Number(
                    a.order || 0
                  ) -
                  Number(
                    b.order || 0
                  )
              );

          for (
            const domItem of
            domItems
          ) {
            const approxTimestamp =
              Number(
                domItem.approxTimestamp ||
                  0
              );

            if (
              approxTimestamp > 0 &&
              (
                domHydration
                  .newestApproxTimestamp ==
                  null ||
                approxTimestamp >
                  domHydration
                    .newestApproxTimestamp
              )
            ) {
              domHydration
                .newestApproxTimestamp =
                approxTimestamp;
            }

            let itemMatched = false;
            let textTarget: any = null;

            const directTargets =
              Array.from(
                new Set(
                  (
                    Array.isArray(
                      domItem.idCandidates
                    )
                      ? domItem.idCandidates
                      : []
                  )
                    .map((id: any) =>
                      messageByAnyId.get(
                        String(id)
                      )
                    )
                    .filter(Boolean)
                )
              );

            const domText = String(
              domItem.text || ""
            ).trim();

            if (domText) {
              if (
                isSuspiciousDomTextItem(
                  domItem
                )
              ) {
                domHydration
                  .rejectedTextItemCount += 1;
              } else {
                const directTextTargets =
                  directTargets.filter(
                    (message: any) =>
                      isBlankTextMessage(
                        message
                      ) &&
                      !assignedTextMessages.has(
                        message
                      )
                  );

                if (
                  directTextTargets.length ===
                  1
                ) {
                  textTarget =
                    directTextTargets[0];

                  domHydration
                    .directMatchCount += 1;
                } else if (
                  directTextTargets.length >
                    1 &&
                  approxTimestamp > 0
                ) {
                  textTarget =
                    [...directTextTargets]
                      .sort(
                        (a: any, b: any) =>
                          Math.abs(
                            Number(
                              a.sendDttm || 0
                            ) -
                              approxTimestamp
                          ) -
                          Math.abs(
                            Number(
                              b.sendDttm || 0
                            ) -
                              approxTimestamp
                          )
                      )[0] || null;

                  if (textTarget) {
                    domHydration
                      .directMatchCount += 1;
                  }
                } else if (
                  directTextTargets.length >
                  1
                ) {
                  domHydration
                    .ambiguousTextMatchCount += 1;
                }

                if (
                  !textTarget &&
                  approxTimestamp > 0
                ) {
                  textTarget =
                    findClosestBlankMessage({
                      approxTimestamp,
                      kind: "text",
                      maxDistanceMs:
                        4 * 60 * 1000,
                      excludedMessages:
                        assignedTextMessages,
                    });

                  if (textTarget) {
                    domHydration
                      .timeMatchCount += 1;
                  }
                }

                if (textTarget) {
                  textTarget.kind =
                    "text";
                  textTarget.text =
                    domText;

                  markDomSource(
                    textTarget,
                    domItem
                  );

                  assignedTextMessages.add(
                    textTarget
                  );

                  domHydration
                    .decodedTextCount += 1;

                  itemMatched = true;
                }
              }
            }

            const domImages =
              Array.isArray(
                domItem.images
              )
                ? domItem.images.filter(
                    (image: any) =>
                      Boolean(
                        String(
                          image?.url || ""
                        ).trim()
                      )
                  )
                : [];

            if (
              domImages.length > 0
            ) {
              for (
                const image of
                domImages
              ) {
                const imageUrl = String(
                  image?.url || ""
                ).trim();

                if (
                  !imageUrl ||
                  assignedDomImageUrls.has(
                    imageUrl
                  )
                ) {
                  continue;
                }

                const imageDirectTarget =
                  (
                    Array.isArray(
                      image.idCandidates
                    )
                      ? image.idCandidates
                      : []
                  )
                    .map((id: any) =>
                      messageByAnyId.get(
                        String(id)
                      )
                    )
                    .find(
                      (message: any) =>
                        isBlankImageMessage(
                          message
                        ) &&
                        !assignedImageMessages.has(
                          message
                        )
                    );

                if (imageDirectTarget) {
                  imageDirectTarget.kind =
                    "image";
                  imageDirectTarget.imageUrls = [
                    imageUrl,
                  ];

                  markDomSource(
                    imageDirectTarget,
                    domItem
                  );

                  assignedImageMessages.add(
                    imageDirectTarget
                  );

                  assignedDomImageUrls.add(
                    imageUrl
                  );

                  domHydration
                    .directMatchCount += 1;
                  domHydration
                    .decodedImageCount += 1;

                  itemMatched = true;
                }
              }

              const remainingImages =
                domImages.filter(
                  (image: any) => {
                    const imageUrl =
                      String(
                        image?.url || ""
                      ).trim();

                    return (
                      Boolean(imageUrl) &&
                      !assignedDomImageUrls.has(
                        imageUrl
                      )
                    );
                  }
                );

              if (
                remainingImages.length > 0 &&
                approxTimestamp > 0
              ) {
                const anchorTimestamp =
                  Number(
                    textTarget?.sendDttm ||
                      approxTimestamp
                  );

                const anchorFromUid =
                  String(
                    textTarget?.fromUid ||
                      ""
                  );

                const nextTextTimestamp =
                  groupMessages
                    .filter(
                      (message) => {
                        const timestamp =
                          Number(
                            message.sendDttm ||
                              0
                          );

                        return (
                          Number(
                            message.msgType ||
                              0
                          ) === 1 &&
                          timestamp >
                            anchorTimestamp +
                              1000 &&
                          timestamp <=
                            anchorTimestamp +
                              3 * 60 *
                                1000 &&
                          (
                            !anchorFromUid ||
                            !message.fromUid ||
                            String(
                              message.fromUid
                            ) ===
                              anchorFromUid
                          )
                        );
                      }
                    )
                    .map((message) =>
                      Number(
                        message.sendDttm ||
                          0
                      )
                    )
                    .sort(
                      (a, b) => a - b
                    )[0] ||
                  anchorTimestamp +
                    3 * 60 * 1000;

                const imageCandidates =
                  groupMessages
                    .filter(
                      (message) => {
                        const timestamp =
                          Number(
                            message.sendDttm ||
                              0
                          );

                        return (
                          isBlankImageMessage(
                            message
                          ) &&
                          !assignedImageMessages.has(
                            message
                          ) &&
                          timestamp >=
                            anchorTimestamp -
                              45 * 1000 &&
                          timestamp <
                            nextTextTimestamp &&
                          (
                            !anchorFromUid ||
                            !message.fromUid ||
                            String(
                              message.fromUid
                            ) ===
                              anchorFromUid
                          )
                        );
                      }
                    )
                    .sort(
                      (a, b) =>
                        Number(
                          a.sendDttm || 0
                        ) -
                        Number(
                          b.sendDttm || 0
                        )
                    );

                const expectedAlbumImageCount =
                  Math.max(
                    remainingImages.length,
                    imageCandidates.length
                  );

                const syntheticAlbumId =
                  [
                    "dom",
                    String(
                      textTarget?.msgId ||
                        Math.round(
                          anchorTimestamp /
                            60_000
                        )
                    ),
                    String(
                      domItem.order || 0
                    ),
                  ].join(":");

                const assignCount =
                  Math.min(
                    remainingImages.length,
                    imageCandidates.length
                  );

                for (
                  let imageIndex = 0;
                  imageIndex <
                  assignCount;
                  imageIndex++
                ) {
                  const message =
                    imageCandidates[
                      imageIndex
                    ];

                  const image =
                    remainingImages[
                      imageIndex
                    ];

                  const imageUrl = String(
                    image?.url || ""
                  ).trim();

                  if (!imageUrl) {
                    continue;
                  }

                  message.kind =
                    "image";
                  message.imageUrls = [
                    imageUrl,
                  ];
                  message.groupLayoutId =
                    syntheticAlbumId;
                  message.imageIndex =
                    imageIndex;
                  message.totalImages =
                    expectedAlbumImageCount;

                  markDomSource(
                    message,
                    domItem
                  );

                  assignedImageMessages.add(
                    message
                  );

                  assignedDomImageUrls.add(
                    imageUrl
                  );

                  domHydration
                    .timeMatchCount += 1;
                  domHydration
                    .decodedImageCount += 1;

                  itemMatched = true;
                }

                if (
                  assignCount > 0 &&
                  remainingImages.length >
                    assignCount
                ) {
                  const firstMessage =
                    imageCandidates[0];

                  const extraImageUrls =
                    remainingImages
                      .slice(
                        assignCount
                      )
                      .map(
                        (image: any) =>
                          String(
                            image?.url || ""
                          ).trim()
                      )
                      .filter(Boolean);

                  firstMessage.imageUrls =
                    Array.from(
                      new Set([
                        ...firstMessage.imageUrls,
                        ...extraImageUrls,
                      ])
                    );

                  for (
                    const extraImageUrl of
                    extraImageUrls
                  ) {
                    assignedDomImageUrls.add(
                      extraImageUrl
                    );
                  }
                }
              }
            }

            const domVideoUrls =
              Array.isArray(
                domItem.videoUrls
              )
                ? Array.from(
                    new Set(
                      domItem.videoUrls
                        .map((url: any) =>
                          String(
                            url || ""
                          ).trim()
                        )
                        .filter(Boolean)
                    )
                  )
                : [];

            if (
              domVideoUrls.length > 0 &&
              approxTimestamp > 0
            ) {
              const videoTarget =
                directTargets.find(
                  (message: any) =>
                    isBlankVideoMessage(
                      message
                    ) &&
                    !assignedVideoMessages.has(
                      message
                    )
                ) ||
                findClosestBlankMessage({
                  approxTimestamp,
                  kind: "video",
                  maxDistanceMs:
                    4 * 60 * 1000,
                  fromUid: String(
                    textTarget?.fromUid ||
                      ""
                  ),
                  excludedMessages:
                    assignedVideoMessages,
                });

              if (videoTarget) {
                videoTarget.videoUrls =
                  domVideoUrls;

                markDomSource(
                  videoTarget,
                  domItem
                );

                assignedVideoMessages.add(
                  videoTarget
                );

                domHydration
                  .decodedVideoCount += 1;

                itemMatched = true;
              }
            }

            if (!itemMatched) {
              domHydration
                .unmatchedItemCount += 1;
            }
          }
        }

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

        const validGroupTimestamps =
          groupMessages
            .map((message) =>
              Number(
                message.sendDttm ||
                  message.serverTime ||
                  0
              )
            )
            .filter(
              (value) =>
                Number.isFinite(value) &&
                value > 0
            );

        const oldestGroupTimestamp =
          validGroupTimestamps.length > 0
            ? Math.min(...validGroupTimestamps)
            : null;

        const latestGroupTimestamp =
          validGroupTimestamps.length > 0
            ? Math.max(...validGroupTimestamps)
            : null;

        const readsDirectMessageStore =
          bestCandidate.messageStoreName ===
          "message";

        if (readsDirectMessageStore) {
          /**
           * Đã truy vấn đúng Group ID bằng index nên giữ toàn bộ
           * messageLimit tin mới nhất. Không cắt còn 10-60 phút,
           * tránh bỏ phòng đăng từ tối hôm trước trong nhóm đông tin.
           */
          exportWindowStart =
            oldestGroupTimestamp;
          exportWindowEnd =
            latestGroupTimestamp;
        } else {
          exportWindowStart =
            latestGroupTimestamp != null
              ? latestGroupTimestamp -
                contextBeforeMs
              : null;

          exportWindowEnd =
            latestGroupTimestamp != null
              ? latestGroupTimestamp +
                contextAfterMs
              : null;
        }

        const messagesInLatestWindow =
          readsDirectMessageStore
            ? groupMessages
            : groupMessages.filter(
                (message) => {
                  const timestamp =
                    Number(
                      message.sendDttm ||
                        message.serverTime ||
                        0
                    );

                  if (
                    exportWindowStart == null ||
                    exportWindowEnd == null
                  ) {
                    return true;
                  }

                  return (
                    timestamp >=
                      exportWindowStart &&
                    timestamp <=
                      exportWindowEnd
                  );
                }
              );

        const limitedMessages =
          messagesInLatestWindow.length >
          messageLimit
            ? messagesInLatestWindow.slice(
                -messageLimit
              )
            : messagesInLatestWindow;

        const usedSavedGroupId =
          Boolean(
            normalizedPreferredGroupId &&
            bestCandidate.groupId ===
              normalizedPreferredGroupId
          );

        return {
          ok: true,

          databaseName:
            bestCandidate.databaseName,

          messageStoreName:
            bestCandidate.messageStoreName,

          groupId:
            bestCandidate.groupId,

          groupIdSource:
            usedSavedGroupId
              ? "saved_group_ref"
              : (
                  bestCandidate.source ||
                  "visible_text"
                ),

          groupIdVerified:
            Boolean(
              verifiedGroupId
            ),

          verifiedGroupId:
            verifiedGroupId ||
            null,

          groupIdVerificationSource,

          visibleTexts,

          uiActiveGroupHints,
          activeGroupHints,

          matchedTimeStart,
          matchedTimeEnd,
          anchorTimestamp,

          oldestGroupTimestamp,
          latestGroupTimestamp,

          exportWindowStart,
          exportWindowEnd,

          candidates:
            candidates.slice(0, 10),

          contentEnrichment,
          domHydration,

          /**
           * File debug hiển thị mới → cũ.
           * buildRoomsFromIndexedDbMessages tự sắp lại cũ → mới khi ghép block.
           */
          messages:
            [...limitedMessages].sort(
              (a, b) =>
                Number(
                  b.sendDttm || 0
                ) -
                Number(
                  a.sendDttm || 0
                )
            ),
        };
      } finally {
        selectedDb?.close();
      }
    },
       {
          groupName,

          preferredGroupId,

          messageItemsSelector:
            config.selectors
              .messageItems,

          messageTextSelector:
            config.selectors
              .messageText || "",

          domMessageSnapshot,

          scanLimit,
          messageLimit,
          contextBeforeMs,
          contextAfterMs,
        }
  );

  /**
   * ==================================
   * LƯU VÀ KIỂM TRA GROUP ID
   * ==================================
   */
  const uiGroupHints =
    Array.isArray(
      (result as any)
        .uiActiveGroupHints
    )
      ? (
          (result as any)
            .uiActiveGroupHints
        )
      : [];

  const strongUiGroupHints =
    uiGroupHints.filter(
      (item: any) =>
        /^g\d{6,}$/.test(
          String(
            item?.groupId || ""
          ).trim()
        ) &&
        Number(
          item?.confidence || 0
        ) >= 95
    );

  const currentSavedRef =
    groupRefs[groupKey] ||
    null;

  const verifiedResultGroupId =
    String(
      (result as any)
        .verifiedGroupId || ""
    ).trim();

  const hasVerifiedResultGroupId =
    Boolean(
      (result as any)
        .groupIdVerified
    ) &&
    /^g\d{6,}$/.test(
      verifiedResultGroupId
    );

  const uniqueUiGroupId =
    strongUiGroupHints.length ===
    1
      ? String(
          strongUiGroupHints[0]
            ?.groupId || ""
        ).trim()
      : "";

  /**
   * Thứ tự tin cậy:
   *
   * 1. msgId/cliMsgId DOM khớp zdb.
   * 2. Text DOM khớp sidx.
   * 3. Chỉ có đúng một Group ID mạnh từ UI.
   */
  const detectedGroupId =
    hasVerifiedResultGroupId
      ? verifiedResultGroupId
      : (
          /^g\d{6,}$/.test(
            uniqueUiGroupId
          )
            ? uniqueUiGroupId
            : ""
        );

  const detectedSource =
    hasVerifiedResultGroupId
      ? String(
          (result as any)
            .groupIdVerificationSource ||
            "verified"
        )
      : (
          detectedGroupId
            ? "active_group_ui_unique"
            : ""
        );

  /**
   * Chỉ báo này được vòng lặp chính dùng để quyết định:
   *
   * - true  -> được phép import IndexedDB;
   * - false -> chuyển sang đọc DOM của đúng nhóm đang mở.
   */
  (result as any)
    .groupIdTrusted = false;

  if (currentSavedRef) {
    /**
     * Không còn coi "có một hint khác" là xung đột.
     *
     * Zalo có thể để nhiều ID rác trong DOM.
     * Chỉ xung đột khi Reader đã xác minh trực tiếp
     * một Group ID khác bằng message ID hoặc text.
     */
    if (
      hasVerifiedResultGroupId &&
      verifiedResultGroupId !==
        currentSavedRef.groupId
    ) {
      console.error(
        [
          "CẢNH BÁO GROUP ID ĐÃ XÁC MINH KHÔNG KHỚP.",
          `Đã lưu: ${currentSavedRef.groupId}.`,
          `Xác minh hiện tại: ${verifiedResultGroupId}.`,
          "Reader không import IndexedDB của lượt này.",
        ].join(" ")
      );

      (result as any).ok =
        false;

      (result as any).error =
        [
          "Group ID đã xác minh khác Group ID đã lưu.",
          `Đã lưu: ${currentSavedRef.groupId}.`,
          `Xác minh: ${verifiedResultGroupId}.`,
        ].join(" ");

      (result as any)
        .groupIdConflict = {
          savedGroupId:
            currentSavedRef
              .groupId,

          detectedGroupId:
            verifiedResultGroupId,

          source:
            detectedSource,
        };

      (result as any).messages =
        [];
    } else {
      (result as any).groupId =
        currentSavedRef.groupId;

      (result as any)
        .groupIdSource =
          hasVerifiedResultGroupId
            ? detectedSource
            : "saved_group_ref";

      (result as any)
        .groupIdTrusted = true;

      console.log(
        [
          "Đang dùng Group ID đã lưu:",
          `${groupKey} → ${currentSavedRef.groupId}`,
        ].join(" ")
      );
    }
  } else if (detectedGroupId) {
    groupRefs[groupKey] = {
      groupId:
        detectedGroupId,

      lastKnownName:
        groupName,

      savedAt:
        new Date()
          .toISOString(),

      source:
        "active_group_ui",
    };

    writeGroupRefs(
      groupRefs
    );

    (result as any).groupId =
      detectedGroupId;

    (result as any)
      .groupIdSource =
        detectedSource;

    (result as any)
      .groupIdTrusted = true;

    console.log(
      [
        "Đã xác minh và lưu Group ID:",
        `${groupKey} → ${detectedGroupId}`,
        `(${detectedSource})`,
      ].join(" ")
    );
  } else {
    /**
     * Nhiều ID nhưng chưa có bằng chứng trực tiếp:
     * không dùng candidate có score cao nhất.
     *
     * Vòng lặp chính sẽ đọc trực tiếp DOM,
     * nên nhóm vẫn được xử lý trong chính lượt này.
     */
    console.warn(
      [
        "Chưa xác minh được Group ID duy nhất.",
        "Không import bằng IndexedDB.",
        "Reader sẽ chuyển sang DOM fallback.",
        strongUiGroupHints.length >
        0
          ? `Các ID đang thấy: ${strongUiGroupHints
              .map(
                (item: any) =>
                  String(
                    item.groupId || ""
                  )
              )
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    );

    (result as any).ok =
      false;

    (result as any).error =
      "Group ID chưa được xác minh; chuyển sang DOM fallback.";

    (result as any)
      .groupIdUnverified = {
        strongUiGroupHints:
          strongUiGroupHints.map(
            (item: any) => ({
              groupId:
                String(
                  item.groupId || ""
                ),

              confidence:
                Number(
                  item.confidence ||
                    0
                ),

              sources:
                Array.isArray(
                  item.sources
                )
                  ? item.sources
                  : [],
            })
          ),
      };

    (result as any).messages =
      [];
  }

    fs.mkdirSync(NETWORK_LOG_DIR, {
      recursive: true,
    });

    const outputPath = path.join(
      NETWORK_LOG_DIR,
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

  const groupIdHints =
    Array.isArray(
      (result as any)
        .uiActiveGroupHints
    )
      ? (
          (result as any)
            .uiActiveGroupHints
        )
      : [];

  if (
    groupIdHints.length >
    0
  ) {
    console.log(
      [
        "Group ID tìm thấy từ giao diện:",

        groupIdHints
          .map(
            (item: any) =>
              `${item.groupId} (${item.confidence})`
          )
          .join(", "),
      ].join(" ")
    );
  }

  if (
    (result as any)
      .groupIdSource
  ) {
    console.log(
      `Nguồn nhận diện group ID: ${
        (result as any)
          .groupIdSource
      }`
    );
  }

  if (
    (result as any)
      .databaseName &&
    (result as any)
      .messageStoreName
  ) {
    console.log(
      [
        "Nguồn đọc message:",
        `${
          (result as any)
            .databaseName
        }/${
          (result as any)
            .messageStoreName
        }`,
      ].join(" ")
    );
  }

  const contentEnrichment =
    (result as any)
      .contentEnrichment;

  if (
    contentEnrichment
      ?.attempted
  ) {
    console.log(
      [
        "Bổ sung nội dung từ sidx:",
        `${contentEnrichment.matchedRecordCount}/${contentEnrichment.requestedCount} record khớp,`,
        `${contentEnrichment.decodedTextCount} text,`,
        `${contentEnrichment.decodedImageCount} ảnh,`,
        `${contentEnrichment.decodedVideoCount} video`,
      ].join(" ")
    );
  }

  const domHydration =
    (result as any)
      .domHydration;

  if (
    domHydration?.attempted
  ) {
    console.log(
      [
        "Bổ sung nội dung từ DOM:",
        `${domHydration.itemCount} item,`,
        `${domHydration.decodedTextCount} text,`,
        `${domHydration.decodedImageCount} ảnh,`,
        `${domHydration.decodedVideoCount} video,`,
        `${domHydration.directMatchCount} match ID,`,
        `${domHydration.timeMatchCount} match thời gian,`,
        `${domHydration.rejectedTextItemCount || 0} text cha bị loại,`,
        `${domHydration.ambiguousTextMatchCount || 0} text mơ hồ,`,
        `${domHydration.unmatchedItemCount} chưa ghép`,
      ].join(" ")
    );
  }

  const latestGroupTimestamp = Number(
    (result as any).latestGroupTimestamp || 0
  );

  const oldestGroupTimestamp = Number(
    (result as any).oldestGroupTimestamp || 0
  );

  const exportWindowStart = Number(
    (result as any).exportWindowStart || 0
  );

  const exportWindowEnd = Number(
    (result as any).exportWindowEnd || 0
  );

  if (latestGroupTimestamp > 0) {
    console.log(
      `Tin mới nhất của nhóm: ${new Date(
        latestGroupTimestamp
      ).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })}`
    );
  }

  if (oldestGroupTimestamp > 0) {
    console.log(
      `Tin cũ nhất đã quét: ${new Date(
        oldestGroupTimestamp
      ).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })}`
    );
  }

  if (
    exportWindowStart > 0 &&
    exportWindowEnd > 0
  ) {
    console.log(
      [
        "Khoảng thời gian xuất:",
        new Date(exportWindowStart).toLocaleString(
          "vi-VN",
          { timeZone: "Asia/Ho_Chi_Minh" }
        ),
        "→",
        new Date(exportWindowEnd).toLocaleString(
          "vi-VN",
          { timeZone: "Asia/Ho_Chi_Minh" }
        ),
      ].join(" ")
    );
  }


    const exportedMessages =
    (
      Array.isArray(result.messages)
        ? result.messages
        : []
    ) as IndexedDbGroupMessage[];

  /* PHASE_3_24H_IMPORT_FILTER */
  const phase3GroupConfig =
    (Array.isArray(config.groups)
      ? config.groups
      : []
    ).find((entry: any) => {
      const candidateName =
        typeof entry === "string"
          ? entry
          : String(entry?.name || entry?.key || "");

      return (
        candidateName.trim().toLocaleLowerCase("vi-VN") ===
        String(groupName || "")
          .trim()
          .toLocaleLowerCase("vi-VN")
      );
    }) as any;

  const messageLookbackHours =
    resolveMessageLookbackHours({
      groupValue:
        typeof phase3GroupConfig === "object"
          ? phase3GroupConfig?.messageLookbackHours
          : undefined,
      globalValue:
        (config as any).messageLookbackHours,
      fallbackHours: 24,
    });

  const messageLookbackResult =
    filterMessagesByLookback({
      messages: exportedMessages,
      lookbackHours: messageLookbackHours,
      nowMs: Date.now(),
    });

  const roomImportMessages =
    messageLookbackResult.messages
      as IndexedDbGroupMessage[];

  const lookbackStats =
    messageLookbackResult.stats;

  console.log(
    [
      `Giới hạn Imports: ${lookbackStats.lookbackHours} giờ.`,
      `Giữ ${lookbackStats.included}/${lookbackStats.total} message.`,
      `Quá hạn: ${lookbackStats.excludedTooOld}.`,
      `Thiếu timestamp: ${lookbackStats.excludedUnknownTimestamp}.`,
      `Timestamp tương lai: ${lookbackStats.excludedFuture}.`,
      `Mốc bắt đầu: ${new Date(
        lookbackStats.cutoffMs
      ).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      })}.`,
    ].join(" ")
  );

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
        NETWORK_LOG_DIR,
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
          roomImportMessages,

        config,
      });

    previewRooms =
      previewResult.rooms;
  }

  if (!result.ok) {
    const resolvedGroupId =
      String(
        (result as any)
          .groupId || ""
      ).trim();

    if (
      /^g\d{6,}$/.test(
        resolvedGroupId
      )
    ) {
      console.warn(
        [
          `Đã xác định Group ID: ${resolvedGroupId}.`,
          "Nhưng Reader chưa xuất được message của nhóm ở bước hiện tại.",
          `Xem file: ${outputPath}`,
        ].join(" ")
      );
    } else {
      console.warn(
        `Chưa nhận diện được Group ID. Xem file: ${outputPath}`
      );
    }

    return {
      result,
      previewRooms,
    };
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

function normalizeImageMimeType(
  input: any
) {
  const mimeType = String(
    input || ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  return mimeType ===
    "image/jpg"
    ? "image/jpeg"
    : mimeType;
}

function detectImageMimeTypeFromBuffer(
  sourceBuffer: Buffer,
  fallbackMimeType = ""
) {
  if (
    sourceBuffer.length >= 8 &&
    sourceBuffer[0] === 0x89 &&
    sourceBuffer[1] === 0x50 &&
    sourceBuffer[2] === 0x4e &&
    sourceBuffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    sourceBuffer.length >= 3 &&
    sourceBuffer[0] === 0xff &&
    sourceBuffer[1] === 0xd8 &&
    sourceBuffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    sourceBuffer.length >= 12 &&
    sourceBuffer.subarray(0, 4).toString(
      "ascii"
    ) === "RIFF" &&
    sourceBuffer.subarray(8, 12).toString(
      "ascii"
    ) === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    sourceBuffer.length >= 6 &&
    (
      sourceBuffer.subarray(0, 6).toString(
        "ascii"
      ) === "GIF87a" ||
      sourceBuffer.subarray(0, 6).toString(
        "ascii"
      ) === "GIF89a"
    )
  ) {
    return "image/gif";
  }

  if (
    sourceBuffer.length >= 12 &&
    sourceBuffer.subarray(4, 12).toString(
      "ascii"
    ).includes("ftypavif")
  ) {
    return "image/avif";
  }

  if (
    sourceBuffer.length >= 2 &&
    sourceBuffer[0] === 0xff &&
    sourceBuffer[1] === 0x0a
  ) {
    return "image/jxl";
  }

  return normalizeImageMimeType(
    fallbackMimeType
  );
}

async function readBlobImageInPage(
  page: Page,
  src: string
) {
  await page.evaluate(
    "globalThis.__name = Object"
  );

  const payload =
    await page.evaluate(
      async (blobUrl) => {
        const response =
          await fetch(blobUrl);

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const blob =
          await response.blob();

        const arrayBuffer =
          await blob.arrayBuffer();

        const bytes =
          new Uint8Array(
            arrayBuffer
          );

        let binary = "";
        const chunkSize =
          0x8000;

        for (
          let offset = 0;
          offset < bytes.length;
          offset += chunkSize
        ) {
          const chunk =
            bytes.subarray(
              offset,
              Math.min(
                offset + chunkSize,
                bytes.length
              )
            );

          binary +=
            String.fromCharCode(
              ...chunk
            );
        }

        return {
          base64: btoa(binary),
          mimeType:
            blob.type ||
            response.headers.get(
              "content-type"
            ) ||
            "application/octet-stream",
        };
      },
      src
    );

  return {
    sourceBuffer:
      Buffer.from(
        payload.base64,
        "base64"
      ),
    sourceMimeType:
      normalizeImageMimeType(
        payload.mimeType
      ),
  };
}

async function imageToBase64(
  page: Page,
  src: string
) {
  const normalizedSrc = String(
    src || ""
  ).trim();

  if (!normalizedSrc) {
    throw new Error(
      "Nguồn ảnh Zalo trống"
    );
  }

  let sourceBuffer: Buffer;
  let sourceMimeType = "";

  if (
    normalizedSrc
      .toLowerCase()
      .startsWith("file:")
  ) {
    const filePath =
      fileURLToPath(
        normalizedSrc
      );

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `File blob ảnh DOM không tồn tại: ${filePath}`
      );
    }

    sourceBuffer =
      fs.readFileSync(
        filePath
      );

    const extension =
      path.extname(filePath)
        .toLowerCase();

    const extensionMimeMap:
      Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".gif": "image/gif",
        ".jxl": "image/jxl",
      };

    sourceMimeType =
      detectImageMimeTypeFromBuffer(
        sourceBuffer,
        extensionMimeMap[
          extension
        ] || ""
      );
  } else if (
    path.isAbsolute(
      normalizedSrc
    ) &&
    fs.existsSync(
      normalizedSrc
    )
  ) {
    sourceBuffer =
      fs.readFileSync(
        normalizedSrc
      );

    sourceMimeType =
      detectImageMimeTypeFromBuffer(
        sourceBuffer
      );
  } else if (
    normalizedSrc
      .toLowerCase()
      .startsWith("blob:")
  ) {
    /**
     * Fallback cuối cùng: trường hợp blob không kịp được lưu trong lúc cuộn.
     * Cách chính vẫn là dom-media/file:// để không phụ thuộc vòng đời blob URL.
     */
    const blobResult =
      await readBlobImageInPage(
        page,
        normalizedSrc
      );

    sourceBuffer =
      blobResult.sourceBuffer;
    sourceMimeType =
      detectImageMimeTypeFromBuffer(
        sourceBuffer,
        blobResult.sourceMimeType
      );
  } else {
    const userAgent =
      await page.evaluate(
        () => navigator.userAgent
      );

    /*
     * Tải byte ảnh CDN bằng APIRequestContext.
     * Cách này không bị giới hạn CORS.
     */
    const response =
      await page.context().request.get(
        normalizedSrc,
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
          normalizedSrc,
        ].join(" ")
      );
    }

    sourceBuffer =
      await response.body();

    const responseHeaders =
      response.headers();

    sourceMimeType =
      detectImageMimeTypeFromBuffer(
        sourceBuffer,
        responseHeaders[
          "content-type"
        ] ||
          "application/octet-stream"
      );
  }

  if (sourceBuffer.length === 0) {
    throw new Error(
      `Ảnh Zalo trả về dữ liệu rỗng: ${normalizedSrc}`
    );
  }

  sourceMimeType =
    detectImageMimeTypeFromBuffer(
      sourceBuffer,
      sourceMimeType
    );

  const isJxl =
    sourceMimeType ===
      "image/jxl" ||
    /\/jxl\//i.test(
      normalizedSrc
    ) ||
    /\.jxl(?:[?#]|$)/i.test(
      normalizedSrc
    );

  if (isJxl) {
    const pngBuffer =
      await decodeJxlBufferToPng(
        sourceBuffer
      );

    return convertImageBufferToWebp(
      page,
      pngBuffer,
      "image/png"
    );
  }

  if (
    [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/avif",
      "image/gif",
    ].includes(
      sourceMimeType
    )
  ) {
    return convertImageBufferToWebp(
      page,
      sourceBuffer,
      sourceMimeType
    );
  }

  throw new Error(
    [
      "Định dạng ảnh Zalo chưa được hỗ trợ.",
      `Content-Type: ${sourceMimeType || "unknown"}.`,
      normalizedSrc,
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
  const state = readState();

  /**
   * Danh sách Group ID đã lưu được giữ trong bộ nhớ
   * suốt thời gian Reader đang chạy.
   */
  const groupRefs =
    readGroupRefs();

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page =
    context.pages()[0] ||
    (await context.newPage());

  /**
   * tsx/esbuild có thể chèn helper __name vào callback page.evaluate().
   * Callback đó chạy trong trình duyệt, không dùng được helper của Node.js.
   * addInitScript phải được đăng ký trước page.goto() để helper tồn tại
   * ngay từ document Zalo đầu tiên và cả các lần reload/navigation sau.
   */
  await page.addInitScript(
    "globalThis.__name = globalThis.__name || Object;"
  );

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
    "Nếu chưa login Zalo Web, hãy quét QR trong cửa sổ Chrome."
  );

  console.log("Sau khi login xong tool sẽ tự quét nhóm.");

  /*
   * Pipeline IndexedDB phải hoạt động độc lập với chế độ debug-only.
   * indexedDbDebugOnly chỉ quyết định Reader có đóng sau một lượt hay không.
   */
  const useIndexedDbPipeline = Boolean(
    config.indexedDbGroupExport ||
      config.indexedDbImportEnabled ||
      config.indexedDbRoomPreview ||
      config.indexedDbDebug ||
      config.indexedDbDebugOnly
  );

  while (true) {
    for (
      const groupEntry of
      config.groups
    ) {
      const {
        key: groupKey,
        name: groupName,
      } =
        normalizeGroupConfigEntry(
          groupEntry
        );

      try {
        activeGroupName =
          groupName;

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

          /*
           * DOM trước hết dùng để cuộn đúng khung chat.
           * Sau đó Reader chụp snapshot cuối cuộc trò chuyện
           * làm fallback cho message mới chưa có payload trong sidx.
           */
          await triggerNetworkHistoryLoad(
            page,
            15,
            config.selectors
              .messageItems
          );

          /*
           * Chờ Zalo Web giải mã và ghi message
           * vào IndexedDB/cache.
           */
          await page.waitForTimeout(
            5000
          );

                   if (config.indexedDbDebug) {
            await dumpIndexedDb(
              page,
              groupName,
              config
            );
          }

          let indexedDbExport:
            | Awaited<
                ReturnType<
                  typeof dumpActiveGroupMessages
                >
              >
            | null = null;

          if (
            config.indexedDbGroupExport
          ) {
            indexedDbExport =
              await dumpActiveGroupMessages(
                page,
                groupName,
                groupKey,
                config,
                groupRefs
              );
          }

          const indexedDbResult =
            indexedDbExport
              ?.result as
              | Record<
                  string,
                  any
                >
              | undefined;

          const indexedDbTrusted =
            Boolean(
              indexedDbResult?.ok &&
              indexedDbResult
                ?.groupIdTrusted
            );

          if (
            config.indexedDbImportEnabled &&
            indexedDbTrusted
          ) {
            await importIndexedDbRoomPreviews({
              page,
              config,
              groupName,

              rooms:
                indexedDbExport
                  ?.previewRooms ||
                [],

              state,
            });
          }

          const strictMessageLookbackForGroup =
            resolveStrictMessageLookback({
              groupValue:
                typeof groupEntry === "object"
                  ? (groupEntry as any)
                      ?.strictMessageLookback
                  : undefined,
              globalValue:
                (config as any)
                  .strictMessageLookback,
              fallback: true,
            });

          const shouldFallbackToDom =
            Boolean(
              config.indexedDbImportEnabled &&
              !indexedDbTrusted &&
              !strictMessageLookbackForGroup
            );

          if (
            config.indexedDbImportEnabled &&
            !indexedDbTrusted &&
            strictMessageLookbackForGroup
          ) {
            console.warn(
              [
                "Không chạy DOM fallback vì strictMessageLookback đang bật.",
                "DOM fallback không có timestamp đủ tin cậy để bảo đảm giới hạn 24 giờ.",
              ].join(" ")
            );
          }

          console.log(
            indexedDbTrusted
              ? `Đã hoàn tất quét/import IndexedDB nhóm ${groupName}`
              : `IndexedDB chưa được xác minh cho nhóm ${groupName}`
          );

          /**
           * Chế độ debug chỉ tạo file kiểm tra,
           * không chạy import DOM.
           */
          if (
            config.networkDebugOnly ||
            config.indexedDbDebugOnly
          ) {
            continue;
          }

          /**
           * IndexedDB đã an toàn hoặc hiện không bật import:
           * không chạy thêm luồng DOM để tránh trùng dữ liệu.
           */
          if (
            !shouldFallbackToDom
          ) {
            continue;
          }

          console.warn(
            [
              "Chuyển sang DOM fallback.",
              `Reader vẫn đọc trực tiếp nhóm đang mở: ${groupName}.`,
              "Không sử dụng timeline IndexedDB chưa xác minh.",
            ].join(" ")
          );
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

        await scrollChatToBottom(
          page,
          config.selectors
            .messageItems
        );
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

    const configuredIntervalMs = Number(
      config.scanIntervalMs
    );

    const idleIntervalMs = Number.isFinite(
      configuredIntervalMs
    )
      ? Math.max(60_000, configuredIntervalMs)
      : 15 * 60 * 1000;

    const nextScanAt = new Date(
      Date.now() + idleIntervalMs
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
            timeZone: "Asia/Ho_Chi_Minh",
          }
        )}`,
      ].join("\n")
    );

    /*
     * Thời gian nghỉ chỉ bắt đầu sau khi toàn bộ lượt quét/import kết thúc.
     * Vì vòng lặp dùng await tuần tự nên không có hai lượt chạy chồng nhau.
     */
    await sleep(idleIntervalMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
