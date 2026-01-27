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

function formatWard(ward: any) {
  if (!ward) return null;

  // Xóa các dạng "P.", "p.", "P  " ở đầu
  const w = String(ward).trim().replace(/^P\.?\s*/i, "");

  // Nếu là số (7, 12...) => P.7 / P.12
  if (/^\d+/.test(w)) return `P.${w}`;

  // Nếu là chữ (VD: "Bến Nghé") => P. Bến Nghé
  return `P. ${w}`;
}


// image_urls đã là array (từ RPC / room_media)
function normalizeImageUrls(image_urls: any): string[] {
  if (!Array.isArray(image_urls)) return [];
  return image_urls.filter((x) => typeof x === "string" && x.trim());
}

type MediaItem = {
  kind: "video" | "image";
  url: string;
};
  
function normalizeVideoUrls(video_urls: any): string[] {
  if (!Array.isArray(video_urls)) return [];
  return video_urls
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);
}

function mediaToVideoUrls(media: any): string[] {
  if (!Array.isArray(media)) return [];
  return media
    .filter(
      (m) =>
        m &&
        (m.type === "video" ||
          m.type === "VIDEO" ||
          m.kind === "video" ||
          m.kind === "VIDEO") &&
        typeof m.url === "string"
    )
    .map((m) => String(m.url).trim())
    .filter(Boolean)
    .slice(0, 2);
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

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [adminLevel, setAdminLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [showPlay, setShowPlay] = useState(true)

  // overlay (nút giữa) auto-hide khi đang play
  const [overlayVisible, setOverlayVisible] = useState(true)
  const overlayTimerRef = useRef<number | null>(null)

  function clearOverlayTimer() {
    if (overlayTimerRef.current) {
      window.clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }
  }

  function scheduleHideOverlay(ms = 1500) {
    clearOverlayTimer()
    overlayTimerRef.current = window.setTimeout(() => {
      setOverlayVisible(false)
    }, ms)
  }

  function showOverlayAndMaybeHide() {
    setOverlayVisible(true)
    const v = videoRef.current
    if (v && !v.paused && !v.ended) scheduleHideOverlay(1500)
  }

  useEffect(() => {
    return () => clearOverlayTimer()
  }, [])


    const roomReqIdRef = useRef(0);
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading");
 const [downloadingImages, setDownloadingImages] = useState(false);

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

  // ===== SHARE (Chi phí) =====
type ShareKey = "house_number"|"address" | "code" |"room_type" | "price" | "lift_stairs" | "fees" | "amenities" | "description";

const [shareOpen, setShareOpen] = useState(false);
const [toast, setToast] = useState<string | null>(null);

const [shareSel, setShareSel] = useState<Record<ShareKey, boolean>>({
  // ✅ tick sẵn theo yêu cầu + thứ tự build text
  house_number: true,
  address: true,
  code: true,
  room_type: true,
  price: true,
  lift_stairs: true,

  // ❌ không tick sẵn
  fees: false,
  amenities: false,
  description: false,
});

function showToast(msg: string) {
  setToast(msg);
  window.setTimeout(() => setToast(null), 1600);
}

async function copyText(text: string) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // fallback cũ
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function buildShareText() {
  const lines: string[] = [];

  // 1) 📍 Địa chỉ
  if (shareSel.address || shareSel.house_number) {
  const parts: string[] = [];

  if (shareSel.house_number && houseNumber) {
    parts.push(houseNumber);
  }

  if (shareSel.address) {
    const addr = joinParts([
      room?.address,
      formatWard(room?.ward),
      room?.district,
    ]);

    if (addr) parts.push(addr);
  }

  if (parts.length) {
    lines.push(`📍 ${parts.join(", ")}`);
  }
}

// 4) (blank line) + ✅ Thang máy / thang bộ (chỉ hiện cái "có")
  if (shareSel.lift_stairs) {
    const hasLift = Boolean(detail?.has_elevator);
    const hasStairs = Boolean(detail?.has_stairs);
    const parts = [
      hasLift ? "Thang máy" : null,
      hasStairs ? "Thang bộ" : null,
    ].filter(Boolean) as string[];

    if (parts.length) {
      lines.push(`✅ ${parts.join(" & ")}`);
    }
  }

  // 4) Chi phí (nếu tick)
  if (shareSel.fees) {
    lines.push("");
    lines.push("Chi phí:");
    if (feeRows.length) {
      feeRows.forEach((r) => lines.push(` ${r.label}: ${r.value}`));
    } else {
      lines.push("- Đang cập nhật");
    }
  }

  // 5) Tiện ích (nếu tick) — trừ has_elevator/has_stairs
  if (shareSel.amenities) {
    const amen: string[] = [];
    if (detail?.shared_washer) amen.push("✔️ Máy giặt chung");
    if (detail?.private_washer) amen.push("✔️ Máy giặt riêng");
    if (detail?.shared_dryer) amen.push("✔️ Máy sấy chung");
    if (detail?.private_dryer) amen.push("✔️ Máy sấy riêng");
    if (detail?.has_parking) amen.push("✔️ Bãi xe");
    if (detail?.has_basement) amen.push("✔️ Hầm xe");
    if (detail?.fingerprint_lock) amen.push("✔️ Cửa vân tay");
    if (detail?.allow_pet) amen.push("✔️ Nuôi thú cưng");
    if (detail?.allow_cat) amen.push("✔️ Nuôi mèo");
    if (detail?.allow_dog) amen.push("✔️ Nuôi chó");
    if (detail?.other_amenities) amen.push(`✔️ ${String(detail.other_amenities)}`);

    lines.push("");
    lines.push("Tiện ích:");
    if (amen.length) amen.forEach((x) => lines.push(`- ${x.replace("✔️ ", "")}`));
    else lines.push("- Đang cập nhật");
  }

 // 2) Mã phòng | Loại phòng (chung 1 dòng)
if (shareSel.code || shareSel.room_type) {
  const parts: string[] = [];

  if (shareSel.code) {
    parts.push(`_ Mã: ${roomCode || "—"}`);
  }

  if (shareSel.room_type && roomType) {
    parts.push(`Loại phòng: ${roomType}`);
  }

  if (parts.length) {
    lines.push(""); 
    lines.push(parts.join(" | "));
  }
}

// 3) Giá (dòng riêng)
if (shareSel.price) {
  lines.push(`💰 Giá: ${priceText || "—"}`);
}

  // 6) Mô tả (nếu tick)
  if (shareSel.description && descriptionText) {
    lines.push("");
    lines.push("Mô tả:");
    lines.push(String(descriptionText));
  }

  return lines.join("\n");
}

function isRealMobile() {
  // Ưu tiên API mới nếu có
  // @ts-ignore
  if (navigator.userAgentData?.mobile !== undefined) {
    // @ts-ignore
    return Boolean(navigator.userAgentData.mobile);
  }
  // Fallback userAgent (đủ dùng cho case này)
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function handleShare() {
  const text = buildShareText();
  if (!text.trim()) {
    showToast("Không có nội dung để chia sẻ");
    return;
  }

  // ✅ Desktop / giả mobile trên desktop: luôn copy để tránh “share sheet bật rồi tắt”
  if (!isRealMobile()) {
    const ok = await copyText(text);
    showToast(ok ? "Đã copy nội dung — mở Zalo/Messenger và dán vào" : "Không thể copy — hãy chọn và copy thủ công");
    return;
  }

  // ✅ Mobile thật: ưu tiên Web Share
  try {
    if (navigator?.share) {
      await navigator.share({ text });
      showToast("Đã mở chia sẻ");
      return;
    }
  } catch (e) {
    // share bị cancel / fail -> fallback copy
  }

  const ok = await copyText(text);
  showToast(ok ? "Đã copy nội dung — mở Zalo/Messenger và dán vào" : "Không thể copy — hãy chọn và copy thủ công");
}


  useEffect(() => {
  const checkAdmin = async () => {
    if (!user?.id) {
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
      const level: 0 | 1 | 2 =
        rawLevel === 1 || rawLevel === 2 ? rawLevel : 0;

      setAdminLevel(level);
    } catch (e) {
      console.error("checkAdmin exception:", e);
      setAdminLevel(0);
    }
  };

  checkAdmin();
}, [user?.id]);


useEffect(() => {
  setFetchStatus("loading");
  setRoom(null);
  setActiveIndex(0);
}, [id]);   

  // ✅ Fetch room detail (ổn định + không kẹt loading)
useEffect(() => {
  if (!id) return;

  const myReq = ++roomReqIdRef.current;

  // set trạng thái ngay khi bắt đầu request mới
  setFetchStatus("loading");
  setLoading(true);
  setRoom(null);

  (async () => {
    try {
      const role: 0 | 1 | 2 = adminLevel === 1 ? 1 : adminLevel === 2 ? 2 : 0;

         const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
        p_role: role,
        p_id: id,
      });

      // ✅ nếu không phải request mới nhất -> bỏ qua
      if (myReq !== roomReqIdRef.current) return;

      if (error) {
        console.error("fetchRoom error:", error);
        setRoom(null);
        return;
      }
      setRoom(data ?? null);
    } catch (e) {
      if (myReq !== roomReqIdRef.current) return;
      console.error("fetchRoom exception:", e);
      setRoom(null);
    } finally {
      if (myReq === roomReqIdRef.current) {
        setLoading(false);
        setFetchStatus("done");
      }
    }
  })();
}, [id, adminLevel]);


 const detail =
  (room?.room_detail ??
    room?.room_details ?? // ✅ phòng trường hợp RPC trả key số nhiều
    room?.detail ??
    room?.details ??
    {}) as any;


  const imageUrls = useMemo(() => {
  // ✅ ưu tiên field chuẩn hoá từ RPC (đọc room_media)
  const v = normalizeImageUrls(room?.image_urls);
  if (v.length) return v;

  // ✅ fallback: nếu RPC chưa trả image_urls mà vẫn trả room.media dạng array
  if (!Array.isArray(room?.media)) return [];
  return room.media
    .filter((m: any) => m?.type === "image" && m?.url)
    .map((m: any) => String(m.url))
    .filter(Boolean);
}, [room?.image_urls, room?.media]);

const videoUrls = useMemo(() => {
  // ✅ ưu tiên field chuẩn hoá từ RPC (đọc room_media)
  const v = normalizeVideoUrls(room?.video_urls);
  if (v.length) return v;

  // ✅ fallback: nếu RPC chưa trả video_urls mà vẫn trả room.media dạng array
  const v2 = mediaToVideoUrls(room?.media);
  if (v2.length) return v2;

  return [];
}, [room?.video_urls, room?.media]);


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

if (!id || fetchStatus === "loading") {
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
  adminLevel === 1 || adminLevel === 2
    ? [houseNumber, room?.address].filter(Boolean).join(" ")
    : room?.address,
  room?.ward
  ? (() => {
      const w = String(room.ward).trim().replace(/^P\.?\s*/i, "");
      return `P.${/^[0-9]/.test(w) ? w : ` ${w}`}`;
    })()
  : null,

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

  const isAdmin = adminLevel === 1 || adminLevel === 2;
  const isAdminL1 = adminLevel === 1;

  // ✅ Hợp nhất dữ liệu từ link_zalo + zalo_phone
  const linkRaw = String(room?.link_zalo ?? "");
  const phoneRaw = String(room?.zalo_phone ?? "");

  // 1) Link: tìm URL trong link_zalo trước, fallback qua zalo_phone (nếu người nhập dán link vào đó)
  const linkMatch1 = linkRaw.match(/https?:\/\/\S+/i);
  const linkMatch2 = phoneRaw.match(/https?:\/\/\S+/i);
  const zaloLink = (linkMatch1?.[0] ?? linkMatch2?.[0] ?? "").trim();

  // 2) Phones: gom tất cả text từ cả 2 field, loại dòng link, chỉ giữ digits theo từng dòng
  const collectPhones = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^https?:\/\//i.test(line)) // ✅ bỏ dòng link
      .map((line) => line.replace(/\D/g, ""))        // ✅ chỉ giữ số
      .filter(Boolean);

  const zaloPhones = Array.from(
    new Set([...collectPhones(linkRaw), ...collectPhones(phoneRaw)])
  );

  // (tuỳ chọn) lấy số đầu tiên nếu bạn vẫn cần 1 biến zaloPhone
  const zaloPhone = zaloPhones[0] ?? "";

  return (

    <div className="p-6 space-y-6 text-base">
      <div className="space-y-1">
        {mediaItems.length > 0 ? (
  <>
    <div
     
      className="relative w-full h-[340px] md:h-[440px] rounded-xl overflow-hidden bg-black cursor-pointer"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => {
      if (activeItem?.kind !== "video") setViewerOpen(true)
    }}

    >
      {activeItem ? (
  activeItem.kind === "video" ? (
    <div
      className="relative w-full h-full"
      onClick={(e) => {
        e.stopPropagation()
        showOverlayAndMaybeHide()
      }}
    >
      <video
        ref={videoRef}
        src={activeItem.url}
        controls
        preload="none"
        playsInline
        className="w-full h-full object-contain bg-black"
        onPlay={() => {
          setShowPlay(false)
          showOverlayAndMaybeHide()
        }}
        onPause={() => {
          setShowPlay(true)
          setOverlayVisible(true)
          clearOverlayTimer()
        }}
        onEnded={() => {
          setShowPlay(true)
          setOverlayVisible(true)
          clearOverlayTimer()
        }}
      />

      {(overlayVisible || showPlay) && (
        <button
          className="absolute inset-0 m-auto w-16 h-16 rounded-full
                     bg-black/40 text-white text-2xl
                     flex items-center justify-center
                     border border-white/40 backdrop-blur"
          onClick={(e) => {
            e.stopPropagation()
            const v = videoRef.current
            if (!v) return

            setOverlayVisible(true)
            clearOverlayTimer()

            if (v.paused) {
              v.play()
              setShowPlay(false)
              scheduleHideOverlay(1500)
            } else {
              v.pause()
              setShowPlay(true)
            }
          }}
          aria-label={showPlay ? "Phát video" : "Tạm dừng video"}
          title={showPlay ? "Phát" : "Tạm dừng"}
        >
          {showPlay ? "▶" : "⏸"}
        </button>
      )}
    </div>
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

      {activeItem?.kind === "image" && (
  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
)}
      <div className="absolute top-3 left-3 text-white bg-black/40 px-2 py-1 rounded pointer-events-none">
  
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
    {isAdmin && (
  <button
    type="button"
    disabled={downloadingImages}
    onClick={(e) => {
  e.stopPropagation();
  if (downloadingImages) return;

  try {
    setDownloadingImages(true);

    const url = `/api/rooms/${encodeURIComponent(id)}/download-images`;

    // ✅ Mở tải bằng trình duyệt (UI không phải đợi)
    window.open(url, "_blank");
  } finally {
    setDownloadingImages(false);
  }
}}

    className="
      absolute top-3 right-3 z-10
      inline-flex items-center gap-1
      rounded-full border border-gray-300
      bg-white/90 backdrop-blur
      px-2 py-[1px]
      text-[10px] font-medium
      text-gray-700
      hover:bg-white
      transition
      scale-[0.8] origin-top-right
      disabled:opacity-60 disabled:cursor-not-allowed
    "
    title={downloadingImages ? "Đang chuẩn bị file..." : "Tải ảnh"}
  >
    {downloadingImages ? "⏳ Đang chuẩn bị..." : "⬇️ Tải ảnh"}
  </button>
)}

    <div className="flex gap-2 overflow-x-auto pb-0">
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
                preload="none"
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
      
{/* ===== Ngày cập nhật ===== */}
<div className="flex items-center justify-end gap-3 mt-1 mb-0 text-sm text-gray-600">
  {updatedText && <div>Ngày cập nhật: {updatedText}</div>}
</div>

  <div className="rounded-xl border p-4 space-y-2">
 {/* Dòng 1: Mã | type  + Badge bên phải */}
<div className="flex items-start justify-between gap-3">
  <div className="text-gray-800">
    <span>Mã:</span>{" "}
    <span className="font-semibold">{roomCode || "—"}</span>
    {roomType && (
      <>
        {" | "}
        <span>Dạng :</span>{" "}
        <span className="font-semibold">{roomType}</span>
      </>
    )}
  </div>

  <div className="flex flex-col items-end gap-1">
    {statusText && (
      <span
        className={[
          "text-sm px-2 py-[2px] rounded-full whitespace-nowrap",
          statusText === "Còn Trống" ? "bg-green-500 text-white" : "bg-red-500 text-white",
        ].join(" ")}
        title={statusText}
      >
        {statusText}
      </span>
    )}

   
  </div>
</div>

  {/* Dòng 2: Giá + Mô Tả*/}
  <div className="flex items-center justify-between gap-3">
    <div className="text-gray-800">
      <span className="font-medium">Giá:</span>{" "}
      <span className="font-semibold text-sky-600">{priceText}</span>
    </div>
      <div className="max-w-[50%] text-right text-gray-800 whitespace-pre-line break-words">
    {descriptionText}
  </div>
</div>
 {/* Dòng 3: Địa chỉ */}
  {addressLine && <div className="text-gray-800 font-semibold">📍 {addressLine}</div>}

  </div>

      <div className="space-y-2 pt-4 border-t">
        <div className="flex items-center justify-between">
  <h2 className="text-lg font-semibold">Chi phí</h2>

    {(adminLevel === 1 || adminLevel === 2) && (
    <button
      type="button"
      onClick={() => setShareOpen(true)}
      className="text-sm px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-100"
      aria-label="Chia sẻ"
      title="Chia sẻ"
     >
      Chia sẻ
    </button>
    )}
</div>
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

    <textarea
      className="w-full min-h-[140px] rounded-xl border p-3"
      defaultValue={room?.chinh_sach ?? ""}
      readOnly
    />

    {/* ✅ chỉ L1 mới thấy link_zalo */}
      {isAdminL1 && (zaloLink || zaloPhones.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3 text-gray-800">
          {/* LEFT: Link */}
          <div>
            <div className="font-medium mb-1">Link Zalo</div>
            {zaloLink ? (
              <a
                href={zaloLink}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 underline break-all"
              >
                {zaloLink}
              </a>
            ) : (
              <div className="text-gray-500">-</div>
            )}
          </div>

          {/* RIGHT: Phones */}
          <div>
            <div className="font-medium mb-1">SĐT</div>
            {zaloPhones.length > 0 ? (
              <div className="space-y-1">
                {zaloPhones.map((p, i) => (
                  <div key={`${p}-${i}`} className="break-all">
                    {p}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">-</div>
            )}
          </div>
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
  <div className="relative w-full h-full">
    <div
  className="relative w-full h-full"
  onClick={(e) => {
    e.stopPropagation()
    showOverlayAndMaybeHide()
  }}
>
  <video
    ref={videoRef}
    src={activeItem.url}
    controls
    playsInline
    preload="none"
    className="w-full h-full object-contain bg-black"
    onPlay={() => {
      setShowPlay(false)
      showOverlayAndMaybeHide()
    }}
    onPause={() => {
      setShowPlay(true)
      setOverlayVisible(true)
      clearOverlayTimer()
    }}
    onEnded={() => {
      setShowPlay(true)
      setOverlayVisible(true)
      clearOverlayTimer()
    }}
  />

  {(overlayVisible || showPlay) && (
    <button
      className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center border border-white/40 backdrop-blur"
      onClick={(e) => {
        e.stopPropagation()
        const v = videoRef.current
        if (!v) return

        // luôn hiện nút khi user tương tác
        setOverlayVisible(true)
        clearOverlayTimer()

        if (v.paused) {
          v.play()
          setShowPlay(false)
          scheduleHideOverlay(1500)
        } else {
          v.pause()
          setShowPlay(true)
        }
      }}
      aria-label={showPlay ? "Phát video" : "Tạm dừng video"}
      title={showPlay ? "Phát" : "Tạm dừng"}
    >
      {showPlay ? "▶" : "⏸"}
    </button>
  )}
</div>

  </div>
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

      {/* ===== SHARE MODAL ===== */}
{(adminLevel === 1 || adminLevel === 2) && shareOpen && (
  <div
    className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center"
    onClick={() => setShareOpen(false)}
  >
    <div
      className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Chia sẻ</div>
        <button
          type="button"
          onClick={() => setShareOpen(false)}
          className="px-3 py-1 rounded-lg hover:bg-gray-100"
        >
          Đóng
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="text-sm font-semibold text-gray-700">Thông tin nhanh</div>

        {(adminLevel === 1 || adminLevel === 2) && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.house_number}
              disabled={!shareSel.address}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, house_number: e.target.checked }))
              }
            />
            <span>Số nhà</span>
          </label>
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.address}
            onChange={(e) => setShareSel((s) => ({ ...s, address: e.target.checked }))}
          />
          <span>Địa chỉ</span>
        </label>

        <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.code}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, code: e.target.checked }))
              }
            />
            <span>Mã phòng</span>
          </label>

          {(adminLevel === 1 || adminLevel === 2) && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shareSel.room_type}
                onChange={(e) =>
                  setShareSel((s) => ({ ...s, room_type: e.target.checked }))
                }
              />
              <span>Loại phòng</span>
            </label>
          )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.price}
            onChange={(e) => setShareSel((s) => ({ ...s, price: e.target.checked }))}
          />
          <span>Giá phòng</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.lift_stairs}
            onChange={(e) => setShareSel((s) => ({ ...s, lift_stairs: e.target.checked }))}
          />
          <span>Thang máy / Thang bộ</span>
        </label>

        <div className="pt-2 border-t" />

        <div className="text-sm font-semibold text-gray-700">Tuỳ chọn</div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.fees}
            onChange={(e) => setShareSel((s) => ({ ...s, fees: e.target.checked }))}
          />
          <span>Chi phí</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.amenities}
            onChange={(e) => setShareSel((s) => ({ ...s, amenities: e.target.checked }))}
          />
          <span>Tiện ích </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shareSel.description}
            onChange={(e) => setShareSel((s) => ({ ...s, description: e.target.checked }))}
          />
          <span>Mô tả</span>
        </label>

        <div className="pt-2 border-t" />

        <div className="text-sm font-semibold text-gray-700">Preview</div>
        <pre className="text-sm whitespace-pre-wrap bg-gray-50 border rounded-xl p-3 max-h-48 overflow-auto">
          {buildShareText()}
        </pre>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 rounded-xl bg-black text-white py-2 font-medium"
          >
            Chia sẻ
          </button>
          <button
            type="button"
            onClick={async () => {
              const text = buildShareText();
              const ok = await copyText(text);
              showToast(ok ? "Đã copy nội dung — mở Zalo/Messenger và dán vào" : "Không thể copy — hãy chọn và copy thủ công");
            }}
            className="flex-1 rounded-xl border py-2 font-medium"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  </div>
)}

{/* ===== TOAST ===== */}
{toast && (
  <div className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-4 py-2 rounded-full">
    {toast}
  </div>
)}

    </div>
  );
}
