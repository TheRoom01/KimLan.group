"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

  const [openModal, setOpenModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("info");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminLevel, setAdminLevel] = useState<number | null>(null);

const [toast, setToast] = useState<string | null>(null);
const [linkPickerOpen, setLinkPickerOpen] = useState(false);
const [linkPickerTitle, setLinkPickerTitle] = useState("Chọn link để mở");
const [linkPickerLinks, setLinkPickerLinks] = useState<string[]>([]);

const [confirmOpen, setConfirmOpen] = useState(false);
const [confirmTitle, setConfirmTitle] = useState("Xác nhận");
const [confirmText, setConfirmText] = useState("");
const confirmActionRef = useRef<null | (() => void | Promise<void>)>(null);

const toastTimerRef = useRef<number | null>(null);

const notify = useCallback((msg: string) => {
  setToast(msg);

  if (toastTimerRef.current) {
    window.clearTimeout(toastTimerRef.current);
  }

  toastTimerRef.current = window.setTimeout(() => {
    setToast(null);
    toastTimerRef.current = null;
  }, 2500);
}, []);

useEffect(() => {
  return () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  };
}, []);

const openConfirm = useCallback(
  (title: string, text: string, action: () => void | Promise<void>) => {
    setConfirmTitle(title);
    setConfirmText(text);
    confirmActionRef.current = action;
    setConfirmOpen(true);
  },
  []
);

const closeConfirm = useCallback(() => {
  setConfirmOpen(false);
  confirmActionRef.current = null;
}, []);

const runConfirmAction = useCallback(async () => {
  const fn = confirmActionRef.current;
  setConfirmOpen(false);
  confirmActionRef.current = null;
  if (fn) {
    await fn();
  }
}, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const cursorMapRef = useRef<
    Map<
      number,
      {
        cursor: any;
        cursor_updated_at: string | null;
        cursor_created_at: string | null;
        cursor_id: string | null;
      }
    >
  >(new Map());

  // ---- perf: debounce + request guard + cache ----
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const { data: levelData, error: levelErr } =
        await supabase.rpc("get_my_admin_level");

      if (!alive) return;

      if (levelErr) {
        console.warn("get_my_admin_level failed", levelErr);
        setAdminLevel(null);
        return;
      }

      const lvl = Number(levelData ?? 0);
      setAdminLevel(Number.isFinite(lvl) ? lvl : null);
    } catch (e) {
      console.warn("get_my_admin_level exception", e);
      if (alive) setAdminLevel(null);
    }
  })();

  return () => {
    alive = false;
  };
}, []);

  const reqSeqRef = useRef(0);
  const cacheRef = useRef(new Map<string, { rooms: Room[]; total: number }>());
  const makeCacheKey = (p: number, q: string) => `${q.trim().toLowerCase()}|${p}`;

  const loadRooms = useCallback(
    async (p: number, q: string, opts?: { silent?: boolean; useCache?: boolean }) => {
      const key = makeCacheKey(p, q);

  const canUseCache = !!opts?.useCache;

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

const offset = (p - 1) * PAGE_SIZE;

const rpcArgs = {
  p_limit: PAGE_SIZE,
  p_offset: offset,
  p_search: q.trim() || null,
};

const rpcName =
  adminLevel === 1
    ? "fetch_admin_rooms_l1_v1"
    : adminLevel === 2
    ? "fetch_admin_rooms_l2_v1"
    : null;
console.log("admin rpc:", rpcName, "level:", adminLevel); // 👈 THÊM DÒNG NÀY
if (!rpcName) {
  setErrorMsg("Không có quyền truy cập trang admin.");
  return;
}

const res = await supabase.rpc(rpcName as any, rpcArgs);
if (mySeq !== reqSeqRef.current) return;

if (res.error) {
  setErrorMsg(res.error.message);
  return;
}

const payload: any = res.data ?? {};
const rows = (payload.data ?? []) as Room[];
const nextTotal = (payload.total_count ?? payload.total ?? 0) as number;

// admin offset-based => không dùng cursor map
cursorMapRef.current.clear();

setRooms(rows);
setTotal(nextTotal);
cacheRef.current.set(key, { rooms: rows, total: nextTotal });

      } catch (e: any) {
  if (mySeq !== reqSeqRef.current) return;
  setErrorMsg(e?.message ?? "Đã xảy ra lỗi");
} finally {
  if (mySeq === reqSeqRef.current && !opts?.silent) setLoading(false);
}
    },
    [adminLevel]
  );

  // when page/search changes => reload
  useEffect(() => {
  if (adminLevel !== 1 && adminLevel !== 2) return;
  loadRooms(page, debouncedSearch, { useCache: true });
}, [page, debouncedSearch, loadRooms, adminLevel]);

 const deleteRoom = useCallback(
  async (id: string) => {
    if (adminLevel === 2) {
      openConfirm(
        "Ẩn phòng",
        "Bạn có chắc muốn ẩn phòng này khỏi danh sách admin L2?",
        async () => {
          try {
            setLoading(true);
            setErrorMsg(null);

            const res = await supabase.rpc("hide_room", { p_room_id: id });
            if (res.error) {
              setErrorMsg(res.error.message);
              return;
            }

            cacheRef.current.clear();
            cursorMapRef.current.clear();
            await loadRooms(page, debouncedSearch, { useCache: false });

            notify("Đã ẩn phòng");
          } catch (e: any) {
            setErrorMsg(e?.message ?? "Ẩn phòng thất bại");
          } finally {
            setLoading(false);
          }
        }
      );
      return;
    }

    if (adminLevel === 1) {
      openConfirm(
        "Xoá phòng",
        "Bạn có chắc muốn xoá phòng này? Dữ liệu DB và media có thể bị xoá.",
        async () => {
          try {
            setLoading(true);
            setErrorMsg(null);

            const res = await supabase.rpc("admin_l1_delete_room", { p_room_id: id });
            if (res.error) {
              setErrorMsg(res.error.message);
              return;
            }

            cacheRef.current.clear();
            cursorMapRef.current.clear();
            setPage(1);
            await loadRooms(1, debouncedSearch, { useCache: false });

            notify("Đã xoá phòng");
          } catch (e: any) {
            setErrorMsg(e?.message ?? "Xoá phòng thất bại");
          } finally {
            setLoading(false);
          }
        }
      );
      return;
    }

    setErrorMsg("Không có quyền thao tác.");
  },
  [adminLevel, debouncedSearch, loadRooms, notify, openConfirm, page]
);

