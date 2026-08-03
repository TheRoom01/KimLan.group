const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

export function resolveUploadContentType(file: Pick<File, "name" | "type">) {
  const reported = file.type.trim().toLowerCase();
  if (reported.startsWith("image/") || reported.startsWith("video/")) {
    return reported;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "";
}

export function isUploadImage(file: Pick<File, "name" | "type">) {
  return resolveUploadContentType(file).startsWith("image/");
}

export function isUploadVideo(file: Pick<File, "name" | "type">) {
  return resolveUploadContentType(file).startsWith("video/");
}

export function isHeicImage(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const contentType = file.type.trim().toLowerCase();
  return extension === "heic" || extension === "heif" || contentType === "image/heic" || contentType === "image/heif";
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isHeicImage(file)) return file;

  try {
    const { default: convertHeic } = await import("heic2any");
    const converted = await convertHeic({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = file.name.replace(/\.(heic|heif)$/i, "") || "anh-dien-thoai";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    throw new Error(`Không thể chuyển ảnh ${file.name} từ HEIC sang JPEG. Hãy thử chọn lại ảnh.`);
  }
}

export async function prepareImagesForUpload(files: readonly File[]) {
  return mapWithConcurrency(files, 2, prepareImageForUpload);
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}
