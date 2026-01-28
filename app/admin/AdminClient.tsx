"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import RoomModal from "./RoomModal";
import type { Room, TabKey } from "@/app/types/room";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

type AdminClientProps = {
  initialRooms: Room[];
  initialTotal: number;
};


export default function AdminClient({ initialRooms, initialTotal }: AdminClientProps) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
const [debug, setDebug] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as any)._t);
    (notify as any)._t = window.setTimeout(() => setToast(null), 2500);
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const cursorMapRef = useRef<
  Map<number, {
    cursor: any;
    cursor_updated_at: string | null;
    cursor_created_at: string | null;
    cursor_id: string | null;
  }>
>(new Map());


  // ---- perf: debounce + request guard + cache ----
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const reqSeqRef = useRef(0);
  const cacheRef = useRef(new Map<string, { rooms: Room[]; total: number }>());
  const makeCacheKey = (p: number, q: string) => `${q.trim().toLowerCase()}|${p}`;

const loadRooms = useCallback(
  async (p: number, q: string, opts?: { silent?: boolean; useCache?: boolean }) => {
    const key = makeCacheKey(p, q);

const canUseCache =
  opts?.useCache &&
  (
    p === 1 ||
    cursorMapRef.current.has(p - 1)
  );

if (canUseCache) {
  const cached = cacheRef.current.get(key);
  if (cached) {
    setRooms(cached.rooms);
    setTotal(cached.total);
  }
}

    const mySeq = ++reqSeqRef.current;

    try {
      if (!opts?.silent) setLoading(true);
      setErrorMsg(null);

      const prevCursor = cursorMapRef.current.get(p - 1) ?? null;
setDebug((prev) => [
  ...prev.slice(-19),
  {
    phase: "RES",
    t: new Date().toISOString(),
    page: p,
    nextCursor: payload.nextCursor ?? null,
    firstRow: rows?.[0] ?? null,
    rowCount: rows?.length ?? 0,
    totalCount: total,
  },
]);

      const res = await supabase.rpc("fetch_admin_rooms_l1_v1", {
        p_search: q.trim() || null,
        p_limit: PAGE_SIZE,

        p_cursor: prevCursor?.cursor ?? null,
        p_cursor_updated_at: prevCursor?.cursor_updated_at ?? null,
        p_cursor_created_at: prevCursor?.cursor_created_at ?? null,
        p_cursor_id: prevCursor?.cursor_id ?? null,

        p_sort: "updated_desc",
      });

      if (mySeq !== reqSeqRef.current) return;

      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      const payload = res.data ?? {};
      const rows = (payload.data ?? []) as Room[];
      const total = payload.total_count ?? 0;
      const nextCursor = payload.nextCursor ?? null;

      // lưu cursor cho page hiện tại
      cursorMapRef.current.set(p, {
        cursor: typeof nextCursor === "string" ? nextCursor : nextCursor?.id ?? null,
        cursor_updated_at: nextCursor?.updated_at ?? null,
        cursor_created_at: nextCursor?.created_at ?? null,
        cursor_id: nextCursor?.id ?? null,
      });

      setRooms(rows);
      setTotal(total);
      cacheRef.current.set(key, { rooms: rows, total });

   setDebug({
  phase: "RES",
  page: p,
  nextCursor: res.data?.nextCursor ?? null,
  firstRow: res.data?.data?.[0] ?? null,
});


    } catch (e: any) {
      if (mySeq !== reqSeqRef.current) return;
      setErrorMsg(e?.message ?? "Đã xảy ra lỗi");
    } finally {
      if (mySeq === reqSeqRef.current && !opts?.silent) setLoading(false);
    }
  },
  []
);

  // when page/search changes => reload
  useEffect(() => {
    loadRooms(page, debouncedSearch, { useCache: true });
  }, [page, debouncedSearch, loadRooms]);

  const deleteRoom = useCallback(async (id: string) => {
    if (!confirm("Xoá phòng này?")) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await supabase.rpc("admin_l1_delete_room", { p_room_id: id });
      if (res.error) {
        setErrorMsg(res.error.message);
        return;
      }

      cacheRef.current.clear();
      setPage(1);
      await loadRooms(1, debouncedSearch, { useCache: false });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Xoá thất bại");
    } finally {
      setLoading(false);
    }
  }, [loadRooms, debouncedSearch]);