const toggleRoomStatus = useCallback(
  async (room: any) => {
    const current = normalizeStatus(room.status);
    const next = current === "đã thuê" ? "Trống" : "Đã thuê";

    openConfirm(
      "Đổi trạng thái",
      `Bạn có chắc muốn chuyển trạng thái phòng sang "${next}"?`,
      async () => {
        try {
          setRooms((prev) =>
            prev.map((r: any) =>
              r.id === room.id ? { ...r, status: next } : r
            )
          );

          const res = await supabase.rpc("update_room_status", {
            p_room_id: room.id,
            p_status: next,
          });

          if (res.error) {
            throw new Error(res.error.message);
          }

          notify("Đã cập nhật trạng thái");
        } catch (e: any) {
          setRooms((prev) =>
            prev.map((r: any) =>
              r.id === room.id ? { ...r, status: room.status } : r
            )
          );

          setErrorMsg(e?.message ?? "Cập nhật thất bại");
        }
      }
    );
  },
  [notify, openConfirm]
);

const openZaloUX = useCallback((rawLink?: string | null, rawPhone?: string | null) => {
  if (typeof window === "undefined") return;

  const links = extractHttpLinks(rawLink, rawPhone);

  if (links.length === 0) {
    notify("Không có link hợp lệ để mở");
    return;
  }

  if (links.length === 1) {
    window.open(links[0], "_blank", "noopener,noreferrer");
    return;
  }

  setLinkPickerTitle("Chọn link để mở:");
  setLinkPickerLinks(links);
  setLinkPickerOpen(true);
}, [notify]);

  return (
    <main>
      {/* HEADER */}
      <div style={header}>
        <div style={headerLeft}>
          <div style={searchWrap}>
            <input
              placeholder="Tìm theo số nhà / địa chỉ / phường / quận..."
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                setPage(1);
                cursorMapRef.current.clear();
                cacheRef.current.clear();
              }}
              style={searchInputWithClear}
            />

            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                  cursorMapRef.current.clear();
                  cacheRef.current.clear();
                }}
                style={clearSearchBtn}
                aria-label="Xoá tìm kiếm"
                title="Xoá tìm kiếm"
              >
                ×
              </button>
            )}
          </div>
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

      {errorMsg && <div style={{ ...errorBox, marginTop: 10 }}>{errorMsg}</div>}

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
                const isHidden = Boolean((r as any).is_hidden);

                const zaloLink = ((r as any).link_zalo || (r as any).zalo_phone) as
                  | string
                  | undefined;

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
                    <td style={td}>{formatDate((r as any).updated_at)}</td>

                    <td style={td}>
                      {zaloLink ? (
                        <button
                          type="button"
                          style={linkBtn}
                          onClick={() =>
                            openZaloUX(
                              (r as any).link_zalo,
                              (r as any).zalo_phone,
                            )
                          }
                        >
                          Mở Zalo
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td style={td}>{addressText}</td>
                    <td style={td}>{(r as any).room_type ?? "-"}</td>

                    <td style={td}>
                      <b>{(r as any).room_code ?? "-"}</b>
                    </td>

                    <td style={{ ...td, minWidth: 110, whiteSpace: "nowrap" }}>
                      {formatPrice((r as any).price)}
                    </td>

                    <td style={td}>
                    {adminLevel === 1 && isHidden ? (
                      <span style={{ ...badge, ...badgeHidden }}>
                        Đã ẩn
                      </span>
                    ) : (
                      <button
                        style={{
                          ...badge,
                          ...(isRented ? badgeRed : badgeGreen),
                          cursor: "pointer",
                        }}
                        onClick={() => toggleRoomStatus(r)}
                        title="Click để đổi trạng thái"
                      >
                        {(r as any).status ?? "Trống"}
                      </button>
                    )}
                  </td>

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
        <button
          style={pageBtn}
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Trước
        </button>

        <div style={muted}>
          Trang <b>{page}</b> / <b>{totalPages}</b>
        </div>

        <button
          style={pageBtn}
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
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
          onSaved={async (updatedRoom: any, opts: any) => {
            cacheRef.current.clear();
            cursorMapRef.current.clear();

            const patchedRoom = { ...updatedRoom, updated_at: new Date().toISOString() };

            if ((debouncedSearch || "").trim()) {
              await loadRooms(page, debouncedSearch, { useCache: false });
              return;
            }

            setRooms((prev) => {
              const without = prev.filter((x: any) => (x as any).id !== patchedRoom.id);
              return [patchedRoom, ...without].slice(0, PAGE_SIZE);
            });

            if (opts?.isNew) {
              setTotal((t) => t + 1);
            }
          }}
        />
      )}

      {linkPickerOpen && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.35)",
      zIndex: 999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}
    onClick={() => setLinkPickerOpen(false)}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 520,
        background: "#fff",
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #e5e7eb",
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        {linkPickerTitle}
      </div>

      <div style={{ padding: 16, display: "grid", gap: 10, maxHeight: 360, overflowY: "auto" }}>
        {linkPickerLinks.map((link, idx) => (
          <button
            key={`${link}-${idx}`}
            type="button"
            onClick={() => {
              window.open(link, "_blank", "noopener,noreferrer");
              setLinkPickerOpen(false);
            }}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
              color: "#2563eb",
              textDecoration: "underline",
              wordBreak: "break-all",
            }}
            title={link}
          >
            {link}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: 16,
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={() => setLinkPickerOpen(false)}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Đóng
        </button>
      </div>
    </div>
  </div>
)}

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={closeConfirm}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              borderRadius: 14,
              padding: 20,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#111827",
                marginBottom: 8,
              }}
            >
              {confirmTitle}
            </div>

            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "#374151",
                marginBottom: 16,
              }}
            >
              {confirmText}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={closeConfirm}
                style={{
                  background: "#e5e7eb",
                  color: "#111827",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Huỷ
              </button>

              <button
                type="button"
                onClick={runConfirmAction}
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
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
       </main>
  );
}

