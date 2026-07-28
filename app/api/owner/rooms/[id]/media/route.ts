import {
  apiError,
  apiSuccess,
  mapDatabaseError,
  mapUnknownError,
} from "@/lib/api/response";
import {
  parseOptionalString,
  parseUuid,
  readJsonObject,
  RequestValidationError,
} from "@/lib/api/validation";
import { authorizeRoomMutation } from "@/lib/rooms/authorizeRoomMutation";

type MediaRow = {
  room_id: string;
  type: "image" | "video";
  provider: "r2";
  url: string;
  path: string;
  is_cover: boolean;
  sort_order: number;
};

function parseMediaOrder(body: Record<string, unknown>) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new RequestValidationError("Danh sách thứ tự media không được để trống", {
      field: "items",
    });
  }

  return body.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError(`Media thứ ${index + 1} không hợp lệ`, {
        field: `items.${index}`,
      });
    }

    const source = item as Record<string, unknown>;
    const id = parseUuid(String(source.id ?? ""), `items.${index}.id`);
    const sortOrder = Number(source.sort_order);

    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      throw new RequestValidationError(
        `Thứ tự media thứ ${index + 1} không hợp lệ`,
        { field: `items.${index}.sort_order` },
      );
    }

    return { id, sort_order: sortOrder };
  });
}

function parseMediaRows(body: Record<string, unknown>, roomId: string): MediaRow[] {
  const items = body.items;

  if (!Array.isArray(items) || items.length === 0) {
    throw new RequestValidationError("Danh sách media không được để trống", {
      field: "items",
    });
  }

  if (items.length > 30) {
    throw new RequestValidationError("Mỗi lần chỉ được ghi tối đa 30 media", {
      field: "items",
      maxItems: 30,
    });
  }

  const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const expectedPrefix = `rooms/${roomId}/`;
  let coverAssigned = false;

  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RequestValidationError(`Media thứ ${index + 1} không hợp lệ`, {
        field: `items.${index}`,
      });
    }

    const source = item as Record<string, unknown>;
    const type = String(source.type ?? "").trim();
    const provider = String(source.provider ?? "r2").trim();
    const path = parseOptionalString(source.path, "Đường dẫn media", 2000);
    const url = parseOptionalString(source.url, "URL media", 3000);

    if (type !== "image" && type !== "video") {
      throw new RequestValidationError(`Loại media thứ ${index + 1} không hợp lệ`, {
        field: `items.${index}.type`,
      });
    }

    if (provider !== "r2") {
      throw new RequestValidationError("Owner Portal chỉ ghi nhận media từ R2", {
        field: `items.${index}.provider`,
      });
    }

    if (!path || !path.startsWith(expectedPrefix)) {
      throw new RequestValidationError("Đường dẫn media không thuộc phòng này", {
        field: `items.${index}.path`,
      });
    }

    if (!url || (publicBaseUrl && !url.startsWith(`${publicBaseUrl}/`))) {
      throw new RequestValidationError("URL media không thuộc R2 đã cấu hình", {
        field: `items.${index}.url`,
      });
    }

    const requestedCover = source.is_cover === true && type === "image";
    const isCover = requestedCover && !coverAssigned;
    if (isCover) coverAssigned = true;

    const requestedSortOrder = Number(source.sort_order ?? index);
    const sortOrder = Number.isSafeInteger(requestedSortOrder)
      ? Math.max(0, requestedSortOrder)
      : index;

    return {
      room_id: roomId,
      type,
      provider: "r2",
      url,
      path,
      is_cover: isCover,
      sort_order: sortOrder,
    };
  });
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const roomId = parseUuid(rawId, "room_id");
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Bạn không có quyền cập nhật media của phòng này",
        authorization.status,
      );
    }

    const body = await readJsonObject(request);
    const rows = parseMediaRows(body, roomId);

    const { data, error } = await authorization.supabase
      .from("room_media")
      .insert(rows)
      .select("id, room_id, type, provider, url, path, is_cover, sort_order, created_at");

    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? [], 201);
  } catch (error) {
    return mapUnknownError(error);
  }
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id: rawId } = await params;
    const roomId = parseUuid(rawId, "room_id");
    const authorization = await authorizeRoomMutation(roomId);

    if (!authorization.allowed) {
      return apiError(
        authorization.error,
        authorization.error === "UNAUTHENTICATED"
          ? "Bạn cần đăng nhập để thực hiện thao tác này"
          : "Bạn không có quyền sắp xếp media của phòng này",
        authorization.status,
      );
    }

    const body = await readJsonObject(request);
    const updates = parseMediaOrder(body);
    const ids = updates.map((item) => item.id);
    const coverId =
      body.cover_id === null || body.cover_id === undefined
        ? null
        : parseUuid(String(body.cover_id), "cover_id");

    const { data: existing, error: existingError } =
      await authorization.supabase
        .from("room_media")
        .select("id")
        .eq("room_id", roomId)
        .in("id", ids);

    if (existingError) return mapDatabaseError(existingError);
    if ((existing ?? []).length !== ids.length) {
      return apiError(
        "INVALID_INPUT",
        "Danh sách media chứa ảnh không thuộc phòng này",
        400,
      );
    }

    for (const update of updates) {
      const { error } = await authorization.supabase
        .from("room_media")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id)
        .eq("room_id", roomId);

      if (error) return mapDatabaseError(error);
    }

    if (coverId) {
      const { error: clearCoverError } = await authorization.supabase
        .from("room_media")
        .update({ is_cover: false })
        .eq("room_id", roomId)
        .eq("type", "image");

      if (clearCoverError) return mapDatabaseError(clearCoverError);

      const { error: coverError } = await authorization.supabase
        .from("room_media")
        .update({ is_cover: true })
        .eq("id", coverId)
        .eq("room_id", roomId)
        .eq("type", "image");

      if (coverError) return mapDatabaseError(coverError);
    }

    const { data, error } = await authorization.supabase
      .from("room_media")
      .select("id, room_id, type, provider, url, path, is_cover, sort_order, created_at")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? []);
  } catch (error) {
    return mapUnknownError(error);
  }
}
