"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { comparisonFields, MERGE_UPDATE_FIELDS, mediaSelectionKey, mergeUpdateText, getImportReview, importReviewInstructions } from "@/lib/zalo-import/room-comparison";


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
  no_live_in_landlord: "Không chung chủ", accepts_foreign_tenants: "Nhận khách nước ngoài",
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
  const newImages = (row.images || []).filter(image => image.selected !== false);
  const chooseField = (key: string, source: "old" | "new") => {
    const old = selected.includes(`old:${key}`) || selected.includes(`both:${key}`) || !selected.includes(key);
    const fresh = selected.includes(key) || selected.includes(`both:${key}`);
    let nextOld = source === "old" ? !old : old;
    let nextNew = source === "new" ? !fresh : fresh;
    if (!MERGE_UPDATE_FIELDS.includes(key)) {
      nextOld = source === "old" ? !old : !nextNew;
      nextNew = !nextOld;
    }
    // No selection keeps the current value.
    const next = selected.filter(item => ![key, `old:${key}`, `both:${key}`].includes(item));
    onSelect([...next, ...(nextOld && nextNew ? [`both:${key}`] : nextNew ? [key] : [`old:${key}`])]);
  };
  const groups = (["image", "video"] as const).map(type => ({
    type,
    old: review.snapshot!.media.filter(item => item.type === type),
    fresh: (type === "image" ? newImages : row.videos || []).filter(item => item.selected !== false),
  }));
  const urlFor = (item: any) => item.temp_image_url || item.temp_video_url || item.url || item.path;
  const effectiveMedia = (type: "image" | "video") => {
    const explicit = selected.filter(key => key.startsWith(`media:${type}:`));
    if (explicit.length) return explicit;
    const group = groups.find(group => group.type === type)!;
    const fresh = selected.includes(type === "image" ? "images" : "videos");
    return (fresh ? group.fresh : group.old).map(item => mediaSelectionKey(type, fresh ? "new" : "old", String(item.id)));
  };
  const selectMedia = (type: "image" | "video", keys: string[], checked: boolean) => {
    const current = effectiveMedia(type);
    const next = checked ? [...new Set([...current, ...keys])] : current.filter(key => !keys.includes(key));
    // An empty explicit selection must not silently restore the old album.
    if (!next.length) return;
    onSelect([...selected.filter(key => !key.startsWith(`media:${type}:`) && key !== (type === "image" ? "images" : "videos")), ...next]);
  };
  const green = { color: "#15803d", background: "#f0fdf4", fontWeight: 700 };
  return <section style={{ border: "1px solid #86efac", borderRadius: 12, padding: 14, marginBottom: 16, background: "#fff", color: "#172033" }}>
    <h3 style={{ margin: "0 0 8px" }}>CẬP NHẬT PHÒNG · {room.room_code}</h3>
    <p>{room.house_number} {room.address}, {room.district} · <a href={`/rooms/${row.matched_room_id}`} target="_blank" rel="noopener noreferrer">Xem phòng hiện tại</a></p>
    <p>Chọn dữ liệu cũ hoặc mới ở từng dòng. Mô tả, chính sách và ghi chú có thể chọn cả hai để ghép. Các trường khác chỉ chọn một bên.</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", overflowWrap: "anywhere" }}>
      <thead><tr><th style={{ textAlign: "left", width: "30%" }}>Trường</th><th style={{ textAlign: "left", width: "35%" }}>Phòng cũ</th><th style={{ textAlign: "left", width: "35%" }}>Zalo mới</th></tr></thead>
      <tbody>{visibleFields.map(field => <tr key={field.key}>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{labels[field.field] || field.field}</td>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", whiteSpace: "pre-wrap", verticalAlign: "top" }}><label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" aria-label={`Giữ dữ liệu cũ: ${labels[field.field] || field.field}`} checked={!selected.includes(field.key) || selected.includes(`both:${field.key}`)} disabled={room.is_test_import === true} onChange={() => chooseField(field.key, "old")} />
          <span style={{ minWidth: 0 }}>{valueText(field.oldValue, field.field)}</span></label></td>
        <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", whiteSpace: "pre-wrap", verticalAlign: "top", ...(field.state === "changed" ? green : {}) }}><label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" aria-label={`Lấy Zalo mới: ${labels[field.field] || field.field}`} checked={selected.includes(field.key) || selected.includes(`both:${field.key}`)} disabled={field.state === "missing" || field.state === "uncertain" || room.is_test_import === true} onChange={() => chooseField(field.key, "new")} />
          <span style={{ minWidth: 0 }}>{field.state === "missing" ? "Không có thông tin mới" : field.state === "uncertain" ? "Chưa chắc chắn — cần xác minh" : field.clear ? "Nguồn xác nhận xóa / không còn áp dụng" : valueText(field.newValue, field.field)}
          {selected.includes(`both:${field.key}`) && <small style={{ display: "block", marginTop: 8, color: "#334155" }}>Sau khi ghép: {mergeUpdateText(field.oldValue, field.newValue)}</small>}</span></label>
        </td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" onClick={() => setShowEmptyFields(!showEmptyFields)} style={{ marginTop: 10, padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#f8fafc", color: "#334155" }}>
      {showEmptyFields ? "Thu gọn trường trống" : `Hiện tất cả ${fields.length} trường`}
    </button>
    {room.available_from_text && !room.available_from && <p role="alert" style={{ color: "#92400e" }}>Ngày trống trong nguồn: {room.available_from_text}. Thiếu năm; hãy xác minh ngày đầy đủ trước khi áp dụng.</p>}
    <p>Ảnh/video: bấm từng mục để chọn hoặc bỏ chọn, có thể lấy xen kẽ từ hai nguồn. Thứ tự chọn là thứ tự trong bản cập nhật. Giữ ít nhất một mục cho mỗi nhóm đang có media.</p>
    {groups.map(group => {
      const chosen = effectiveMedia(group.type);
      const title = group.type === "image" ? "Ảnh" : "Video";
      const all = [...group.old.map(item => ({ item, key: mediaSelectionKey(group.type, "old", String(item.id)) })), ...group.fresh.map(item => ({ item, key: mediaSelectionKey(group.type, "new", String(item.id)) }))];
      return <div key={group.type} style={{ marginTop: 16 }}><h4>{title}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
          {(["old", "new"] as const).map(source => {
            const items = source === "old" ? group.old : group.fresh;
            const keys = items.map(item => mediaSelectionKey(group.type, source, String(item.id)));
            const allChecked = keys.length > 0 && keys.every(key => chosen.includes(key));
            return <div key={source}><label><input type="checkbox" checked={allChecked} disabled={!keys.length || room.is_test_import === true} onChange={() => selectMedia(group.type, keys, !allChecked)} /> {source === "old" ? "Phòng cũ" : "Zalo mới"} · {items.length} {title.toLowerCase()}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{items.map((item, index) => {
                const key = mediaSelectionKey(group.type, source, String(item.id));
                const checked = chosen.includes(key);
                return <div key={key} style={{ width: 110 }}>
                  <button type="button" aria-label={`${checked ? "Bỏ chọn" : "Chọn"} ${title.toLowerCase()} ${source === "old" ? "cũ" : "mới"} ${index + 1}`} aria-pressed={checked} disabled={room.is_test_import === true} onClick={() => selectMedia(group.type, [key], !checked)} style={{ position: "relative", width: 110, padding: 3, border: `3px solid ${checked ? "#16a34a" : "#cbd5e1"}`, borderRadius: 8, background: checked ? "#f0fdf4" : "white" }}>
                    {group.type === "image" ? <img src={urlFor(item)} alt={`${title} ${index + 1}`} style={{ width: 98, height: 86, objectFit: "cover" }} /> : <video src={urlFor(item)} muted preload="metadata" style={{ width: 98, height: 86, objectFit: "cover", pointerEvents: "none" }} />}
                    <span style={{ display: "block", color: "#172033" }}>{checked ? `✓ #${chosen.indexOf(key) + 1}` : "Chưa chọn"}</span>
                  </button>
                  {group.type === "image" ? <button type="button" onClick={() => setViewer({ urls: items.map(urlFor), index })}>Xem ảnh</button> : <video src={urlFor(item)} controls preload="none" aria-label={`Xem video ${index + 1}`} style={{ width: 110, height: 32 }} />}
                </div>;
              })}</div>
            </div>;
          })}
        </div>
        <p><b>Bản cập nhật: {chosen.length} {title.toLowerCase()}</b> · {chosen.map((key, index) => {
          const entry = all.find(entry => entry.key === key);
          return entry ? <button type="button" key={key} disabled={room.is_test_import === true} onClick={() => selectMedia(group.type, [key], false)} style={{ margin: 3 }}>#{index + 1} {key.includes(":old:") ? "Cũ" : "Mới"} ×</button> : null;
        })}</p>
      </div>;
    })}
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
