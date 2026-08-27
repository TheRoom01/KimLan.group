import { readApiResponse } from "@/lib/api/client";
import { mapWithConcurrency, resolveUploadContentType } from "@/lib/media/uploadFileType";

export const MAX_ROOM_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_ROOM_MEDIA_FILES = 20;

export type RoomMediaUploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

type PresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
  type: "image" | "video";
};

export function validateRoomMediaFiles(files: File[]) {
  if (files.length > MAX_ROOM_MEDIA_FILES) {
    throw new Error(`Chỉ được chọn tối đa ${MAX_ROOM_MEDIA_FILES} file`);
  }

  for (const file of files) {
    const contentType = resolveUploadContentType(file);
    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/");

    if (!isImage && !isVideo) {
      throw new Error(`File ${file.name} không phải ảnh hoặc video`);
    }

    if (isImage && file.size > MAX_ROOM_IMAGE_BYTES) {
      throw new Error(`Ảnh ${file.name} vượt giới hạn 15 MB`);
    }
  }
}

export async function uploadRoomMediaFiles({
  roomId,
  files,
  startSortOrder = 0,
  coverAlreadyExists = false,
  onProgress,
}: {
  roomId: string;
  files: File[];
  startSortOrder?: number;
  coverAlreadyExists?: boolean;
  onProgress?: (progress: RoomMediaUploadProgress) => void;
}) {
  validateRoomMediaFiles(files);

  const prepared = await mapWithConcurrency(
    files,
    4,
    async (file, index) => ({
      file,
      index,
      presign: await createPresignedUpload(roomId, file),
    }),
  );

  let completed = 0;
  await mapWithConcurrency(
    prepared,
    3,
    async ({ file, presign }) => {
      await uploadToR2(file, presign);
      completed += 1;
      onProgress?.({
        current: completed,
        total: files.length,
        fileName: file.name,
      });
    },
  );

  let coverAssigned = coverAlreadyExists;
  const rows = prepared.map(({ presign, index }) => {
    const isCover = presign.type === "image" && !coverAssigned;
    if (isCover) coverAssigned = true;
    return {
      type: presign.type,
      provider: "r2" as const,
      url: presign.publicUrl,
      path: presign.key,
      is_cover: isCover,
      sort_order: startSortOrder + index,
    };
  });

  const mediaResponse = await fetch(`/api/owner/rooms/${roomId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: rows }),
  });
  await readApiResponse<unknown>(mediaResponse);

  return rows.map(({ type, url, path }) => ({ type, url, path }));
}

async function createPresignedUpload(
  roomId: string,
  file: File,
): Promise<PresignResult> {
  const response = await fetch("/api/upload/r2-presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room_id: roomId,
      file_name: file.name,
      content_type: resolveUploadContentType(file),
      size: file.size,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | PresignResult
    | { error?: string }
    | null;

  if (!response.ok || !payload || !("uploadUrl" in payload)) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : `Không thể tạo URL upload cho ${file.name}`,
    );
  }

  return payload;
}

async function uploadToR2(file: File, presign: PresignResult) {
  const response = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.requiredHeaders ?? {
      "Content-Type": resolveUploadContentType(file),
    },
    body: file,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Upload ${file.name} lên R2 thất bại (${response.status})${
        detail ? `: ${detail.slice(0, 200)}` : ""
      }`,
    );
  }
}
