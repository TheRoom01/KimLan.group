import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { apiError, apiSuccess, mapDatabaseError, mapUnknownError } from "@/lib/api/response";
import { parseUuid } from "@/lib/api/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const { id, documentId } = await params;
    const propertyId = parseUuid(id, "property_id");
    const salesDocumentId = parseUuid(documentId, "document_id");
    const supabase = await createSupabaseServerClient();
    if (!await getAuthenticatedUser(supabase)) return apiError("UNAUTHENTICATED", "Bạn cần đăng nhập", 401);
    const { data: canManage, error: permissionError } = await supabase.rpc("can_manage_property", { p_property_id: propertyId });
    if (permissionError) return mapDatabaseError(permissionError);
    if (canManage !== true) return apiError("FORBIDDEN", "Bạn không có quyền xóa tài liệu này", 403);
    const { data: document, error: findError } = await supabase.from("sales_property_documents").select("id,file_path").eq("id", salesDocumentId).eq("property_id", propertyId).maybeSingle();
    if (findError) return mapDatabaseError(findError);
    if (!document) return apiError("NOT_FOUND", "Không tìm thấy tài liệu", 404);
    const { error } = await supabase.from("sales_property_documents").delete().eq("id", salesDocumentId).eq("property_id", propertyId);
    if (error) return mapDatabaseError(error);
    if (document.file_path && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
      const client = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
      await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET || "rooms-media", Key: document.file_path })).catch((deleteError) => console.error("Sales document R2 cleanup failed", deleteError));
    }
    return apiSuccess({ deleted: true });
  } catch (error) { return mapUnknownError(error); }
}
