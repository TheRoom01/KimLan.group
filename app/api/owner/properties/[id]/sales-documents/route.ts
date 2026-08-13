import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseNonNegativeInteger, parseOptionalString, parseRequiredString, parseUuid, readJsonObject } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function context(rawId: string) {
  const propertyId = parseUuid(rawId, "property_id");
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { error: apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401) } as const;
  const { data: canManage, error } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
  if (error) return { error: mapDatabaseError(error) } as const;
  if (canManage !== true) return { error: apiError("FORBIDDEN", "Bạn không có quyền quản lý tài liệu Sale", 403) } as const;
  return { propertyId, supabase, user } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await context(id);
    if ("error" in ctx) return ctx.error;
    const { data, error } = await ctx.supabase.from("property_documents").select("id,title,description,file_name,file_url,file_path,mime_type,size_bytes,sort_order,created_at").eq("property_id", ctx.propertyId).order("sort_order").order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error);
    return apiSuccess(data ?? []);
  } catch (error) { return mapUnknownError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await context(id);
    if ("error" in ctx) return ctx.error;
    const body = await readJsonObject(request);
    const input = {
      property_id: ctx.propertyId,
      title: parseRequiredString(body.title, "Tên tài liệu", 200),
      description: parseOptionalString(body.description, "Mô tả", 2000),
      file_name: parseRequiredString(body.file_name, "Tên file", 255),
      file_url: parseRequiredString(body.file_url, "URL file", 2000),
      file_path: parseOptionalString(body.file_path, "Đường dẫn file", 1000),
      mime_type: parseOptionalString(body.mime_type, "Loại file", 150),
      size_bytes: parseNonNegativeInteger(body.size_bytes, "Kích thước file", { optional: true }),
      sort_order: parseNonNegativeInteger(body.sort_order ?? 0, "Thứ tự") ?? 0,
      created_by: ctx.user.id,
    };
    const { data, error } = await ctx.supabase.from("property_documents").insert(input).select("id,title,description,file_name,file_url,file_path,mime_type,size_bytes,sort_order,created_at").single();
    if (error) return mapDatabaseError(error);
    return apiSuccess(data, 201);
  } catch (error) { return mapUnknownError(error); }
}
