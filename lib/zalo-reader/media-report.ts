// Deliberately project API data onto a small allowlist: never persist raw messages or URLs.
export function buildMediaReport(input: {
  sourceMessageId?: unknown;
  expectedImages: number;
  detectedImages?: number;
  albumExpectedImages?: number | null;
  expectedVideos: number;
  downloadedImages: number;
  submittedImages: number;
  submittedVideos: number;
  response: unknown;
}) {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  const response = asRecord(input.response);
  const progress = asRecord(response.mediaProgress);
  const count = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const errorCodes = Array.from(new Set<string>(
    (Array.isArray(response.issues) ? response.issues : [])
      .map(asRecord)
      .filter((issue) => issue.level === "error")
      .map((issue) => {
        if (/^[A-Z][A-Z0-9_]{1,63}$/.test(String(issue.code || ""))) return String(issue.code);
        const message = String(issue?.message || "");
        if (/sourceUrl|URL video|VIDEO_SOURCE_URL_MISSING/.test(message)) return "VIDEO_SOURCE_MISSING";
        if (/Không tải\/xử lý được ảnh/.test(message)) return "IMAGE_DOWNLOAD_OR_PROCESS_FAILED";
        if (/Reader không tìm thấy ảnh hoặc video/.test(message)) return "MEDIA_SOURCE_MISSING";
        if (issue.stage === "database") return "MEDIA_DATABASE_FAILED";
        if (issue.stage === "video") return "VIDEO_FAILED_UNKNOWN_STEP";
        if (issue.stage === "image") return "IMAGE_FAILED_UNKNOWN_STEP";
        if (issue.stage === "media") return "MEDIA_COUNT_MISMATCH";
        return "IMPORT_ERROR_OTHER";
      }),
  ));
  if (response.code === "TEST_NO_VALID_MEDIA") errorCodes.push("TEST_NO_VALID_MEDIA");
  if (response.code === "NO_USABLE_MEDIA") errorCodes.push("NO_USABLE_MEDIA");
  return {
    sourceMessageId: String(input.sourceMessageId || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128),
    detected: { images: input.detectedImages ?? input.expectedImages, videos: input.expectedVideos },
    albumExpectedImages: input.albumExpectedImages ?? null,
    mediaVerification: ["VERIFIED","MEDIA_UNVERIFIED","MEDIA_INCOMPLETE"].includes(String(response.mediaVerification)) ? response.mediaVerification : "MEDIA_UNVERIFIED",
    downloaded: { images: input.downloadedImages, videos: count(progress.videosDownloaded) },
    submitted: { images: input.submittedImages, videos: input.submittedVideos },
    uploaded: { images: count(progress.imagesUploaded), videos: count(progress.videosUploaded) },
    saved: { images: count(response.imageCount), videos: count(response.videoCount) },
    pending: response.noChanges === true ? "not-created-unchanged" : response.testingOnly ? "not-created-test" : response.testPendingAction === "updated" ? "updated-test" : response.pendingVersionId ? "created" : response.duplicate ? "existing-source" : "unconfirmed",
    mode: response.testingOnly ? "local-test" : response.testImportToPending || response.officialTrial ? "test-pending" : "official",
    partial: Boolean(response.partial || response.hasImportErrors),
    errorCodes,
  };
}
