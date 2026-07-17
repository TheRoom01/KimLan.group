export function base64ToBuffer(base64: string) {
  const clean = String(base64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .trim();

  return Buffer.from(clean, "base64");
}

export function makeZaloTempVideoKey(
  batchId: string,
  videoId: string,
  extension = "mp4"
) {
  return [
    "zalo-imports",
    batchId,
    "videos",
    `${videoId}.${extension}`,
  ].join("/");
}

export function makeZaloTempVideoThumbKey(
  batchId: string,
  videoId: string,
  extension = "jpg"
) {
  return [
    "zalo-imports",
    batchId,
    "video-thumbs",
    `${videoId}.${extension}`,
  ].join("/");
}

export function validateRemoteZaloUrl(
  rawUrl: string,
  kind: "video" | "thumbnail"
) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL ${kind} không hợp lệ`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`URL ${kind} phải sử dụng HTTPS`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowed =
    kind === "video"
      ? hostname === "dlmd.me" || hostname.endsWith(".dlmd.me")
      : hostname === "zdn.vn" ||
        hostname.endsWith(".zdn.vn") ||
        hostname === "zalo.me" ||
        hostname.endsWith(".zalo.me");

  if (!allowed) {
    throw new Error(
      `Hostname ${kind} không được phép: ${hostname}`
    );
  }

  return parsed.toString();
}

export async function downloadRemoteBuffer(params: {
  url: string;
  maxBytes: number;
  fallbackContentType: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 30_000
  );

  try {
    const response = await fetch(params.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "Mozilla/5.0 KimLan-Zalo-Reader/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Không tải được media Zalo: HTTP ${response.status}`
      );
    }

    const declaredLength = Number(
      response.headers.get("content-length") || 0
    );

    if (declaredLength > 0 && declaredLength > params.maxBytes) {
      throw new Error(
        `Media vượt giới hạn ${params.maxBytes} bytes`
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > params.maxBytes) {
      throw new Error(
        `Media vượt giới hạn ${params.maxBytes} bytes`
      );
    }

    const contentType = String(
      response.headers.get("content-type") ||
        params.fallbackContentType
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Hết thời gian tải media Zalo sau ${
          params.timeoutMs ?? 30_000
        }ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function videoExtensionFromMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("quicktime")) return "mov";

  return "mp4";
}

export function imageExtensionFromMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";

  return "jpg";
}

export function normalizeImageMimeType(mimeType: string) {
  const normalized = String(mimeType || "")
    .trim()
    .toLowerCase();

  return normalized === "image/jpg"
    ? "image/jpeg"
    : normalized;
}
