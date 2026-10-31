export function importLifecycle(row: any): "TEST" | "PRODUCTION_PENDING" | "PUBLISHED" {
  const batch = Array.isArray(row?.batch) ? row.batch[0] : row?.batch;
  const flag = (value: unknown) => value === true || value === "true";
  if (flag(row?.room_payload?.is_test_import) || flag(batch?.parser_result?.test_import) || flag(batch?.parser_result?.official_source?.trial)) return "TEST";
  if (row?.status === "Đã duyệt" && row?.approved_room_id) return "PUBLISHED";
  return "PRODUCTION_PENDING";
}
export function importLifecycleLabel(row: any) {
  const state=importLifecycle(row);
  return state === "TEST" ? "BẢN NHÁP TEST · Không publish" : state === "PUBLISHED" ? "ĐÃ ĐĂNG" : "BẢN NHÁP CHÍNH THỨC · Duyệt thủ công";
}
export function importMediaStatus(row: any) {
  const diagnostics=row?.room_payload?.import_diagnostics || row?.batch?.parser_result?.import_diagnostics || {};
  const images=(row?.images || []).filter((image:any)=>image.selected!==false).length;
  const expected=diagnostics.album_expected_images;
  if(typeof expected==="number" && expected>images) return "MEDIA_INCOMPLETE";
  if(diagnostics.media_verification==="MEDIA_INCOMPLETE") return "MEDIA_INCOMPLETE";
  if(diagnostics.media_verification==="VERIFIED" && typeof expected==="number" && expected===images) return null;
  return images>0 ? "MEDIA_UNVERIFIED" : null;
}
