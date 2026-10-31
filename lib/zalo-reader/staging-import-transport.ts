export const ZALO_READER_IMPORT_PATH =
  "/api/internal/zalo-reader/import";

// Next.js dev may need several seconds to cold-compile the route.
export const STAGING_API_PREFLIGHT_TIMEOUT_MS = 30_000;

// A room can contain multiple images that the API uploads sequentially.
export const STAGING_API_IMPORT_TIMEOUT_MS = 180_000;

export class StagingImportTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingImportTransportError";
  }
}

export function resolveStagingImportEndpoint(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(String(baseUrl || "").trim());
  } catch {
    throw new Error("Staging API URL không hợp lệ.");
  }

  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error("Staging Reader chỉ được gọi API HTTP trên localhost.");
  }

  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }

  return new URL(ZALO_READER_IMPORT_PATH, url.origin).toString();
}

export async function assertStagingImportApiAvailable(
  endpoint: string,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      // The current Next.js route only exports POST, so GET must resolve to 405.
      // This verifies the route without entering the import handler.
      method: "GET",
      signal: AbortSignal.timeout(STAGING_API_PREFLIGHT_TIMEOUT_MS),
    });
  } catch (error: any) {
    const causeCode = String(error?.cause?.code || "").trim();
    const detail = causeCode || String(error?.cause?.message || error?.message || "network error");
    throw new StagingImportTransportError(
      `Không kết nối được staging API tại ${endpoint} (${detail}). Hãy khởi động Next.js local trước khi chạy Reader. Chưa gửi phòng hoặc tải media.`,
    );
  }

  const allowedMethods = String(response.headers.get("allow") || "").toUpperCase();
  if (response.status !== 405) {
    throw new StagingImportTransportError(
      `Staging API không xác nhận route POST tại ${endpoint} (HTTP ${response.status}, Allow: ${allowedMethods || "không có"}). Chưa gửi phòng hoặc tải media.`,
    );
  }
}

export function buildStagingRoomContent(input: {
  fullText?: unknown;
  houseInfoText?: unknown;
  markerText?: unknown;
  descriptionTexts?: unknown;
  imageUrls?: unknown;
}) {
  const fullText = String(input.fullText ?? "").trim();
  const textParts = [
    input.houseInfoText,
    input.markerText,
    ...(Array.isArray(input.descriptionTexts) ? input.descriptionTexts : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const assembledText = textParts
    .filter((part) => {
      if (seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join("\n\n");

  const imageUrls = Array.isArray(input.imageUrls)
    ? Array.from(
        new Set(
          input.imageUrls
            .map((value) => String(value ?? "").trim())
            .filter(Boolean),
        ),
      )
    : [];

  return {
    rawText: fullText || assembledText,
    imageUrls,
  };
}