/* ================= HELPERS ================= */

const VI_DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function formatDate(input?: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return VI_DATE_FMT.format(d);
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

function extractHttpLinks(...inputs: Array<string | null | undefined>) {
  const all = inputs
    .map((x) => String(x ?? ""))
    .join("\n");

  const matches = all.match(/https?:\/\/[^\s]+/gi) ?? [];

  return Array.from(
    new Set(
      matches
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}

/* ===================== STYLES ===================== */

const header: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
};

const headerLeft: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flex: 1,
  minWidth: 0,
};

const searchInput: CSSProperties = {
  flex: 1,
  maxWidth: 720,
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  outline: "none",
};

const searchWrap: CSSProperties = {
  position: "relative",
  flex: 1,
  maxWidth: 720,
};

const searchInputWithClear: CSSProperties = {
  ...searchInput,
  width: "100%",
  maxWidth: "none",
  paddingRight: 40,
};

const clearSearchBtn: CSSProperties = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "#6b7280",
  fontSize: 20,
  lineHeight: "28px",
  cursor: "pointer",
};
const addBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tableWrap: CSSProperties = {
  marginTop: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  overflowX: "auto",
  overflowY: "auto",
  maxHeight: "calc(100vh - 260px)",
  background: "#fff",
  WebkitOverflowScrolling: "touch",
};

const table: CSSProperties = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "collapse",
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "12px 12px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 600,
  fontSize: 14,
};

const td: CSSProperties = {
  padding: "12px 12px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 14,
  verticalAlign: "top",
};

const iconBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 6,
  cursor: "pointer",
  lineHeight: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const pagination: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 14,
};

const pageBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
};

const muted: CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
};

const errorBox: CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: 13,
};

const badge: CSSProperties = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  border: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
  lineHeight: "16px",
};

const badgeGreen: CSSProperties = {
  background: "#ecfdf5",
  borderColor: "#a7f3d0",
  color: "#065f46",
};
const badgeHidden: CSSProperties = {
  background: "#f3f4f6",
  borderColor: "#e5e7eb",
  color: "#6b7280",
};

const badgeRed: CSSProperties = {
  background: "#fef2f2",
  borderColor: "#fecaca",
  color: "#991b1b",
};

const linkBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#2563eb",
  textDecoration: "underline",
  fontSize: 14,
  cursor: "pointer",
};


