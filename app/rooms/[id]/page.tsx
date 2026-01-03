"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

/* ================= Utils ================= */

function formatDMY(iso: any) {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatVND(value: any) {
  const n = Number(value);
  if (Number.isFinite(n)) return n.toLocaleString("vi-VN") + " đ";
  return value ?? "";
}

function splitGalleryUrls(gallery_urls: any): string[] {
  if (!gallery_urls) return [];
  if (Array.isArray(gallery_urls)) return gallery_urls.filter(Boolean);
  if (typeof gallery_urls === "string") {
    return gallery_urls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
type MediaItem = { kind: "video" | "image"; url: string };
  
function splitVideoUrls(room: any): string[] {
  // ưu tiên room.media.video_urls nếu bạn lưu dạng jsonb
  const v1 = room?.media?.video_urls;
  if (Array.isArray(v1)) return v1.filter(Boolean);

  // nếu có field video_urls độc lập
  const v2 = room?.video_urls;
  if (Array.isArray(v2)) return v2.filter(Boolean);

  // nếu bạn lỡ lưu dạng string csv
  if (typeof v2 === "string") {
    return v2
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

function splitMediaVideos(media: any): string[] {
  if (!media) return [];

  let arr: any = media;

  // nếu media bị lưu dạng string JSON
  if (typeof arr === "string") {
    const s = arr.trim();
    if (!s) return [];
    try {
      arr = JSON.parse(s);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(arr)) return [];

  return arr
    .filter((m) => m && (m.type === "video" || m.type === "VIDEO"))
    .map((m) => String(m.url || ""))
    .filter(Boolean);
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

function humanStatus(status: any) {
  if (!status) return "";
  if (status === "Trống") return "Còn Trống";
  return String(status);
}

function feeUnitLabel(unit: any) {
  if (!unit) return "";
  const u = String(unit).toLowerCase();
  if (u === "kwh") return "kWh";
  if (u === "m3" || u === "m³") return "m³";
  if (u === "person" || u === "người") return "người";
  if (u === "room" || u === "phòng") return "phòng";
  if (u === "vehicle" || u === "xe") return "xe";
  return String(unit);
}


/* ================= Page ================= */

export default function RoomDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const [room, setRoom] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [adminLevel, setAdminLevel] = useState<0 | 1 | 2>(0); // public default
 
  const isMountedRef = useRef(true);
  const roomReqIdRef = useRef(0);
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading");
  
 useEffect(() => {
  return () => {
    isMountedRef.current = false;
  };
}, []);


  let startX = 0;
  const onTouchStart = (e: any) => {
    startX = e.touches?.[0]?.clientX ?? 0;
  };
  const onTouchEnd = (e: any) => {
    const endX = e.changedTouches?.[0]?.clientX ?? 0;
    if (!mediaItems.length) return;

    if (startX - endX > 50 && activeIndex < mediaItems.length - 1) {
      setActiveIndex((i: number) => i + 1);
    }
    if (endX - startX > 50 && activeIndex > 0) {
      setActiveIndex((i: number) => i - 1);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.id) {
        setIsAdmin(false);
        setAdminLevel(0);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("admin_users")
          .select("level")
          .eq("user_id", user.id)
          .maybeSingle();

        const rawLevel = Number(data?.level);
        const level: 0 | 1 | 2 = rawLevel === 1 || rawLevel === 2 ? rawLevel : 0;
        setAdminLevel(level);
        setIsAdmin(level === 1 || level === 2);
      } catch (e) {
        console.error("checkAdmin exception:", e);
        setAdminLevel(0);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [user?.id]);

   

  // ✅ Fetch room detail (ổn định + không kẹt loading)
useEffect(() => {
  if (!id || adminLevel === null) return;

  const myReq = ++roomReqIdRef.current;

  // ✅ set trạng thái ngay khi bắt đầu fetch
  setFetchStatus("loading");
  setLoading(true);
  setRoom(null);

  const fetchRoom = async () => {
    try {
      const role: 0 | 1 | 2 = adminLevel === 1 ? 1 : adminLevel === 2 ? 2 : 0;

      const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
        p_role: role,
        p_id: id,
      });

      if (!isMountedRef.current || myReq !== roomReqIdRef.current) return;

      if (error) {
        console.error("fetchRoom error:", error);
        setRoom(null);
        return;
      }

      // RPC của bạn trả về object JSON -> set thẳng
      setRoom(data ?? null);
    } catch (e) {
      if (!isMountedRef.current || myReq !== roomReqIdRef.current) return;
      console.error("fetchRoom exception:", e);
      setRoom(null);
    } finally {
      if (isMountedRef.current && myReq === roomReqIdRef.current) {
        setLoading(false);
        setFetchStatus("done");
      }
    }
  };

  fetchRoom();
}, [id, adminLevel]);


  const detail = room?.room_detail ?? {};

  const imageUrls = useMemo(() => {
  const s = String(room?.gallery_urls || "").trim();
  return s ? s.split(",").map((x: string) => x.trim()).filter(Boolean) : [];
}, [room?.gallery_urls]);

const videoUrls = useMemo(() => {
  const arr: any = room?.media;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m: any) => String(m?.type).toLowerCase() === "video" && m?.url)
    .map((m: any) => String(m.url))
    .filter(Boolean);
}, [room?.media]);

const mediaItems: MediaItem[] = useMemo(() => {
  const vids: MediaItem[] = videoUrls.map((url: string) => ({ kind: "video", url }));
  const imgs: MediaItem[] = imageUrls.map((url: string) => ({ kind: "image", url }));
  return [...vids, ...imgs]; // ✅ video đứng trước ảnh
}, [videoUrls, imageUrls]);

const activeItem = useMemo(() => {
  if (!mediaItems.length) return null;
  const safeIndex = Math.min(Math.max(activeIndex, 0), mediaItems.length - 1);
  return mediaItems[safeIndex];
}, [activeIndex, mediaItems]);

// ===== RENDER GUARD =====
console.log("STATE", { id, adminLevel, fetchStatus, loading, hasRoom: !!room });

if (!id || adminLevel === null || fetchStatus === "loading") {
  return (
    <div className="p-6 space-y-4">
      <div className="h-[340px] bg-gray-200 rounded animate-pulse" />
      <div className="h-24 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

if (!room) return <div className="p-6 text-base">Không tìm thấy phòng</div>;

  const roomCode = room?.room_code ?? room?.code ?? room?.roomCode ?? "";
  const roomType = room?.room_type ?? room?.type ?? room?.roomType ?? "";
  const statusText = humanStatus(room?.status);
  const priceText = formatVND(room?.price);
  const updatedText = formatDMY(room?.updated_at);
  
  const houseNumber =
    room?.house_number ??
    room?.houseNumber ??
    detail?.house_number ??
    detail?.houseNumber ??
    "";

  const addressLine = joinParts([
    isAdmin
      ? [houseNumber, room?.address].filter(Boolean).join(" ")
      : room?.address,
    room?.ward,
    room?.district,
  ]);

  const descriptionText = room?.description ?? detail?.description ?? room?.desc ?? "";

  const feeRows: Array<{ label: string; value: string }> = [];

  if (detail?.electric_fee_value) {
    feeRows.push({
      label: "⚡ Điện",
      value: `${formatVND(detail.electric_fee_value)}${
        detail?.electric_fee_unit ? ` / ${feeUnitLabel(detail.electric_fee_unit)}` : ""
      }`,
    });
  }

  if (detail?.water_fee_value) {
    feeRows.push({
      label: "💧 Nước",
      value: `${formatVND(detail.water_fee_value)}${
        detail?.water_fee_unit ? ` / ${feeUnitLabel(detail.water_fee_unit)}` : ""
      }`,
    });
  }

  if (detail?.service_fee_value) {
    feeRows.push({
      label: "🧾 Dịch vụ",
      value: `${formatVND(detail.service_fee_value)}${
        detail?.service_fee_unit ? ` / ${feeUnitLabel(detail.service_fee_unit)}` : ""
      }`,
    });
  }

  if (detail?.parking_fee_value) {
    feeRows.push({
      label: "🏍️ Gửi xe",
      value: `${formatVND(detail.parking_fee_value)}${
        detail?.parking_fee_unit ? ` / ${feeUnitLabel(detail.parking_fee_unit)}` : " / xe"
      }`,
    });
  }

  if (detail?.other_fee_value || detail?.other_fee_note) {
    const valuePart = detail?.other_fee_value ? formatVND(detail.other_fee_value) : "";
    const notePart = detail?.other_fee_note ? String(detail.other_fee_note) : "";
    feeRows.push({
      label: "➕ Khác",
      value: [valuePart, notePart].filter(Boolean).join(" - "),
    });
  }

  const isAdminL1 = adminLevel === 1;
  const zaloLink = room?.link_zalo ?? "";

  return (
    <div className="p-6 space-y-6 text-base">
      <div className="space-y-3">
        {mediaItems.length > 0 ? (
  <>
    <div
      className="relative w-full h-[340px] md:h-[440px] rounded-xl overflow-hidden bg-black cursor-pointer"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => setViewerOpen(true)}
    >
      {activeItem ? (
        activeItem.kind === "video" ? (
          <video
            src={activeItem.url}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <img
            src={activeItem.url}
            alt={room?.room_code || ""}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )
      ) : (
        <div className="flex items-center justify-center text-gray-500 h-full">
          Chưa có hình ảnh
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute top-3 left-3 text-white bg-black/40 px-2 py-1 rounded">
        {activeIndex + 1} / {mediaItems.length}
      </div>

      {activeIndex > 0 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 text-white text-2xl px-2 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            setActiveIndex((i) => i - 1);
          }}
        >
          ‹
        </button>
      )}

      {activeIndex < mediaItems.length - 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 text-white text-2xl px-2 rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            setActiveIndex((i) => i + 1);
          }}
        >
          ›
        </button>
      )}
    </div>

    <div className="flex gap-2 overflow-x-auto pb-1">
      {mediaItems.slice(0, 20).map((it, idx) => (
        <button
          key={it.kind + it.url + idx}
          className={[
            "relative flex-none w-20 h-14 rounded-lg overflow-hidden border bg-black",
            idx === activeIndex ? "border-black" : "border-gray-200",
          ].join(" ")}
          onClick={() => setActiveIndex(idx)}
          aria-label={`Xem ${it.kind === "video" ? "video" : "ảnh"} ${idx + 1}`}
        >
          {it.kind === "video" ? (
            <>
              <video
                src={it.url}
                preload="metadata"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                  ▶
                </div>
              </div>
            </>
          ) : (
            <img
              src={it.url}
              alt=""
              className="w-full h-full object-contain"
              loading="lazy"
            />
          )}
        </button>
      ))}
    </div>
  </>
) : (
  <div className="h-[260px] bg-gray-100 rounded-xl flex items-center justify-center text-gray-500">
    Chưa có hình ảnh
  </div>
)}
      </div>

      <div className="rounded-xl border p-4 space-y-2">
  {/* Dòng 1: Mã | type  + Badge bên phải */}
  <div className="flex items-center justify-between gap-3">
    <div className="text-gray-800">
      <span className="font-medium">Mã:</span> <span>{roomCode || "—"}</span>
      {roomType && ` | ${roomType}`}
    </div>

    {statusText && (
      <span
        className={[
          "text-sm px-2 py-[2px] rounded-full border whitespace-nowrap transition-colors",
          statusText === "Còn Trống"
            ? "bg-white text-gray-800 border-gray-300 hover:bg-green-500 hover:text-white hover:border-green-500"
            : "bg-white text-gray-800 border-gray-300 hover:bg-red-500 hover:text-white hover:border-red-500",
        ].join(" ")}
        title={statusText}
      >
        {statusText}
      </span>
    )}
  </div>

  {/* Dòng 2: Giá + updated_at cùng dòng */}
  <div className="flex items-center justify-between gap-3">
    <div className="text-gray-800">
      <span className="font-medium">Giá:</span>{" "}
      <span className="font-semibold text-sky-600">{priceText}</span>
    </div>

    {updatedText && (
      <div className="text-sm text-gray-600 whitespace-nowrap">
        <span className="font-medium"></span> {updatedText}
      </div>
    )}
  </div>

  {addressLine && <div className="text-gray-800 font-semibold">📍 {addressLine}</div>}

  {descriptionText && <div className="text-gray-800 whitespace-pre-line">{descriptionText}</div>}
</div>


      <div className="space-y-2 pt-4 border-t">
        <h2 className="text-lg font-semibold">Chi phí</h2>
        {feeRows.length > 0 ? (
          <div className="space-y-1">
            {feeRows.map((r) => (
              <p key={r.label}>
                <span className="font-medium">{r.label}:</span> {r.value}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Đang cập nhật</p>
        )}
      </div>

      <div className="pt-4 border-t">
        <h2 className="text-lg font-semibold mb-2">Tiện ích</h2>
        <ul className="grid grid-cols-2 gap-2">
          {detail?.has_elevator && <li>✔️ Thang máy</li>}
          {detail?.has_stairs && <li>✔️ Thang bộ</li>}
          {detail?.shared_washer && <li>✔️ Máy giặt chung</li>}
          {detail?.private_washer && <li>✔️ Máy giặt riêng</li>}
          {detail?.shared_dryer && <li>✔️ Máy sấy chung</li>}
          {detail?.private_dryer && <li>✔️ Máy sấy riêng</li>}
          {detail?.has_parking && <li>✔️ Bãi xe</li>}
          {detail?.has_basement && <li>✔️ Hầm xe</li>}
          {detail?.fingerprint_lock && <li>✔️ Cửa vân tay</li>}
          {detail?.allow_pet && <li>✔️ Nuôi thú cưng</li>}
          {detail?.allow_cat && <li>✔️ Nuôi mèo</li>}
          {detail?.allow_dog && <li>✔️ Nuôi chó</li>}
          {detail?.other_amenities && (
            <li className="col-span-2">✔️ {String(detail.other_amenities)}</li>
          )}
        </ul>
      </div>

      {isAdmin && (
        <div className="pt-4 border-t space-y-2">
          <h2 className="text-lg font-semibold">Chính Sách</h2>
          <textarea className="w-full min-h-[140px] rounded-xl border p-3" defaultValue={detail?.policy ?? ""} readOnly />

          {isAdminL1 && zaloLink && (
            <div className="text-gray-800">
              <span className="font-medium">Link Zalo:</span>{" "}
              <a href={zaloLink} target="_blank" rel="noreferrer" className="text-sky-600 underline break-all">
                {zaloLink}
              </a>
            </div>
          )}
        </div>
      )}

      {viewerOpen && mediaItems.length > 0 && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center" onClick={() => setViewerOpen(false)}>
          <div
            className="relative w-full h-full flex items-center justify-center"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClick={(e) => e.stopPropagation()}
          >
            {activeItem?.kind === "video" ? (
  <video
    src={activeItem.url}
    controls
    preload="metadata"
    playsInline
    className="w-full h-full object-contain"
  />
) : (
  <img
    src={activeItem?.url || ""}
    alt={room?.title || roomCode || ""}
    className="w-full h-full object-contain"
    loading="lazy"
  />
)}

            <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setViewerOpen(false)}>
              ✕
            </button>

            {activeIndex > 0 && (
              <button className="absolute left-4 text-white text-3xl" onClick={() => setActiveIndex((i) => i - 1)}>
                ‹
              </button>
            )}

            {activeIndex < mediaItems.length - 1 && (
              <button className="absolute right-4 text-white text-3xl" onClick={() => setActiveIndex((i) => i + 1)}>
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
