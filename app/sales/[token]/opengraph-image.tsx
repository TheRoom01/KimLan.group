import { ImageResponse } from "next/og";

import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";
import type { SalesPortalRoom, SalesRoomStatus } from "@/lib/sales-portal/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Trang cập nhật tình trạng phòng dành cho Sale";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS_STYLE: Record<SalesRoomStatus, { background: string; color: string }> = {
  "Trống": { background: "#059669", color: "#ffffff" },
  "Sắp trống": { background: "#fbbf24", color: "#5b351c" },
  "Đang thuê": { background: "#ef233c", color: "#ffffff" },
};

export default async function SalesOpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSalesPortalData(token);

  if (!data) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5ead9", color: "#4a2b18", fontSize: 42, fontWeight: 800 }}>
        Trang thông tin cho Sales
      </div>,
      size,
    );
  }

  const cover = data.property.cover_image
    || data.property.gallery_images[0]
    || data.rooms.flatMap((room) => room.media).find((media) => media.type === "image")?.url;
  const shownRooms = data.rooms.slice(0, 8);
  const remainingRooms = Math.max(0, data.rooms.length - shownRooms.length);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f4e8d7", color: "#3f2414", fontFamily: "Arial, sans-serif" }}>
      <div style={{ height: 64, display: "flex", alignItems: "center", padding: "0 70px", background: "#7a4b27", color: "#ffffff" }}>
        <div style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,.35)", borderRadius: 10, fontSize: 18, fontWeight: 800 }}>TR</div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Trang thông tin cho Sales</div>
          <div style={{ marginTop: 2, fontSize: 11, color: "#f3d8bb" }}>Dữ liệu cập nhật trực tiếp từ chủ nhà</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 70px 28px" }}>
        <div style={{ height: 365, display: "flex", overflow: "hidden", border: "1px solid #dfc7a7", borderRadius: 24, background: "#fffaf2", boxShadow: "0 8px 24px rgba(74,43,24,.10)" }}>
          <div style={{ width: 445, height: "100%", display: "flex", background: "#dfc5a1" }}>
            {cover ? <img src={cover} alt="" width="445" height="365" style={{ width: "445px", height: "365px", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#896542", fontSize: 24, fontWeight: 700 }}>Hình ảnh tòa nhà</div>}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "26px 28px" }}>
            <div style={{ fontSize: 12, letterSpacing: 3, color: "#9a6a42", fontWeight: 700 }}>TÒA NHÀ</div>
            <div style={{ marginTop: 8, fontSize: 29, lineHeight: 1.14, fontWeight: 800, maxHeight: 67, overflow: "hidden" }}>{data.property.full_address || data.property.name}</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", color: "#805536", fontSize: 12 }}>
              <div style={{ marginRight: 8, fontSize: 15 }}>◎</div>
              <div style={{ maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.property.full_address}</div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 14 }}>
              <SummaryCard value={data.summary["Trống"]} label="Trống" background="#e5f8f1" color="#00885d" />
              <SummaryCard value={data.summary["Sắp trống"]} label="Sắp trống" background="#fff9e8" color="#c56500" />
              <SummaryCard value={data.summary["Đang thuê"]} label="Đang thuê" background="#fff0f2" color="#d40023" />
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <InfoRow icon="i" title="Thông tin dành cho Sale" subtitle="Chính sách · Tiện ích · Chi phí · Quy định" />
              <InfoRow icon="▤" title="Tài liệu cho Sale" subtitle={data.documents.length ? `${data.documents.length} tài liệu · Docs · Excel · Trang tính` : "Chưa có tài liệu được chia sẻ"} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, flex: 1, display: "flex", flexDirection: "column", padding: "18px 22px", border: "1px solid #dfc7a7", borderRadius: 22, background: "#fffaf2", boxShadow: "0 6px 16px rgba(74,43,24,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Danh sách phòng</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#8b6041" }}>Tình trạng phòng được cập nhật trực tiếp từ chủ nhà.</div>
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 11, fontWeight: 700 }}>
              <Legend color="#059669" label="Trống" />
              <Legend color="#fbbf24" label="Sắp trống" />
              <Legend color="#ef233c" label="Đang thuê" />
            </div>
          </div>
          <div style={{ marginTop: 13, display: "flex", gap: 9 }}>
            {shownRooms.map((room) => <RoomBadge key={room.id} room={room} />)}
            {remainingRooms > 0 ? <div style={{ height: 49, minWidth: 70, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 13, background: "#ead8bf", color: "#704522", fontSize: 13, fontWeight: 800 }}>+{remainingRooms}</div> : null}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}

function SummaryCard({ value, label, background, color }: { value: number; label: string; background: string; color: string }) {
  return <div style={{ flex: 1, height: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 15, background, color }}><div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div><div style={{ marginTop: 3, fontSize: 10 }}>{label}</div></div>;
}

function InfoRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return <div style={{ height: 50, display: "flex", alignItems: "center", padding: "0 12px", border: "1px solid #dfc29e", borderRadius: 13, background: "#f8ead7" }}><div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#81491f", color: "#ffffff", fontSize: 16, fontWeight: 800 }}>{icon}</div><div style={{ display: "flex", flexDirection: "column", marginLeft: 11 }}><div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div><div style={{ marginTop: 2, fontSize: 9, color: "#865e3f" }}>{subtitle}</div></div><div style={{ marginLeft: "auto", color: "#754521", fontSize: 20 }}>›</div></div>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <div style={{ display: "flex", alignItems: "center" }}><div style={{ width: 8, height: 8, marginRight: 5, borderRadius: 99, background: color }} />{label}</div>;
}

function RoomBadge({ room }: { room: SalesPortalRoom }) {
  const style = STATUS_STYLE[room.status];
  return <div style={{ width: 104, height: 49, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 13px", overflow: "hidden", borderRadius: 13, background: style.background, color: style.color, boxShadow: "0 3px 7px rgba(50,30,15,.12)" }}><div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>P. {room.room_code || "-"}</div><div style={{ marginTop: 3, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room.room_type || "Phòng"}</div></div>;
}
