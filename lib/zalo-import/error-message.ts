export function zaloImportErrorMessage(error: unknown, fallback = "Thao tác import thất bại. Vui lòng thử lại."): string {
  const message = typeof error === "string" ? error : String((error as any)?.message || "");
  if (message.includes("rooms_status_check")) {
    return "Trạng thái phòng không hợp lệ. Hãy mở Chỉnh sửa, chọn Đang trống, Sắp trống hoặc Đã thuê, lưu nháp rồi duyệt lại.";
  }
  if (message === "PROPERTY_MATCH_REQUIRED") {
    return "Có nhiều tòa nhà trùng địa chỉ. Hãy mở Chỉnh sửa, chọn tòa nhà rồi lưu nháp và duyệt lại.";
  }
  return message || fallback;
}
