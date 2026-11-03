"use client";
import { useCallback, useEffect, useState } from "react";

type Control = {
  open_request_id?: string | null; open_applied_request_id?: string | null; open_error?: string | null;
  desired_enabled: boolean | null; actual_enabled: boolean | null;
  request_id: string | null; applied_request_id: string | null; heartbeat_at: string | null; last_error: string | null;
};
export default function ZaloReaderControls() {
  const [control, setControl] = useState<Control | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/zalo-reader/control", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Chưa kết nối điều khiển Reader.");
      setControl(body.control); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không tải được điều khiển Reader."); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [refresh]);
  async function send(enabled: boolean | "open_zalo") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/zalo-reader/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(enabled === "open_zalo" ? { action: "open_zalo" } : { enabled }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Không gửi được lệnh.");
      setControl(body.control);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không gửi được lệnh."); }
    finally { setBusy(false); }
  }
  const opening = !!control?.open_request_id && control.open_request_id !== control.open_applied_request_id;
  const pending = !!control?.request_id && control.request_id !== control.applied_request_id;
  const online = !!control?.heartbeat_at && Date.now() - Date.parse(control.heartbeat_at) < 180000;
  const buttonStyle = { padding: "7px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer" };
  return <div style={{ margin: "10px 0", padding: 10, background: "#f8fafc", borderRadius: 8 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <button type="button" style={{ ...buttonStyle, background: "#166534", color: "white" }} disabled={busy || !control || !!error || (pending && control.desired_enabled === true)} onClick={() => void send(true)}>Start</button>
      <button type="button" style={{ ...buttonStyle, background: "#b91c1c", color: "white" }} disabled={busy || !control || !!error || (online && !pending && control.actual_enabled === false)} onClick={() => void send(false)}>Stop</button>
      <button type="button" style={{ ...buttonStyle, background: "#fff", color: "#075985" }} disabled={busy || !control || !!error || (opening && !control.open_error)} onClick={() => void send("open_zalo")}>Mở Zalo</button>
      <span role="status">{busy ? "Đang gửi lệnh…" : pending
        ? `Đã gửi ${control?.desired_enabled ? "Start" : "Stop"} · chờ máy Reader xác nhận`
        : online ? (control?.actual_enabled ? "Lịch đọc đã bật" : "Lịch đọc đã tắt") : "Máy Reader chưa kết nối hoặc đang nghỉ"}</span>
    </div>
    <p style={{ fontSize: 12, margin: "8px 0 0" }}>Start bật lịch và yêu cầu chạy Reader ngay, không cần mở terminal. Nếu Reader đang chạy thì không mở thêm lượt trùng. Stop tắt các lượt tiếp theo; lượt đang đọc sẽ kết thúc an toàn. Máy Reader thường nhận lệnh trong khoảng 1 phút khi đang hoạt động.</p>
    <p style={{ fontSize: 12, margin: "8px 0 0" }}>Mở Zalo hiển thị đúng cửa sổ trên máy Reader để đăng nhập hoặc đồng bộ tin nhắn. Nếu cửa sổ đã mở, Reader dùng lại phiên đó. Nút này không bật lịch đọc.</p>
    {opening && <p role="status" style={{ fontSize: 12 }}>{control?.open_error ? "Chưa mở được Zalo. Kiểm tra máy Reader, cập nhật tác vụ cửa sổ Zalo rồi thử lại." : "Đã gửi yêu cầu mở Zalo · chờ máy Reader xác nhận"}</p>}
    {!opening && control?.open_applied_request_id && <p role="status" style={{ fontSize: 12 }}>Máy Reader đã xác nhận mở cửa sổ Zalo. Nếu bạn đã đóng cửa sổ, bấm Mở Zalo để mở lại.</p>}
    {!online && control && <p style={{ fontSize: 12 }}>Chưa có xác nhận gần đây từ máy Reader. Lệnh được giữ chờ đến khi máy kết nối lại.</p>}
    {control?.last_error && pending && <p role="alert">Máy Reader chưa áp dụng được lệnh. Kiểm tra lịch Windows và cấu hình Reader.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