const openZaloUX = useCallback((raw?: string | null) => {
  if (!raw) return;
  if (typeof window === "undefined") return;

  const s = String(raw).trim();
  if (!s) return;

  // 1) Nếu đã là link (https://... hoặc zalo://...) thì mở luôn
  if (/^https?:\/\//i.test(s) || /^zalo:\/\//i.test(s)) {
    window.open(s, "_blank", "noopener,noreferrer");
    return;
  }

  // 2) Nếu chỉ là SĐT (hoặc có ký tự), lọc ra số rồi mở theo zalo.me
  const digits = s.replace(/\D/g, "");
  if (!digits) return;

  window.open(`https://zalo.me/${digits}`, "_blank", "noopener,noreferrer");
}, []);


  return (
    <main>
      {/* HEADER */}
      <div style={header}>
        <div style={headerLeft}>
          <input
            placeholder="Tìm theo số nhà / địa chỉ / phường / quận..."
            value={search}
            onChange={(e) => {
  const v = e.target.value;
  setSearch(v);
  setPage(1);
  cursorMapRef.current.clear();
  cacheRef.current.clear();
  setDebug([]); // reset log khi đổi search
}}

            style={searchInput}
          />
        </div>

        <button
          style={addBtn}
          onClick={() => {
            setEditingRoom(null);
            setActiveTab("info");
            setOpenModal(true);
          }}
        >
          + Thêm phòng
        </button>
      </div>

            {/* TABLE */}
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Ngày cập nhật</th>
              <th style={th}>Link zalo</th>
              <th style={th}>Địa chỉ</th>
              <th style={th}>Loại phòng</th>
              <th style={th}>Mã phòng</th>
              <th style={th}>Giá</th>
              <th style={th}>Trạng thái</th>
              
              <th style={{ ...th, width: 120, textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>

          <tbody>
  {rooms.length === 0 ? (
    <tr>
      <td style={td} colSpan={8}>
        Không có dữ liệu
      </td>
    </tr>
  ) : (
    rooms.map((r) => {
      const isRented = normalizeStatus((r as any).status) === "đã thuê";

      const zaloLink = ((r as any).link_zalo || (r as any).zalo_phone) as string | undefined;

      const addressText =
        [
          (r as any).house_number && (r as any).address
            ? `${(r as any).house_number} ${(r as any).address}`
            : (r as any).address,
          (r as any).ward ? `P.${(r as any).ward}` : null,
          (r as any).district ? formatDistrict((r as any).district) : null,
        ]
          .filter(Boolean)
          .join(", ") || "-";

      return (
        <tr key={(r as any).id}>
          {/* 1) Ngày cập nhật */}
          <td style={td}>{formatDate((r as any).updated_at)}</td>

          {/* 2) Link zalo */}
          <td style={td}>
            {zaloLink ? (
              <button
                type="button"
                style={linkBtn}
                onClick={() => openZaloUX(zaloLink)}
              >
                Mở Zalo
              </button>
            ) : (
              "-"
            )}
          </td>

          {/* 3) Địa chỉ */}
          <td style={td}>{addressText}</td>

          {/* 4) Loại phòng */}
          <td style={td}>{(r as any).room_type ?? "-"}</td>

          {/* 5) Mã phòng */}
          <td style={td}>
            <b>{(r as any).room_code ?? "-"}</b>
          </td>

          {/* 6) Giá */}
          <td style={{ ...td, minWidth: 110, whiteSpace: "nowrap" }}>
           {formatPrice((r as any).price)}
          </td>
          
          {/* 7) Trạng thái */}
          <td style={td}>
            <span style={{ ...badge, ...(isRented ? badgeRed : badgeGreen) }}>
              {(r as any).status ?? "Trống"}
            </span>
          </td>

          {/* 8) Thao tác */}
          <td style={{ ...td, textAlign: "right" }}>
            <button
              style={iconBtn}
              onClick={() => {
                setEditingRoom(r);
                setActiveTab("info");
                setOpenModal(true);
              }}
              title="Sửa"
            >
              <Pencil size={18} strokeWidth={1.8} />
            </button>

            <button
              style={{ ...iconBtn, marginLeft: 10 }}
              onClick={() => deleteRoom((r as any).id)}
              title="Xoá"
            >
              <Trash2 size={18} strokeWidth={1.8} color="#ef4444" />
            </button>
          </td>
        </tr>
      );
    })
  )}
</tbody>

        </table>
      </div>

      {/* PAGINATION */}
      <div style={pagination}>
        <button style={pageBtn} disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ← Trước
        </button>

        <div style={muted}>
          Trang <b>{page}</b> / <b>{totalPages}</b>
        </div>

        <button style={pageBtn} disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          Sau →
        </button>
      </div>

      {/* MODAL */}
      {openModal && (
        <RoomModal
          open={openModal}
          onClose={() => setOpenModal(false)}
          editingRoom={editingRoom}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onNotify={notify}
          onSaved={(updatedRoom: any, opts: any) => {
            cacheRef.current.clear();
            const patchedRoom = { ...updatedRoom, updated_at: new Date().toISOString(),};
          
            setRooms((prev) => {
             const without = prev.filter((x: any) => (x as any).id !== patchedRoom.id);
             return [patchedRoom, ...without].slice(0, PAGE_SIZE);
            });

            if (opts?.isNew) setTotal((t) => t + 1);
          }}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 1000,
            background: "#111827",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 13,
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            maxWidth: 360,
          }}
        >
          {toast}
        </div>
      )}
      {debug && (
  <pre
    style={{
      position: "fixed",
      left: 8,
      right: 8,
      bottom: 8,
      maxHeight: "40vh",
      overflow: "auto",
      background: "#000",
      color: "#0f0",
      fontSize: 12,
      padding: 8,
      zIndex: 9999,
      borderRadius: 8,
      whiteSpace: "pre-wrap",
    }}
  >
   {debug.length > 0 && (
  <pre style={{ /* giữ nguyên style */ }}>
    {JSON.stringify(debug, null, 2)}
  </pre>
)}

    </main>
  );
}

/* ================= HELPERS ================= */

function formatDate(input?: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("vi-VN");
}

function formatPrice(input: any) {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("vi-VN")} đ`;
}

function normalizeStatus(input?: string | null) {
  return (input ?? "").trim().toLowerCase();
}

function formatDistrict(input: string) {
  const raw = input.trim();
  if (/^quận\s+\d+/i.test(raw)) return raw.replace(/\s+/g, " ").trim();
  const m = raw.match(/(\d+)/);
  if (m?.[1]) return `Quận ${m[1]}`;
  return `Quận ${raw}`;
}

/* ===================== STYLES ===================== */

const header: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLeft: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flex: 1,
  minWidth: 0,
};

const searchInput: React.CSSProperties = {
  flex: 1,
  maxWidth: 720,
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  outline: "none",
};

const addBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tableWrap: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflowX: "auto",
  overflowY: "auto",
  maxHeight: "calc(100vh - 260px)",
  background: "#fff",
  WebkitOverflowScrolling: "touch",
};

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 12px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 600,
  fontSize: 14,
};

const td: React.CSSProperties = {
  padding: "12px 12px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 14,
  verticalAlign: "top",
};

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 6,
  cursor: "pointer",
  lineHeight: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const pagination: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 14,
};

const pageBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
};

const muted: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const errorBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 13,
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  border: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
  lineHeight: "16px",
};

const badgeGreen: React.CSSProperties = {
  background: "#ecfdf5",
  borderColor: "#a7f3d0",
  color: "#065f46",
};

const badgeRed: React.CSSProperties = {
  background: "#fef2f2",
  borderColor: "#fecaca",
  color: "#991b1b",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#2563eb",
  textDecoration: "underline",
  fontSize: 14,
  cursor: "pointer",
};





