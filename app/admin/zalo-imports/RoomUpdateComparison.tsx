"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { comparisonFields, compareImageAlbums, getImportReview, importReviewInstructions } from "@/lib/zalo-import/room-comparison";
import { importMediaStatus } from "@/lib/zalo-import/lifecycle";

const labels: Record<string, string> = {
  room_type: "Loại phòng", ward: "Phường", price: "Giá thuê", status: "Trạng thái", available_from: "Ngày trống",
  description: "Mô tả", chinh_sach: "Chính sách", electric_fee_value: "Tiền điện", electric_fee_unit: "Đơn vị điện",
  water_fee_value: "Tiền nước", water_fee_unit: "Đơn vị nước", service_fee_value: "Phí dịch vụ", service_fee_unit: "Đơn vị dịch vụ",
  parking_fee_value: "Phí xe", parking_fee_unit: "Đơn vị phí xe", other_fee_value: "Phí khác", other_fee_note: "Ghi chú phí",
  has_elevator: "Thang máy", has_stairs: "Thang bộ", shared_washer: "Máy giặt chung", private_washer: "Máy giặt riêng",
  shared_dryer: "Máy sấy chung", private_dryer: "Máy sấy riêng", has_parking: "Chỗ để xe", has_basement: "Hầm xe",
  fingerprint_lock: "Khóa vân tay", free_time: "Giờ tự do", allow_pet: "Cho nuôi thú cưng", allow_cat: "Cho nuôi mèo",
  allow_dog: "Cho nuôi chó", no_pet: "Cấm thú cưng", short_term: "Ngắn hạn", long_term: "Dài hạn",
  other_amenities: "Tiện ích khác", detail_json: "Thông tin bổ sung", has_balcony: "Ban công", has_window: "Cửa sổ",
};
function valueText(value: any, field: string): string {
  if (value == null || value === "") return "Chưa có";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (field === "available_from" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).split("-").reverse().join("/");
  if (field === "price" || field.endsWith("_value")) return `${Number(value).toLocaleString("vi-VN")} đ`;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export default function RoomUpdateComparison({ row, selected, onSelect }: {
  row: { room_payload?: any; detail_payload?: any; images?: any[]; videos?: any[]; matched_room_id?: string | null };
  selected: string[]; onSelect: (fields: string[]) => void;
}) {
  const room = row.room_payload || {};
  const review = getImportReview(room);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const [showEmptyFields, setShowEmptyFields] = useState(false);
  useEffect(() => {
    if (!viewer) return;
    const key = (event: KeyboardEvent) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === "Escape") setViewer(null);
      else setViewer(current => current ? { ...current, index: (current.index + (event.key === "ArrowRight" ? 1 : -1) + current.urls.length) % current.urls.length } : null);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [viewer]);
  if (!review) return row.matched_room_id ? <p role="alert">Bản nháp cũ chưa có snapshot. Hãy Phân tích lại để so sánh và duyệt từng trường.</p> : null;
  if (review.type !== "UPDATE" || !review.snapshot) return <div role="status"><p>{review.type === "NEEDS_REVIEW" ? `CẦN ĐỐI CHIẾU PHÒNG: ${importReviewInstructions(room)}` : "TẠO PHÒNG MỚI: Chưa tìm thấy phòng trùng khóa đầy đủ."}</p>
    {review.type === "NEEDS_REVIEW" && review.candidate_ids.map(id => <a key={id} href={`/rooms/${id}`} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12 }}>Kiểm tra phòng {id.slice(0, 8)}</a>)}
  </div>;
  const fields = comparisonFields(room, row.detail_payload || {});
  const visibleFields = fields.filter(field => showEmptyFields || field.state !== "missing" || (field.oldValue !== null && field.oldValue !== ""));
  const oldImages = review.snapshot.media.filter(media => media.type === "image");
  const newImages = (row.images || []).filter(image => image.selected !== false);
  const album = compareImageAlbums(oldImages, newImages, review.image_hashes);
  const toggle = (key: string) => onSelect(selected.includes(key) ? selected.filter(field => field !== key) : [...selected, key]);
  const oldUrls = oldImages.map(image => image.url || image.path).filter(Boolean);
  const newUrls = newImages.map(image => image.temp_image_url || image.url).filter(Boolean);
  const green = { color: "#15803d", background: "#f0fdf4", fontWeight: 700 };
  return <section style={{ border: "1px solid #86efac", borderRadius: 12, padding: 14, marginBottom: 16, background: "#fff", color: "#172033" }}>
    <h3 style={{ margin: "0 0 8px" }}>CẬP NHẬT PHÒNG · {room.room_code}</h3>
    <p>{room.house_number} {room.address}, {room.district} · <a href={`/rooms/${row.matched_room_id}`} target="_blank" rel="noopener noreferrer">Xem phòng hiện tại</a></p>
    <p>Chọn các trường chấp thuận cập nhật. Trường không chọn được giữ nguyên.</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", overflowWrap: "anywhere" }}>
      <thead><tr><th style={{ textAlign: "left", width: "40%" }}>Áp dụng / Trường</th><th style={{ textAlign: "left", width: "30%" }}>Phòng cũ</th><th style={{ textAlign: "left", width: "30%" }}>Zalo mới</th></tr></thead>
      <tbody>{visibleFields.map(field => <tr key={field.key}>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}><label><input type="checkbox" aria-label={`Áp dụng ${labels[field.field] || field.field}`} checked={selected.includes(field.key)}
          disabled={field.state === "missing" || field.state === "uncertain" || room.is_test_import === true} onChange={() => toggle(field.key)} /> {labels[field.field] || field.field}</label></td>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>{valueText(field.oldValue, field.field)}</td>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", whiteSpace: "pre-wrap", ...(field.state === "changed" ? green : {}) }}>
          {field.state === "missing" ? "Không có thông tin mới" : field.state === "uncertain" ? "Chưa chắc chắn — cần xác minh" : field.clear ? "Nguồn xác nhận xóa / không còn áp dụng" : valueText(field.newValue, field.field)}
        </td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" onClick={() => setShowEmptyFields(!showEmptyFields)} style={{ marginTop: 10, padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#334155" }}>
      {showEmptyFields ? "Thu gọn trường trống" : `Hiện tất cả ${fields.length} trường`}
    </button>
    {room.available_from_text && !room.available_from && <p role="alert" style={{ color: "#92400e" }}>Ngày trống trong nguồn: {room.available_from_text}. Thiếu năm; hãy xác minh ngày đầy đủ trước khi áp dụng.</p>}
    {importMediaStatus(row) && newImages.length>0 && <p role="alert" style={{color:"#92400e",background:"#fffbeb",padding:10}}>
      {importMediaStatus(row)}: Chưa xác minh đủ ảnh. Album cũ được giữ nguyên; chỉ thay thế khi bạn chọn “Áp dụng album ảnh mới” và xác nhận duyệt cập nhật.
    </p>}
    <p style={album === "changed" ? green : {}}><label><input type="checkbox" aria-label="Áp dụng album ảnh mới" checked={selected.includes("images")} disabled={!newImages.length || room.is_test_import === true} onChange={() => toggle("images")} /> Áp dụng album ảnh mới</label>
      {" · "}{album === "changed" ? "ẢNH ĐÃ THAY ĐỔI" : album === "same" ? "Nội dung ảnh giống nhau (SHA-256)" : album === "missing" ? "Không có thông tin ảnh mới" : "Chưa xác minh nội dung ảnh — hãy xem hai album"}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
      {[["Album cũ", oldUrls], ["Album Zalo mới", newUrls]].map(([title, urls]) => <div key={title as string}><b>{title as string} ({(urls as string[]).length} ảnh)</b>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>{(urls as string[]).map((url, index) => <button type="button" key={`${url}-${index}`} aria-label={`${title} ảnh ${index + 1}, xem toàn màn hình`} onClick={() => setViewer({ urls: urls as string[], index })} style={{ padding: 0, border: "1px solid #cbd5e1", background: "transparent" }}>
          <img src={url} alt={`${title} ${index + 1}`} style={{ width: 78, height: 78, objectFit: "cover" }} /></button>)}</div>
      </div>)}
    </div>
    <p><label><input type="checkbox" aria-label="Áp dụng video mới" checked={selected.includes("videos")} disabled={!row.videos?.some(video => video.selected !== false) || room.is_test_import === true} onChange={() => toggle("videos")} /> Áp dụng video mới</label> · {row.videos?.length || 0} video mới / {review.snapshot.media.filter(media => media.type === "video").length} video cũ</p>
    {viewer && createPortal(<div role="dialog" aria-modal="true" aria-label="Xem album toàn màn hình" onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,.95)", display: "grid", placeItems: "center" }}>
      <button type="button" aria-label="Đóng ảnh toàn màn hình" onClick={() => setViewer(null)} style={{ position: "absolute", top: 20, right: 20, padding: 12 }}>Đóng ×</button>
      <img src={viewer.urls[viewer.index]} alt={`Ảnh ${viewer.index + 1}/${viewer.urls.length}`} onClick={event => event.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain" }} />
      <div style={{ position: "absolute", bottom: 16, color: "white", display: "flex", alignItems: "center", gap: 18 }} onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Ảnh trước" onClick={() => setViewer({ ...viewer, index: (viewer.index - 1 + viewer.urls.length) % viewer.urls.length })}>←</button>
        {viewer.index + 1} / {viewer.urls.length}
        <button type="button" aria-label="Ảnh sau" onClick={() => setViewer({ ...viewer, index: (viewer.index + 1) % viewer.urls.length })}>→</button>
      </div>
    </div>, document.body)}
  </section>;
}
