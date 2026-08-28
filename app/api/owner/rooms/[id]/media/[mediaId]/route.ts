import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";
import { invalidatePublicRoomCache } from "@/lib/rooms/cacheInvalidation";

export const runtime = "nodejs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "rooms-media";

function keyFromMediaPath(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("rooms/")) return raw;
  if (raw.startsWith("/rooms/")) return raw.replace(/^\/+/, "");

  try {
    const parsed = new URL(raw);
    const key = parsed.pathname.replace(/^\/+/, "");
    return key.startsWith("rooms/") ? key : null;
  } catch {
    return null;
  }
}

function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; mediaId: string }>;
  },
) {
  try {
    const { id: rawRoomId, mediaId: rawMediaId } = await params;
    const roomId = parseUuid(rawRoomId, "room_id");
    const mediaId = parseUuid(rawMediaId, "media_id");
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Bạn không có quyền xóa media của phòng này",
        authorization.status,
      );
    }

    const { data: media, error: mediaError } = await authorization.supabase
      .from("room_media")
      .select("id, room_id, type, provider, url, path, is_cover, sort_order")
      .eq("id", mediaId)
      .eq("room_id", roomId)
      .maybeSingle();

    if (mediaError) return mapDatabaseError(mediaError);
    if (!media) return apiError("NOT_FOUND", "Không tìm thấy media", 404);

    const { error: deleteError } = await authorization.supabase
      .from("room_media")
      .delete()
      .eq("id", mediaId)
      .eq("room_id", roomId);

    if (deleteError) return mapDatabaseError(deleteError);

    let replacementCoverId: string | null = null;

    if (media.is_cover === true && media.type === "image") {
      const { data: replacement, error: replacementError } =
        await authorization.supabase
          .from("room_media")
          .select("id")
          .eq("room_id", roomId)
          .eq("type", "image")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

      if (replacementError) return mapDatabaseError(replacementError);

      if (replacement?.id) {
        const { error: coverError } = await authorization.supabase
          .from("room_media")
          .update({ is_cover: true })
          .eq("id", replacement.id)
          .eq("room_id", roomId);

        if (coverError) return mapDatabaseError(coverError);
        replacementCoverId = replacement.id;
      }
    }

    const key = keyFromMediaPath(media.path || media.url);
    const expectedPrefix = `rooms/${roomId}/`;
    let objectDeleted = false;
    let objectDeleteWarning: string | null = null;

    let sharedReferenceCount = 0;
    if (key) {
      const { count: pathCount, error: referenceError } = await authorization.supabase
        .from("room_media")
        .select("id", { count: "exact", head: true })
        .eq("path", key);
      if (referenceError) objectDeleteWarning = "Không thể kiểm tra media đang được dùng chung";
      const { count: urlCount, error: urlReferenceError } = await authorization.supabase
        .from("room_media")
        .select("id", { count: "exact", head: true })
        .eq("url", media.url);
      if (urlReferenceError) objectDeleteWarning = "Không thể kiểm tra media đang được dùng chung";
      sharedReferenceCount = Math.max(pathCount ?? 0, urlCount ?? 0);
    }

    if (media.provider === "r2" && key?.startsWith(expectedPrefix) && sharedReferenceCount === 0 && !objectDeleteWarning) {
      if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        objectDeleteWarning = "R2 credentials are not configured";
      } else {
        try {
          await createR2Client().send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: key,
            }),
          );
          objectDeleted = true;
        } catch (error) {
          console.error("Owner room media R2 delete failed:", error);
          objectDeleteWarning = "Database row deleted but R2 object cleanup failed";
        }
      }
    }

    invalidatePublicRoomCache(roomId);
    return apiSuccess({
      deleted_media_id: mediaId,
      replacement_cover_id: replacementCoverId,
      object_deleted: objectDeleted,
      warning: objectDeleteWarning,
      shared_reference_count: sharedReferenceCount,
    });
  } catch (error) {
    return mapUnknownError(error);
  }
}
