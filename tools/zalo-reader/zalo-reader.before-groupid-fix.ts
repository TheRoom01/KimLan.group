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
const CONFIG_PATH = path.join(ROOT, "tools/zalo-reader/config.json");
const STATE_PATH = path.join(ROOT, "tools/zalo-reader/state.json");
const PROFILE_DIR = path.join(ROOT, ".zalo-reader/profile");

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


async function openGroup(page: Page, groupName: string, config: Config) {
  const search = page.locator(config.selectors.searchBox).first();
  await search.click({ timeout: 10000 });
  await search.fill(groupName);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  const exact = page.getByText(groupName, { exact: false }).first();
  if (await exact.count().catch(() => 0)) {
    await exact.click().catch(() => {});
    await page.waitForTimeout(2500);
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

async function triggerNetworkHistoryLoad(
  page: Page,
  steps = 10
) {
  /*
   * DOM ở đây chỉ được dùng để điều khiển thanh cuộn,
   * không dùng để lấy text, ảnh hay xác định phòng.
   */
  await scrollChatToBottom(page);
  /*
 * Chờ các message cuối cùng ổn định
 * trước khi đọc IndexedDB.
 */
await page.waitForTimeout(
  2_500
);

  for (let i = 0; i < steps; i++) {
    const moved = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll("div")
      ).filter((el: any) => {
        const style =
          window.getComputedStyle(el);

        const rect =
          el.getBoundingClientRect();

        return (
          (style.overflowY === "auto" ||
            style.overflowY === "scroll") &&
          el.scrollHeight >
            el.clientHeight + 200 &&
          rect.left > 350
        );
      });

      const chatScroller =
        candidates.sort(
          (a: any, b: any) =>
            b.scrollHeight -
            a.scrollHeight
        )[0] as HTMLElement | undefined;

      if (!chatScroller) return false;

      const oldTop =
        chatScroller.scrollTop;

      chatScroller.scrollTop = Math.max(
        0,
        oldTop -
          chatScroller.clientHeight * 0.4
      );

      return (
        chatScroller.scrollTop !== oldTop
      );
    });

    /*
    * Chờ Zalo:
    * - render message;
    * - tải media metadata;
    * - ghi message vào IndexedDB.
    */
    await page.waitForTimeout(
      2_200
    );

    if (!moved) break;
  }

  /*
   * Trở về cuối chat để nhận thêm message/network mới.
   */
  await scrollChatToBottom(page);
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
    .replace(/\s+/g, "");

  return /[-–—_=➖/]{5,}/.test(
    compact
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

  /*
   * Ưu tiên dùng logic đã có của reader.
   */
  if (isHouseInfoText(text)) {
    return true;
  }

  const normalized =
    makeStableText(text);

  const signals = [
    "cap nhat du an",
    "cap nhat thong tin",
    "dia chi",
    "quy mo",
    "phi dich vu",
    "hoa hong",
    "thu cung",
    "khach nuoc ngoai",
    "coc toi thieu",
  ];

  const matchedSignals =
    signals.filter((signal) =>
      normalized.includes(signal)
    ).length;

  return matchedSignals >= 3;
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
  room.fullText = [
    room.houseInfoText,
    room.markerText,
    ...room.descriptionTexts,
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
    IndexedDbGroupMessage[] |
    null = null;

  for (const message of messages) {
    const messageText =
      message.kind === "text"
        ? cleanIndexedDbRoomText(
            message.text
          )
        : "";

    const isSeparator =
      Boolean(
        messageText
      ) &&
      isIndexedDbSeparatorText(
        messageText
      );

    if (isSeparator) {
      /*
       * Nếu đang có block mở,
       * dấu hiện tại đóng block đó.
       */
      if (
        currentBlock &&
        currentBlock.length >
          0
      ) {
        blocks.push(
          currentBlock
        );
      }

      /*
       * Dấu hiện tại đồng thời mở block mới.
       */
      currentBlock = [];

      continue;
    }

    /*
     * Không lấy message nằm ngoài
     * hai dấu phân cách.
     */
    if (!currentBlock) {
      continue;
    }

    currentBlock.push(
      message
    );
  }

  /*
   * Không push currentBlock tại đây.
   * Nếu không có dấu đóng thì block chưa hoàn chỉnh.
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
      const houseInfoTexts =
        Array.from(
          new Set(
            senderMessages
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
              .filter(
                (text) =>
                  Boolean(text) &&
                  isIndexedDbHouseInfoText(
                    text
                  )
              )
          )
        );

      const houseInfoText =
        houseInfoTexts
          .join("\n\n")
          .trim();

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
  config: Config
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

            const bestCandidate =
        candidates[0] || null;

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
    }
  );

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

          /*
           * DOM chỉ dùng để cuộn.
           * Không dùng DOM để lấy text hoặc ghép ảnh.
           */
          await triggerNetworkHistoryLoad(
            page,
            15
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
          config
        );
    }

    if (
      config.indexedDbImportEnabled &&
      indexedDbExport?.result?.ok
    ) {
      await importIndexedDbRoomPreviews({
        page,
        config,
        groupName,

        rooms:
          indexedDbExport.previewRooms,

        state,
      });
    }

          console.log(
            `Đã hoàn tất quét/import IndexedDB nhóm ${groupName}`
          );

          /*
           * Pipeline IndexedDB của nhóm đã hoàn tất.
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