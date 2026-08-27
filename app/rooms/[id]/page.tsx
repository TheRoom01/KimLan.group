"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";

import { supabase } from "@/lib/supabase";
import { getBrowserContext, openExternalBrowser } from "@/lib/browser";
import ShareRoomModal from "@/components/share/ShareRoomModal";
import { createPortal } from "react-dom";
import {
  extractRoomActionUrls,
  normalizeGoogleMapsUrl,
} from "@/lib/roomActionLinks";
import { formatVietnameseWard } from "@/lib/formatWard";
import { extractContactPhones } from "@/lib/contactPhones";
import { loadRoomDetailFast } from "@/lib/roomDetailPrefetch";

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
  return formatVietnameseWard(ward);
}


// image_urls đã là array (từ RPC / room_media)
function normalizeImageUrls(image_urls: any): string[] {
  if (!Array.isArray(image_urls)) return [];
  return image_urls.filter((x) => typeof x === "string" && x.trim());
}

type MediaItem = {
  kind: "video" | "image";
  url: string;
  thumb?: string;
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

function renderSmartLinks(raw: string) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const type = detectLinkType(line);

        // ===== ZALO =====
        if (type === "zalo") {
          return (
          <a
            key={idx}
            href={line}
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex items-center gap-3
              w-fix max-w-full
              rounded-2xl px-3 py-2
              border border-white/20
              bg-[rgba(255,255,255,0.06)]
              backdrop-blur-[24px]
              shadow-[0_10px_35px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]
              hover:bg-[rgba(255,255,255,0.12)]
              transition-all
            "
          >
            <div
              className="
                w-10 h-10 rounded-full flex items-center justify-center
                text-white font-bold
                bg-[rgba(59,130,246,0.25)]
                backdrop-blur-[10px]
                border border-blue-300/40
              "
            >
              Z
            </div>

            <div className="flex-1">
              <div className="text-sm font-medium text-[#F4E7D6]">
                Group Zalo chủ nhà
              </div>
              <div className="text-xs text-[#EAD8C0]/70 break-all">
                {line}
              </div>
            </div>
          </a>
          );
        }

       // ===== ALL OTHER LINKS =====
        return (
          <a
            key={idx}
            href={line}
            target="_blank"
            rel="noreferrer"
            className="
              inline-flex items-center gap-3
              w-fix max-w-full
              rounded-2xl px-3 py-2
              border border-white/20
              bg-[rgba(255,255,255,0.06)]
              backdrop-blur-[24px]
              shadow-[0_10px_35px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]
              hover:bg-[rgba(255,255,255,0.12)]
              active:scale-[0.97]
              transition-all
            "
          >
            <div
              className="
                w-10 h-10 rounded-full flex items-center justify-center
                text-white text-sm
                bg-[rgba(34,197,94,0.18)]
                backdrop-blur-[10px]
                border border-green-400/30
              "
            >
              🔗
            </div>

            <div className="text-sm font-medium text-[#F4E7D6]">
              {getLinkButtonLabel(type)}
            </div>
          </a>
        );
      })}
    </div>
  );
}

function humanStatus(status: any) {
  if (!status) return "";

  const s = String(status).trim().toLowerCase();

  if (s === "trống" || s === "còn trống" || s === "đang trống") {
    return "Đang trống";
  }

  if (s === "sắp trống") {
    return "Sắp trống";
  }

  if (s === "đã thuê" || s === "da thue") {
    return "Đã thuê";
  }

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

function compactShareHouseNumber(input: any) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Share text:
  // 12/4 -> 12/
  // 12A3 -> 12
  // 123  -> 123
  const m = s.match(/^(\d+\/?)/);
  return m?.[1] ?? s;
}

function compactPublicHouseNumber(input: any) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Public detail:
  // 12A3 -> 12A
  // 12/4 -> 12/
  // 123  -> không hiện
  const m = s.match(/^(\d+\D)/);
  return m?.[1] ?? "";
}

/* ================= Page ================= */

function detectLinkType(url: string) {
  const u = url.toLowerCase();

  if (u.includes("zalo.me")) return "zalo";
  if (u.includes("docs.google.com/spreadsheets")) return "gsheet";
  if (u.includes("drive.google.com")) return "gdrive";
  if (u.includes("docs.google.com")) return "gdoc";

  return "other";
}

function getLinkButtonLabel(type: string) {
  if (type === "zalo") return "Mở nhóm Zalo";
  if (type === "gsheet") return "Mở Google Sheet";
  if (type === "gdrive") return "Mở Google Drive";
  if (type === "gdoc") return "Mở Google Docs";
  return "Mở liên kết";
}

function getStoredLinkName(type: string) {
  if (type === "zalo") return "Nhóm Zalo";
  if (type === "gsheet") return "Google Sheet";
  if (type === "gdrive") return "Google Drive";
  if (type === "gdoc") return "Google Docs";
  return "Liên kết";
}

function getStoredLinkBadge(type: string) {
  if (type === "zalo") return "Z";
  if (type === "gsheet") return "GS";
  if (type === "gdrive") return "GD";
  if (type === "gdoc") return "DOC";
  return "↗";
}

function publicHouseNumber(value?: string | null) {
  const s = String(value || "").trim();

  if (!s) return "...";

  if (s.includes("/")) {
    const first = s.split("/")[0]?.trim();
    return first ? `${first}/...` : "...";
  }

  if (/^\d+$/.test(s)) {
    return "...";
  }

  const m = s.match(/^(\d+)/);

  if (m?.[1]) {
    return `${m[1]}...`;
  }

  return "...";
}

export default function RoomDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";

  
  const [room, setRoom] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mediaDragX, setMediaDragX] = useState(0);
  const [mediaSlideDirection, setMediaSlideDirection] = useState<-1 | 0 | 1>(0);
  const [mediaSnappingBack, setMediaSnappingBack] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [phoneModal, setPhoneModal] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  const searchParams = useSearchParams();
  const isModal = searchParams.get("modal") === "1";

  const [user, setUser] = useState<any>(null);
  const [adminLevel, setAdminLevel] = useState(0);

const currentUserIdValue = String(user?.id ?? "").trim();
const roomOwnerId = String(room?.owner_id ?? "").trim();
const canSeePrivateFields =
  adminLevel === 1 ||
  (
    adminLevel === 2 &&
    Boolean(currentUserIdValue) &&
    roomOwnerId === currentUserIdValue
  );
  
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const router = useRouter();

  const handleCloseModal = useCallback(() => {
    if (window.history.length > 1) {
        router.back();
        return;
      }

      router.replace("/");
    }, [router]);

    useEffect(() => {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }, []);

        useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (viewerOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        setViewerOpen(false);
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevMedia();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextMedia();
        return;
      }

      return;
    }

    if (e.key === "Escape") {
      handleCloseModal();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [handleCloseModal, viewerOpen, goPrevMedia, goNextMedia]);

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
  const privateFieldsFetchedKeyRef = useRef("");
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading");
  
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [downloadImagesMessage, setDownloadImagesMessage] = useState<string | null>(null);
  const mediaItemsLengthRef = useRef(0);
  const mediaDragRef = useRef<{ id: number; startX: number; startY: number; lastX: number; lastAt: number; velocity: number } | null>(null);
  const suppressMediaClickRef = useRef(false);

    function moveMedia(direction: -1 | 1) {
      const count = mediaItemsLengthRef.current;
      const targetIndex = activeIndex + direction;
      if (count < 2 || targetIndex < 0 || targetIndex >= count || mediaSlideDirection !== 0 || mediaSnappingBack) return;
      setMediaDragX(0);
      setMediaSlideDirection(direction);
    }

    function goPrevMedia() {
      moveMedia(-1);
    }

    function goNextMedia() {
      moveMedia(1);
    }

    function handleViewerPointerDown(e: any) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as HTMLElement)?.closest?.("button")) return;
      if (mediaItemsLengthRef.current < 2 || mediaSlideDirection !== 0 || mediaSnappingBack) return;

      mediaDragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastAt: performance.now(), velocity: 0 };
      suppressMediaClickRef.current = false;
      showMediaControlsTemporarily();

      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {}
    }

    function handleViewerPointerMove(e: any) {
      const drag = mediaDragRef.current;
      if (!drag || drag.id !== e.pointerId || mediaSlideDirection !== 0) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
      const now = performance.now();
      drag.velocity = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastAt);
      drag.lastX = e.clientX;
      drag.lastAt = now;
      if (Math.abs(dx) > 5) suppressMediaClickRef.current = true;
      const atStart = activeIndex === 0 && dx > 0;
      const atEnd = activeIndex === mediaItemsLengthRef.current - 1 && dx < 0;
      setMediaDragX(atStart || atEnd ? dx * 0.22 : dx);
    }

    function handleViewerPointerUp(e: any) {
      const drag = mediaDragRef.current;
      if (!drag || drag.id !== e.pointerId) return;
      const dx = drag.lastX - drag.startX;
      const dy = e.clientY - drag.startY;
      const direction: -1 | 1 = dx < 0 ? 1 : -1;
      const targetIndex = activeIndex + direction;
      const canMove = targetIndex >= 0 && targetIndex < mediaItemsLengthRef.current;
      const shouldMove = canMove && Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > 45 || Math.abs(drag.velocity) > 0.35);
      mediaDragRef.current = null;

      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {}
      if (shouldMove) moveMedia(direction);
      else if (Math.abs(dx) > 0.5) {
        setMediaSnappingBack(true);
        setMediaDragX(0);
      } else {
        setMediaDragX(0);
      }
    }

    function handleViewerPointerCancel(e?: any) {
      mediaDragRef.current = null;
      setMediaSnappingBack(suppressMediaClickRef.current);
      setMediaDragX(0);

      try {
        if (e?.currentTarget?.releasePointerCapture && e?.pointerId != null) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }

    function finishMediaSlide() {
      if (mediaSnappingBack) {
        setMediaSnappingBack(false);
        return;
      }
      if (mediaSlideDirection === 0) return;
      setActiveIndex((index) => index + mediaSlideDirection);
      setMediaSlideDirection(0);
    }

  
//=========== Màu modal chi tiết =========//
  const ROOM_THEME = {
  modalBg: "#a06a29be",
  modalBgInner: "#74573094",
  modalText: "#fcf6ef",
  modalMutedText: "rgba(255, 246, 234, 0.9)",
  modalBorder: "rgba(255,233,214,0.14)",
  modalAccent: "#38BDF8",
  modalAccentSoft: "rgba(56,189,248,0.18)",

  shareBg: "rgba(86,57,36,0.30)",
  shareHeaderBg: "rgba(255,255,255,0.05)",
  shareButtonBg: "rgba(200,155,109,0.22)",
  shareButtonBorder: "rgba(255,233,214,0.18)",
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
  setShowOpenBrowserBar(detectInAppBrowser());
}, []);

const [shareOpen, setShareOpen] = useState(false);
const [toast, setToast] = useState<string | null>(null);
const [showOpenBrowserBar, setShowOpenBrowserBar] = useState(false);
const [goingHome, setGoingHome] = useState(false);

const [zaloMenuOpen, setZaloMenuOpen] = useState(false);

const zaloMenuRef = useRef<HTMLDivElement | null>(null);
const zaloMenuButtonRef = useRef<HTMLButtonElement | null>(null);
const zaloMenuPanelRef = useRef<HTMLDivElement | null>(null);

const [zaloMenuPosition, setZaloMenuPosition] = useState({
  top: 0,
  left: 0,
});

const updateZaloMenuPosition = useCallback(() => {
  const button = zaloMenuButtonRef.current;

  if (!button) return;

  const rect = button.getBoundingClientRect();

  const menuWidth = 230;
  const viewportGap = 12;
  const menuGap = 8;

  const measuredMenuHeight =
    zaloMenuPanelRef.current?.offsetHeight ?? 260;

  const maxLeft = Math.max(
    viewportGap,
    window.innerWidth - menuWidth - viewportGap
  );

  const left = Math.min(
    Math.max(viewportGap, rect.right - menuWidth),
    maxLeft
  );

  let top = rect.bottom + menuGap;

  // Nếu phía dưới không đủ chỗ thì mở dropdown lên phía trên nút.
  if (
    top + measuredMenuHeight >
    window.innerHeight - viewportGap
  ) {
    top = Math.max(
      viewportGap,
      rect.top - measuredMenuHeight - menuGap
    );
  }

  setZaloMenuPosition({
    top,
    left,
  });
}, []);

useEffect(() => {
  if (!zaloMenuOpen) return;

  updateZaloMenuPosition();

  const frameId = window.requestAnimationFrame(() => {
    updateZaloMenuPosition();
  });

  const handleOutsideClick = (
    event: MouseEvent | TouchEvent
  ) => {
    const target = event.target as Node | null;

    if (!target) return;

    const clickedButtonArea =
      zaloMenuRef.current?.contains(target) ?? false;

    const clickedMenuPanel =
      zaloMenuPanelRef.current?.contains(target) ?? false;

    if (!clickedButtonArea && !clickedMenuPanel) {
      setZaloMenuOpen(false);
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setZaloMenuOpen(false);
    }
  };

  document.addEventListener(
    "mousedown",
    handleOutsideClick
  );

  document.addEventListener(
    "touchstart",
    handleOutsideClick
  );

  window.addEventListener(
    "keydown",
    handleEscape
  );

  window.addEventListener(
    "resize",
    updateZaloMenuPosition
  );

  /*
   * true: cập nhật vị trí khi bất kỳ container cha nào cuộn,
   * bao gồm phần thông tin phòng overflow-y-auto.
   */
  window.addEventListener(
    "scroll",
    updateZaloMenuPosition,
    true
  );

  return () => {
    window.cancelAnimationFrame(frameId);

    document.removeEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.removeEventListener(
      "touchstart",
      handleOutsideClick
    );

    window.removeEventListener(
      "keydown",
      handleEscape
    );

    window.removeEventListener(
      "resize",
      updateZaloMenuPosition
    );

    window.removeEventListener(
      "scroll",
      updateZaloMenuPosition,
      true
    );
  };
}, [
  zaloMenuOpen,
  updateZaloMenuPosition,
]);

const roomShareUrl =
  typeof window !== "undefined" ? window.location.href : "";

function showToast(msg: string, duration = 4200) {
  setToast(msg);
  window.setTimeout(() => setToast(null), duration);
}

const [mediaControlsVisible, setMediaControlsVisible] = useState(false);
const mediaControlsTimerRef = useRef<number | null>(null);

function showMediaControlsTemporarily() {
  setMediaControlsVisible(true);

  if (mediaControlsTimerRef.current) {
    window.clearTimeout(mediaControlsTimerRef.current);
  }

  mediaControlsTimerRef.current = window.setTimeout(() => {
    setMediaControlsVisible(false);
  }, 1000);
}

useEffect(() => {
  return () => {
    if (mediaControlsTimerRef.current) {
      window.clearTimeout(mediaControlsTimerRef.current);
    }
  };
}, []);


function detectInAppBrowser() {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const low = ua.toLowerCase();

  const isMessenger =
    low.includes("messenger") ||
    low.includes("fbav") ||
    low.includes("fban");

  const isZalo =
    low.includes("zalo") ||
    low.includes("zalopay") ||
    low.includes("zaloandroid") ||
    low.includes("zalo iossdk");

  return isMessenger || isZalo;
}

function detectMobileOS() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";

  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

async function handleOpenExternalBrowser() {
  const url =
    typeof window !== "undefined" ? window.location.href : roomShareUrl || "";

  if (!url) {
    showToast("Không lấy được link phòng");
    return;
  }

  const copied = await copyText(url);
  const os = detectMobileOS();

  if (copied) {
    if (os === "ios") {
      showToast("Đã copy link — mở bằng Safari để xem đầy đủ");
    } else if (os === "android") {
      showToast("Đã copy link — mở bằng Chrome để xem đầy đủ");
    } else {
      showToast("Đã copy link — mở bằng trình duyệt ngoài");
    }
  } else {
    showToast("Hãy mở link này bằng trình duyệt ngoài");
  }
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


  useEffect(() => {
  const checkAdmin = async () => {
    if (!user?.id) {
      setAdminLevel(0);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("get_my_admin_level");
      if (error) throw error;

      const rawLevel = Number(data ?? 0);
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


  // ✅ Fetch room detail (ổn định + không kẹt loading)
useEffect(() => {
  if (!id) return;

  const myReq = ++roomReqIdRef.current;

  // set trạng thái ngay khi bắt đầu request mới
  setFetchStatus("loading");
  setRoom(null);
  setActiveIndex(0);

  (async () => {
        try {
      // Tái sử dụng request đã prefetch từ card để modal có dữ liệu sớm hơn.
      const data = await loadRoomDetailFast(id);

      // ✅ nếu không phải request mới nhất -> bỏ qua
      if (myReq !== roomReqIdRef.current) return;

      setRoom(data ?? null);
    } catch (e) {
      if (myReq !== roomReqIdRef.current) return;
      console.error("fetchRoom exception:", e);
      setRoom(null);
    } finally {
      if (myReq === roomReqIdRef.current) {
        setFetchStatus("done");
      }
    }
  })();
}, [id]);

// Luôn phân giải qua endpoint để ưu tiên tọa độ tòa nhà trước link thủ công.
useEffect(() => {
  if (!room?.id) return;

  let cancelled = false;

  void fetch(`/api/rooms/${encodeURIComponent(room.id)}/google-maps`, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<{ googleMapsUrl?: string | null }>;
    })
    .then((body) => {
      const googleMapsUrl = normalizeGoogleMapsUrl(body?.googleMapsUrl);
      if (cancelled || !googleMapsUrl) return;
      setRoom((previous: any) =>
        previous ? { ...previous, google_maps_url: googleMapsUrl } : previous,
      );
    })
    .catch(() => {
      // Toolbar vẫn dùng được cho các thao tác công khai khác nếu Maps lỗi.
    });

  return () => {
    cancelled = true;
  };
}, [room?.id]);

 const detail =
  (room?.room_detail ??
    room?.room_details ?? // ✅ phòng trường hợp RPC trả key số nhiều
    room?.detail ??
    room?.details ??
    {}) as any;

// ✅ Patch 4: nếu RPC không trả link_zalo / zalo_phone cho admin => fallback đọc thẳng từ rooms
useEffect(() => {
  if (!canSeePrivateFields) return;
  if (!room?.id) return;

  const fetchKey = `${room.id}:${currentUserIdValue}:${adminLevel}`;
  if (privateFieldsFetchedKeyRef.current === fetchKey) return;

  const hasAny =
    String(room?.link_zalo ?? "").trim() &&
    String(room?.zalo_phone ?? "").trim() &&
    String(room?.google_maps_url ?? "").trim();
  if (hasAny) return;
  privateFieldsFetchedKeyRef.current = fetchKey;

  let cancelled = false;

  (async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("link_zalo, zalo_phone, google_maps_url, is_hidden")
        .eq("id", room.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) return;
      if ((data as any)?.is_hidden) return;

      const link_zalo = String((data as any)?.link_zalo ?? "").trim() || null;
      const zalo_phone = String((data as any)?.zalo_phone ?? "").trim() || null;
      const google_maps_url =
        String((data as any)?.google_maps_url ?? "").trim() || null;

      if (link_zalo || zalo_phone || google_maps_url) {
        setRoom((prev: any) =>
          prev
            ? {
                ...prev,
                link_zalo: prev?.link_zalo ?? link_zalo,
                zalo_phone: prev?.zalo_phone ?? zalo_phone,
                google_maps_url:
                  prev?.google_maps_url ?? google_maps_url,
              }
            : prev
        );
      }
    } catch {
      // ignore
    }
  })();

  return () => {
    cancelled = true;
  };
}, [
  canSeePrivateFields,
  adminLevel,
  currentUserIdValue,
  room?.id,
  room?.link_zalo,
  room?.zalo_phone,
  room?.google_maps_url,
]);

 const imageUrls = useMemo<string[]>(() => {
  // ✅ Ưu tiên room.media từ view room_media_agg
  // Vì view này đã lấy từ bảng room_media và có is_cover + sort_order
  if (Array.isArray(room?.media)) {
    const fromMedia: string[] = room.media
      .filter((m: any) => {
        const type = String(m?.type ?? m?.kind ?? "").toLowerCase();
        const url = String(m?.url ?? "").trim();

        return type === "image" && Boolean(url);
      })
      .sort((a: any, b: any) => {
        // 1) Ảnh cover lên trước
        const aCover = a?.is_cover === true ? 0 : 1;
        const bCover = b?.is_cover === true ? 0 : 1;

        if (aCover !== bCover) return aCover - bCover;

        // 2) Sau đó sort theo sort_order
        const aSort = Number.isFinite(Number(a?.sort_order))
          ? Number(a.sort_order)
          : 999999;

        const bSort = Number.isFinite(Number(b?.sort_order))
          ? Number(b.sort_order)
          : 999999;

        if (aSort !== bSort) return aSort - bSort;

        // 3) Fallback theo created_at nếu có
        const aTime = new Date(String(a?.created_at ?? "")).getTime();
        const bTime = new Date(String(b?.created_at ?? "")).getTime();

        const safeATime = Number.isFinite(aTime) ? aTime : 0;
        const safeBTime = Number.isFinite(bTime) ? bTime : 0;

        return safeATime - safeBTime;
      })
      .map((m: any) => String(m.url).trim())
      .filter((url: string) => Boolean(url));

    if (fromMedia.length) {
      // ✅ Chống trùng URL nếu dữ liệu cũ bị duplicate
      return Array.from(new Set<string>(fromMedia));
    }
  }

  // ✅ Fallback cuối cùng cho dữ liệu cũ nếu RPC/view nào đó vẫn trả image_urls
  return normalizeImageUrls(room?.image_urls);
}, [room?.media, room?.image_urls]);


const videoUrls = useMemo(() => {
  const singleVideoUrl = String(room?.video_url ?? "").trim();
  if (singleVideoUrl) return [singleVideoUrl];

  const v = normalizeVideoUrls(room?.video_urls);
  if (v.length) return v;

  const v2 = mediaToVideoUrls(room?.media);
  if (v2.length) return v2;

  return [];
}, [room?.video_url, room?.video_urls, room?.media]);


const mediaItems: MediaItem[] = useMemo(() => {
  const R2_BASE =
    (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
      "")?.replace(/\/$/, "") || "";

  const r2Thumb =
    R2_BASE && room?.id
      ? `${R2_BASE}/rooms/${room.id}/images/thumb.webp`
      : "";

  const rpcThumb = String(room?.thumb_url ?? "").trim();
  const thumb = rpcThumb || r2Thumb || "";

  const vids: MediaItem[] = videoUrls.map((url: string) => ({
    kind: "video",
    url,
    thumb,
  }));

  const imgs: MediaItem[] = imageUrls.map((url: string) => ({
    kind: "image",
    url,
  }));

  return [...vids, ...imgs];
}, [videoUrls, imageUrls, room?.id, room?.thumb_url]);

const activeItem = useMemo(() => {
  if (!mediaItems.length) return null;
  const safeIndex = Math.min(Math.max(activeIndex, 0), mediaItems.length - 1);
  return mediaItems[safeIndex];
}, [activeIndex, mediaItems]);

const previousMediaIndex = Math.max(activeIndex - 1, 0);
const nextMediaIndex = Math.min(activeIndex + 1, Math.max(mediaItems.length - 1, 0));
const visibleMediaIndexes = mediaItems.length > 1
  ? [previousMediaIndex, activeIndex, nextMediaIndex]
  : [activeIndex];
const mediaTrackTransform = mediaSlideDirection === 1
  ? "translate3d(-200%,0,0)"
  : mediaSlideDirection === -1
    ? "translate3d(0,0,0)"
    : `translate3d(calc(-100% + ${mediaDragX}px),0,0)`;

useEffect(() => {
  if (mediaItems.length < 2) return;
  [mediaItems[previousMediaIndex], mediaItems[nextMediaIndex]].forEach((item) => {
    if (!item || item.kind !== "image") return;
    const image = new window.Image();
    image.src = item.url;
    void image.decode?.().catch(() => undefined);
  });
}, [mediaItems, nextMediaIndex, previousMediaIndex]);

useEffect(() => {
  mediaItemsLengthRef.current = mediaItems.length;
}, [mediaItems.length]);

useEffect(() => {
  mediaItemsLengthRef.current = mediaItems.length;
}, [mediaItems.length]);

// ===== RENDER GUARD =====

if (!id || fetchStatus === "loading") {
  return (
    <div className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/45 px-0 pb-0 pt-[52px]">
      <div
        className="
          relative
          w-screen max-w-none
          md:w-[720px] md:max-w-[calc(100vw-48px)]
          h-[calc(100dvh-52px)]
          overflow-hidden rounded-t-[28px]
          border-x border-t border-b-0 border-white/15
          bg-[#E9D7C3]
          shadow-[0_-24px_80px_rgba(0,0,0,0.55)]
          animate-[slideUp_0.22s_ease-out]
        "
      >
        <div className="p-3 space-y-3">
          <div className="h-[clamp(300px,35dvh,350px)] md:h-[400px] rounded-[18px] bg-white/10 animate-pulse" />

          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[66px] w-[82px] shrink-0 rounded-[10px] bg-white/10 animate-pulse"
              />
            ))}
          </div>

          <div className="space-y-3 px-2 pt-2">
            <div className="h-7 w-32 rounded-full bg-white/10 animate-pulse" />
            <div className="h-4 w-full rounded-full bg-white/10 animate-pulse" />
            <div className="h-4 w-[75%] rounded-full bg-white/10 animate-pulse" />

            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="h-8 rounded-full bg-white/10 animate-pulse" />
              <div className="h-8 rounded-full bg-white/10 animate-pulse" />
              <div className="h-8 rounded-full bg-white/10 animate-pulse" />
              <div className="h-8 rounded-full bg-white/10 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const formatTimeAgo = (value?: string | null) => {
  if (!value) return "";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "vừa cập nhật";
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30) return `${days} ngày trước`;

  return date.toLocaleDateString("vi-VN");
};

if (!room) return <div className="p-6 text-base">Không tìm thấy phòng</div>;


  const roomCode = room?.room_code ?? room?.code ?? room?.roomCode ?? "";
  const roomType = room?.room_type ?? room?.type ?? room?.roomType ?? "";
  const statusText = humanStatus(room?.status);
  const priceText = formatVND(room?.price);
  const updatedText = formatTimeAgo(room?.updated_at);
  
const houseNumber =
  room?.house_number ??
  room?.houseNumber ??
  detail?.house_number ??
  detail?.houseNumber ??
  "";


const maskedHouseNumber = publicHouseNumber(houseNumber);

const addressLine = joinParts([
  adminLevel === 1 || adminLevel === 2
    ? [houseNumber, room?.address].filter(Boolean).join(" ")
    : [maskedHouseNumber, room?.address].filter(Boolean).join(" "),
  formatWard(room?.ward),
  room?.district,
]);

  const descriptionText = room?.description ?? detail?.description ?? room?.desc ?? "";

  const feeRows: Array<{ label: string; value: string }> = [];

if (detail?.electric_fee_value != null) {
  feeRows.push({
    label: "⚡ Điện",
    value: `${formatVND(detail.electric_fee_value)}${
      detail?.electric_fee_unit
        ? ` / ${feeUnitLabel(detail.electric_fee_unit)}`
        : ""
    }`,
  });
}

if (detail?.water_fee_value != null) {
  feeRows.push({
    label: "💧 Nước",
    value: `${formatVND(detail.water_fee_value)}${
      detail?.water_fee_unit
        ? ` / ${feeUnitLabel(detail.water_fee_unit)}`
        : ""
    }`,
  });
}

if (detail?.service_fee_value != null) {
  feeRows.push({
    label: "🧾 Dịch vụ",
    value: `${formatVND(detail.service_fee_value)}${
      detail?.service_fee_unit
        ? ` / ${feeUnitLabel(detail.service_fee_unit)}`
        : ""
    }`,
  });
}

if (detail?.parking_fee_value != null) {
  feeRows.push({
    label: "🏍️ Gửi xe",
    value: `${formatVND(detail.parking_fee_value)}${
      detail?.parking_fee_unit
        ? ` / ${feeUnitLabel(detail.parking_fee_unit)}`
        : " / xe"
    }`,
  });
}

if (
  detail?.other_fee_value != null ||
  detail?.other_fee_note
) {
  const otherFeeValue = Number(detail?.other_fee_value ?? 0);

  const valuePart =
    otherFeeValue > 0 ? formatVND(otherFeeValue) : "";

  const notePart = detail?.other_fee_note
    ? String(detail.other_fee_note).trim()
    : "";

  const otherValue = [valuePart, notePart]
    .filter(Boolean)
    .join(valuePart && notePart ? "\n" : "");

  if (otherValue) {
    feeRows.push({
      label: "➕ Khác",
      value: otherValue,
    });
  }
}

  const isAdmin = adminLevel === 1 || adminLevel === 2;
  const googleMapsUrl = normalizeGoogleMapsUrl(room?.google_maps_url);

  const visibleLinkZalo = canSeePrivateFields
  ? String(room?.link_zalo ?? "").trim() || null
  : null;

const visibleZaloPhone = canSeePrivateFields
  ? String(room?.zalo_phone ?? "").trim() || null
  : null;
const visibleZaloPhones = extractContactPhones(visibleZaloPhone);
const phoneModalPhones = extractContactPhones(phoneModal);

/*
 * Field link_zalo có thể chứa:
 * - Link nhóm Zalo
 * - Google Drive
 * - Google Docs
 * - Google Sheet
 * - Các URL khác
 *
 * Hỗ trợ phân cách bằng:
 * - Xuống dòng
 * - Khoảng trắng
 * - Dấu phẩy
 * - Dấu chấm phẩy
 */
const rawStoredLinks = extractRoomActionUrls(visibleLinkZalo);

/*
 * Đếm số link cùng loại để tự đánh số:
 * Nhóm Zalo 1, Nhóm Zalo 2...
 * Google Drive 1, Google Drive 2...
 */
const storedLinkTypeTotals = rawStoredLinks.reduce<Record<string, number>>(
  (result, url) => {
    const type = detectLinkType(url);
    result[type] = (result[type] ?? 0) + 1;
    return result;
  },
  {}
);

const storedLinkTypeSeen: Record<string, number> = {};

const storedLinks = rawStoredLinks.map((url) => {
  const type = detectLinkType(url);

  storedLinkTypeSeen[type] =
    (storedLinkTypeSeen[type] ?? 0) + 1;

  const baseName = getStoredLinkName(type);
  const sameTypeCount = storedLinkTypeTotals[type] ?? 0;
  const currentTypeIndex = storedLinkTypeSeen[type];

  return {
    url,
    type,
    badge: getStoredLinkBadge(type),
    label:
      sameTypeCount > 1
        ? `${baseName} ${currentTypeIndex}`
        : baseName,
  };
});

const onlyZaloLinks =
  storedLinks.length > 0 &&
  storedLinks.every((item) => item.type === "zalo");

  function renderCopyIcon(text: string, successMessage: string) {
  const value = String(text ?? "").trim();

  return (
    <button
      type="button"
      disabled={!value}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const ok = await copyText(value);

        showToast(
          ok
            ? successMessage
            : "Không thể copy — hãy copy thủ công"
        );
      }}
      className="
        !min-h-0 !h-[20px] !w-[20px]
        ml-1 inline-flex shrink-0 align-[-2px]
        items-center justify-center
        rounded-[3px]
        bg-white/10
        text-white/75
        backdrop-blur-[10px]
        transition
        hover:bg-white/20 hover:text-white
        active:scale-90
        disabled:cursor-not-allowed disabled:opacity-30
      "
      title="Copy"
      aria-label="Copy"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[20px] w-[20px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="8" y="8" width="11" height="11" rx="2.5" />
        <path d="M5 16V7.5A2.5 2.5 0 0 1 7.5 5H16" />
      </svg>
    </button>
  );
}

const feeCopyText = feeRows
  .map((r) => `${r.label}: ${r.value}`)
  .join("\n");

const amenitiesList = [
  detail?.has_elevator ? "Thang máy" : "",
  detail?.has_stairs ? "Thang bộ" : "",
  detail?.shared_washer ? "Máy giặt chung" : "",
  detail?.private_washer ? "Máy giặt riêng" : "",
  detail?.shared_dryer ? "Máy sấy chung" : "",
  detail?.private_dryer ? "Máy sấy riêng" : "",
  detail?.has_parking ? "Bãi xe" : "",
  detail?.has_basement ? "Hầm xe" : "",
  detail?.fingerprint_lock ? "Cửa vân tay" : "",
  detail?.free_time ? "Giờ giấc tự do" : "",
  detail?.allow_pet ? "Nuôi thú cưng" : "",
  detail?.allow_cat ? "Nuôi mèo" : "",
  detail?.allow_dog ? "Nuôi chó" : "",
  detail?.no_pet ? "Không thú cưng" : "",
  detail?.short_term ? "Ngắn hạn" : "",
  detail?.long_term ? "Dài hạn" : "",
].filter(Boolean);

const otherAmenitiesText = detail?.other_amenities
  ? String(detail.other_amenities).trim()
  : "";

const amenitiesCopyText = [
  ...amenitiesList.map((x) => `✔️ ${x}`),
  otherAmenitiesText
    ? `Tiện ích khác:\n${otherAmenitiesText}`
    : "",
]
  .filter(Boolean)
  .join("\n");

const policyCopyText = room?.chinh_sach?.trim()
  ? room.chinh_sach.trim()
  : "";

async function downloadRoomImagesToDevice() {
  if (!imageUrls.length || downloadingImages) return;
  setDownloadingImages(true);
  setDownloadImagesMessage(`Đang chuẩn bị 0/${imageUrls.length} ảnh...`);
  try {
    const files: File[] = [];
    for (let index = 0; index < imageUrls.length; index += 1) {
      files.push(await homeRoomImageFile(imageUrls[index], room?.room_code || room?.id || id, index));
      setDownloadImagesMessage(`Đang chuẩn bị ${index + 1}/${imageUrls.length} ảnh...`);
    }

    const canShareFiles = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files });
    if (canShareFiles) {
      try {
        await navigator.share({ title: `Ảnh phòng ${room?.room_code || ""}`, files });
        setDownloadImagesMessage("Đã mở bảng lưu/chia sẻ ảnh của thiết bị.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
      }
    }

    files.forEach((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      window.setTimeout(() => {
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      }, index * 180);
    });
    setDownloadImagesMessage(`Đang tải ${files.length} ảnh riêng biệt. Nếu trình duyệt hỏi, hãy cho phép tải nhiều tệp.`);
  } catch (error) {
    setDownloadImagesMessage(error instanceof DOMException && error.name === "AbortError" ? "Bạn đã đóng bảng lưu ảnh." : error instanceof Error ? error.message : "Không thể tải ảnh phòng.");
  } finally {
    setDownloadingImages(false);
  }
}

async function homeRoomImageFile(url: string, roomCode: string, index: number) {
  const response = await fetch(`/api/share-image?url=${encodeURIComponent(url)}`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Không thể tải ảnh ${index + 1}.`);
  const blob = await response.blob();
  const mime = blob.type.toLowerCase();
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const safeRoomCode = String(roomCode || "phong").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "phong";
  return new File([blob], `phong-${safeRoomCode}-${String(index + 1).padStart(2, "0")}.${extension}`, { type: blob.type || "image/jpeg" });
}


return (
  <div
      data-room-detail-modal="true"
      className="
        fixed inset-0 z-[99999]
        flex items-end justify-center
        bg-black/55
        px-0 pb-0 pt-[20px]
        text-[#F4E7D6]
      "
      onClick={handleCloseModal}
    >
  <div
  className="
    relative flex flex-col overflow-hidden
    w-screen max-w-none
    md:w-[720px] md:max-w-[calc(100vw-48px)]
    h-[calc(100dvh-20px)]
    rounded-t-[28px]
    border-x border-t border-b-0
    shadow-[0_-24px_80px_rgba(0,0,0,0.55)]
    animate-[slideUp_0.22s_ease-out]
  "
    style={{
      background: ROOM_THEME.modalBg,
      borderColor: ROOM_THEME.modalBorder,
      color: ROOM_THEME.modalText,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ background: ROOM_THEME.modalBgInner }}
    />

      {!viewerOpen && (
      <button
        type="button"
        onClick={handleCloseModal}
        className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-[16px] shadow-[0_10px_30px_rgba(0,0,0,0.45)] hover:bg-black/50"
        aria-label="Đóng"
        title="Đóng"
      >
        ✕
      </button>
    )}


{!viewerOpen && (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();

      setGoingHome(true);

      requestAnimationFrame(() => {
        router.push("/");
      });
    }}
    className="
      absolute left-3 top-0.5 z-50
      flex h-8 items-center justify-center gap-1.5
      rounded-full border border-white/20
      bg-black/45 px-2
      text-[10px] font-semibold text-white
      backdrop-blur-[10px]
      shadow-[0_10px_30px_rgba(0,0,0,0.45)]
      hover:bg-black/50
      transition
    "
    aria-label="Về trang chủ"
    title="Về trang chủ"
  >
    <svg
  viewBox="0 0 24 24"
  className="h-5 w-5"
  fill="none"
  stroke="currentColor"
  strokeWidth="2.4"
  strokeLinecap="round"
  strokeLinejoin="round"
>
  <path d="M3 10.5 12 3l9 7.5" />
  <path d="M5 9.5V21h14V9.5" />
  <path d="M9 21v-6h6v6" />
</svg>
<span>Home</span>
  </button>
)}

      <div className="relative z-10 flex h-full min-h-0 flex-col">
  {/* ===== TOP: BLOCK ẢNH CỐ ĐỊNH ===== */}
<div className="shrink-0 p-3 pb-2">
  <div className="space-y-1">
    {mediaItems.length > 0 ? (
      <>
        <div
          className="relative w-full h-[clamp(300px,35dvh,350px)] md:h-[400px] rounded-[18px] overflow-hidden bg-black cursor-grab active:cursor-grabbing select-none"
          tabIndex={0}
          onPointerDown={handleViewerPointerDown}
          onPointerMove={handleViewerPointerMove}
          onPointerUp={handleViewerPointerUp}
          onPointerCancel={handleViewerPointerCancel}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goPrevMedia();
              return;
            }

            if (e.key === "ArrowRight") {
              e.preventDefault();
              goNextMedia();
              return;
            }

            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (activeItem?.kind !== "video") setViewerOpen(true);
              return;
            }

            if (e.key === "Escape" && viewerOpen) {
              e.preventDefault();
              setViewerOpen(false);
            }
          }}
          onClick={() => {
            if (suppressMediaClickRef.current) {
              suppressMediaClickRef.current = false;
              return;
            }
            if (activeItem?.kind !== "video") setViewerOpen(true);
          }}
          style={{ touchAction: "pan-y" }}
        >
          <div
            className={`flex h-full w-full will-change-transform ${mediaSlideDirection !== 0 || mediaSnappingBack ? "transition-transform duration-300 ease-out" : ""}`}
            style={{ transform: mediaItems.length > 1 ? mediaTrackTransform : undefined }}
            onTransitionEnd={() => { if (!viewerOpen) finishMediaSlide(); }}
          >
            {visibleMediaIndexes.map((mediaIndex, slot) => {
              const item = mediaItems[mediaIndex];
              const isCurrentSlide = mediaItems.length === 1 || slot === 1;
              return <div key={`${item.kind}-${item.url}-${slot}`} className="relative h-full w-full shrink-0 bg-black">
                {item.kind === "video" ? isCurrentSlide ? (
                  <div className="relative w-full h-full" onClick={(e) => { e.stopPropagation(); showOverlayAndMaybeHide(); }}>
                    {showPlay && item.thumb ? <img src={item.thumb} alt="" className="absolute inset-0 w-full h-full object-contain z-[1]" /> : null}
                    <video ref={videoRef} src={item.url} controls preload="metadata" playsInline poster={item.thumb || undefined} className="w-full h-full object-contain bg-black" onPlay={() => { setShowPlay(false); showOverlayAndMaybeHide(); }} onPause={() => { setShowPlay(true); setOverlayVisible(true); clearOverlayTimer(); }} onEnded={() => { setShowPlay(true); setOverlayVisible(true); clearOverlayTimer(); }} />
                    {(overlayVisible || showPlay) && <button className="absolute inset-0 z-[2] m-auto w-16 h-16 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center border border-white/40 backdrop-blur" onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (!v) return; setOverlayVisible(true); clearOverlayTimer(); if (v.paused) { void v.play(); setShowPlay(false); scheduleHideOverlay(1500); } else { v.pause(); setShowPlay(true); } }} aria-label={showPlay ? "Phát video" : "Tạm dừng video"} title={showPlay ? "Phát" : "Tạm dừng"}>{showPlay ? "▶" : "⏸"}</button>}
                  </div>
                ) : (
                  <img src={item.thumb || ""} alt="" className="h-full w-full object-contain bg-black" draggable={false} />
                ) : (
                  <img src={item.url} alt={room?.room_code || ""} className="w-full h-full object-contain bg-black" loading={isCurrentSlide ? "eager" : "lazy"} fetchPriority={isCurrentSlide ? "high" : "auto"} draggable={false} />
                )}
              </div>;
            })}
          </div>

          {activeItem?.kind === "image" && (
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          )}

          {mediaControlsVisible && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-white bg-black/40 px-2 py-1 rounded pointer-events-none">
              {activeIndex + 1} / {mediaItems.length}
            </div>
          )}

          {mediaControlsVisible && activeIndex > 0 && (
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

          {mediaControlsVisible && activeIndex < mediaItems.length - 1 && (
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

          {/* Ngày cập nhật: góc dưới bên phải ảnh chính */}
            {updatedText && (
              <div
                className="
                  pointer-events-none
                  absolute bottom-3 right-3 z-20
                  max-w-[calc(100%-24px)]
                  rounded-full
                  border border-white/20
                  bg-black/50
                  px-2.5 py-1
                  text-[11px] font-medium text-white/90
                  backdrop-blur-[10px]
                  shadow-[0_6px_20px_rgba(0,0,0,0.35)]
                "
              >
                Đã cập nhật: {updatedText}
              </div>
            )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0">
          {mediaItems.slice(0, 20).map((it, idx) => (
            <button
              key={it.kind + it.url + idx}
              className={[
                "relative flex-none w-[82px] h-[66px] rounded-[10px] overflow-hidden border bg-black",
                idx === activeIndex
                  ? "border-[#D7B08A] ring-2 ring-[#D7B08A]"
                  : "border-white/25",
              ].join(" ")}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Xem ${it.kind === "video" ? "video" : "ảnh"} ${idx + 1}`}
            >
              {it.kind === "video" ? (
                <>
                  <img
                    src={it.thumb || ""}
                    className="w-full h-full object-cover"
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
                  className="w-full h-full object-cover"
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
</div>

  {/* ===== BOTTOM: PHẦN THÔNG TIN CUỘN ===== */}
  <div
    ref={scrollRef}
    className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-transparent pb-3 [-webkit-overflow-scrolling:touch]"
  >
    <div className="px-3 space-y-2 text-sm text-white">
      {showOpenBrowserBar && (
        <div className="
          sticky top-2 z-40
          rounded-2xl
          border border-white/20
          bg-white/10
          backdrop-blur-xl
          shadow-[0_8px_30px_rgba(0,0,0,0.12)]
          ring-1 ring-white/20
        ">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-4">
            <div className="text-sm text-white/90">
              <div className="font-semibold">
                Mở bằng trình duyệt ngoài để xem đầy đủ thông tin
              </div>
              <div className="text-white/70">
                Zalo / Messenger đang mở web trong app nên có thể thiếu một số thông tin.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openExternalBrowser(roomShareUrl || window.location.href)}
                className="
                  rounded-xl
                  bg-black/80
                  backdrop-blur-md
                  px-4 py-2
                  text-sm font-medium text-white
                  shadow-lg
                  hover:bg-black
                  transition
                "
              >
                Mở trình duyệt
              </button>

              <button
                type="button"
                onClick={async () => {
                  const ok = await copyText(roomShareUrl || window.location.href);

                  showToast(
                    ok
                      ? "Đã copy link phòng"
                      : "Không thể copy link — hãy copy thủ công"
                  );
                }}
                className="
                  rounded-xl
                  border border-white/20
                  bg-white/10
                  backdrop-blur-md
                  px-4 py-2
                  text-sm font-medium text-white
                  hover:bg-white/20
                  transition
                "
              >
                Copy link
              </button>

              <button
                type="button"
                onClick={() => setShowOpenBrowserBar(false)}
                className="
                  rounded-xl
                  border border-white/10
                  bg-white/10
                  text-white/80
                  px-3 py-2 text-sm
                  hover:bg-white/20
                  transition
                "
                aria-label="Đóng"
                title="Đóng"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOOLBAR CHỨC NĂNG ===== */}
        {(
          <div className="relative z-30 flex w-full min-w-0 items-center justify-start gap-2 overflow-x-auto overscroll-x-contain py-1 sm:justify-end">
            {imageUrls.length > 0 && (
              <button
                type="button"
                disabled={downloadingImages}
                onClick={() => { setZaloMenuOpen(false); void downloadRoomImagesToDevice(); }}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 text-xs font-semibold text-white backdrop-blur-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition hover:bg-black/45 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                title={downloadingImages ? "Đang chuẩn bị ảnh..." : `Tải ${imageUrls.length} ảnh về thiết bị`}
                aria-label="Tải ảnh phòng về thiết bị"
              >
                {downloadingImages ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>}
                <span>{downloadingImages ? "Đang chuẩn bị" : "Tải ảnh"}</span>
              </button>
            )}

            {downloadImagesMessage ? <span role="status" className="max-w-[260px] shrink-0 truncate rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[10px] font-semibold text-white/85" title={downloadImagesMessage}>{downloadImagesMessage}</span> : null}

            {/* Chia sẻ */}
            <button
              type="button"
              onClick={() => {
                setZaloMenuOpen(false);
                setShareOpen(true);
              }}
              className="
                inline-flex h-9 shrink-0 items-center justify-center gap-1.5
                rounded-full
                border border-white/20
                bg-black/25
                px-3
                text-xs font-semibold text-white
                backdrop-blur-[14px]
                shadow-[0_8px_24px_rgba(0,0,0,0.25)]
                transition
                hover:bg-black/45
                active:scale-[0.97]
              "
              title="Chia sẻ phòng"
              aria-label="Chia sẻ phòng"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.1 15.4 17" />
                <path d="M15.4 7 8.6 10.9" />
              </svg>

              <span>Share</span>
            </button>

            {/* Google Maps */}
            {googleMapsUrl && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setZaloMenuOpen(false)}
                className="
                  inline-flex h-9 shrink-0 items-center justify-center gap-1.5
                  rounded-full
                  border border-white/20
                  bg-black/25
                  px-3
                  text-xs font-semibold text-white
                  backdrop-blur-[14px]
                  shadow-[0_8px_24px_rgba(0,0,0,0.25)]
                  transition
                  hover:bg-black/45
                  active:scale-[0.97]
                "
                title="Mở vị trí trong Google Maps"
                aria-label="Mở vị trí trong Google Maps"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span>GG Maps</span>
              </a>
            )}

            {storedLinks.length === 1 && (
              <a
                href={storedLinks[0].url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setZaloMenuOpen(false)}
                className={[
                  `
                    inline-flex h-9 items-center justify-center gap-1.5
                    rounded-full
                    border
                    px-3
                    text-xs font-semibold text-white
                    backdrop-blur-[14px]
                    shadow-[0_8px_24px_rgba(0,0,0,0.25)]
                    transition
                    active:scale-[0.97]
                  `,
                  storedLinks[0].type === "zalo"
                    ? "border-blue-300/30 bg-blue-500/20 hover:bg-blue-500/35"
                    : "border-white/20 bg-white/10 hover:bg-white/20",
                ].join(" ")}
                title={getLinkButtonLabel(storedLinks[0].type)}
              >
                <span
                  className={[
                    `
                      flex h-5 min-w-5 items-center justify-center
                      rounded-full px-1
                      text-[9px] font-bold
                    `,
                    storedLinks[0].type === "zalo"
                      ? "bg-blue-500/40 text-white"
                      : "bg-white/15 text-white/90",
                  ].join(" ")}
                >
                  {storedLinks[0].badge}
                </span>

                <span>{storedLinks[0].label}</span>
              </a>
            )}

            {/* Nhiều liên kết: nút mở dropdown */}
{storedLinks.length > 1 && (
  <div
    ref={zaloMenuRef}
    className="relative shrink-0"
  >
    <button
      ref={zaloMenuButtonRef}
      type="button"
      onClick={() => {
        if (!zaloMenuOpen) {
          updateZaloMenuPosition();
        }

        setZaloMenuOpen((current) => !current);
      }}
      className={[
        `
          inline-flex h-9 shrink-0
          items-center justify-center gap-1.5
          whitespace-nowrap
          rounded-full
          border
          px-3
          text-xs font-semibold text-white
          backdrop-blur-[14px]
          shadow-[0_8px_24px_rgba(0,0,0,0.25)]
          transition
          active:scale-[0.97]
        `,
        onlyZaloLinks
          ? "border-blue-300/30 bg-blue-500/20 hover:bg-blue-500/35"
          : "border-white/20 bg-white/10 hover:bg-white/20",
      ].join(" ")}
      aria-haspopup="menu"
      aria-expanded={zaloMenuOpen}
      title={
        onlyZaloLinks
          ? "Chọn nhóm Zalo"
          : "Chọn liên kết cần mở"
      }
    >
      <span
        className={[
          `
            flex h-5 min-w-5 shrink-0
            items-center justify-center
            rounded-full px-1
            text-[9px] font-bold
          `,
          onlyZaloLinks
            ? "bg-blue-500/40 text-white"
            : "bg-white/15 text-white/90",
        ].join(" ")}
      >
        {onlyZaloLinks ? "Z" : "🔗"}
      </span>

      <span className="whitespace-nowrap">
        {onlyZaloLinks
          ? "Nhóm Zalo"
          : "Zalo & File"}
      </span>

      <svg
        viewBox="0 0 24 24"
        className={[
          "h-3.5 w-3.5 shrink-0 transition-transform",
          zaloMenuOpen ? "rotate-180" : "",
        ].join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  </div>
)}
          </div>
        )}

        {/* Dropdown link được render ngoài toolbar để không bị overflow cắt */}
{zaloMenuOpen &&
  storedLinks.length > 1 &&
  typeof document !== "undefined" &&
  createPortal(
    <div
      ref={zaloMenuPanelRef}
      role="menu"
      style={{
        position: "fixed",
        top: zaloMenuPosition.top,
        left: zaloMenuPosition.left,
        width: 230,
      }}
      className="
        z-[2147483646]
        max-h-[min(320px,calc(100dvh-24px))]
        overflow-y-auto
        overscroll-contain
        rounded-2xl
        border border-white/25
        bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07)),rgba(86,57,36,0.42)]
        p-1.5
        text-white
        backdrop-blur-[28px]
        ring-1 ring-white/10
        shadow-[0_18px_50px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.22)]
        [-webkit-overflow-scrolling:touch]
      "
    >
      <div className="px-2 py-1.5 text-[11px] font-medium text-white/70">
        Chọn liên kết cần mở
      </div>

      {storedLinks.map((item, index) => (
        <a
          key={`${item.url}-${index}`}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          role="menuitem"
          onClick={() => {
            setZaloMenuOpen(false);
          }}
          className="
  flex items-center gap-2
  rounded-xl
  border border-transparent
  px-2.5 py-2
  text-xs font-medium text-white/90
  transition
  hover:border-white/15
  hover:bg-white/12
  active:bg-white/18
"
        >
          <span
            className={[
              `
                flex h-7 min-w-7 shrink-0
                items-center justify-center
                rounded-full px-1
                text-[9px] font-bold
              `,
              item.type === "zalo"
  ? "border border-blue-300/25 bg-blue-500/25 text-blue-100"
  : "border border-white/15 bg-white/12 text-white/85"
            ].join(" ")}
          >
            {item.badge}
          </span>

          <span className="min-w-0 flex-1 truncate">
            {item.label}
          </span>

          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-white/55"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3h7v7" />
            <path d="M10 14 21 3" />
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
        </a>
      ))}
    </div>,
    document.body
  )}

      <div
        className="
          rounded-2xl p-4 space-y-2
          border border-white/15
          bg-[rgba(255,255,255,0.04)]
          backdrop-blur-[28px]
          shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]
        "
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-[#F4E7D6]">
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
                  statusText === "Đang trống"
                    ? "bg-[rgba(34,197,94,0.18)] text-green-300 border border-green-400/30 backdrop-blur"
                    : statusText === "Sắp trống"
                    ? "bg-[rgba(234,179,8,0.18)] text-yellow-300 border border-yellow-400/30 backdrop-blur"
                    : "bg-[rgba(239,68,68,0.18)] text-red-300 border border-red-400/30 backdrop-blur",
                ].join(" ")}
                title={statusText}
              >
                {statusText}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="font-medium text-[#F4E7D6]">Giá:</span>
          <span
            className="font-semibold text-[20px]"
            style={{ color: ROOM_THEME.modalAccent }}
          >
            {formatVND(room?.price)}
          </span>
        </div>

        {addressLine && (
          <div className="flex items-start gap-1.5 text-[#F4E7D6] font-semibold">
            <div className="min-w-0 break-words">
              📍 {addressLine}
            </div>

            <span className="pt-[5px]">
              {renderCopyIcon(addressLine, "Đã copy địa chỉ")}
            </span>
          </div>
        )}

        {room.description && (
          <div className="mt-2 text-red-400 text-[15px] leading-snug whitespace-pre-line">
            {room.description}
          </div>
        )}
      </div>

      <div
        className="
          space-y-2 pt-2 mt-2
          border-t border-white/10
          bg-[rgba(255,255,255,0.03)]
          backdrop-blur-[20px]
          rounded-xl p-3
        "
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Chi phí</h2>
            {feeCopyText && renderCopyIcon(feeCopyText, "Đã copy chi phí")}
          </div>

          
        </div>

        {feeRows.length > 0 ? (
          <div className="space-y-1">
            {feeRows.map((r) => (
              <p key={r.label} className="leading-6">
                <span className="font-medium">{r.label}:</span>{" "}
                <span className="whitespace-pre-wrap break-words">
                  {r.value}
                </span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Đang cập nhật</p>
        )}
      </div>

      <div
        className="
          pt-4 mt-2
          border-t border-white/10
          bg-[rgba(255,255,255,0.02)]
          backdrop-blur-[18px]
          rounded-xl p-4
        "
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Tiện ích</h2>

          {amenitiesCopyText &&
            renderCopyIcon(amenitiesCopyText, "Đã copy tiện ích")}
        </div>

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
          {detail?.free_time && <li>✔️ Giờ giấc tự do</li>}
          {detail?.allow_pet && <li>✔️ Nuôi thú cưng</li>}
          {detail?.allow_cat && <li>✔️ Nuôi mèo</li>}
          {detail?.allow_dog && <li>✔️ Nuôi chó</li>}
          {detail?.no_pet && <li>✔️ Không thú cưng</li>}
          {detail?.short_term && <li>✔️ Ngắn hạn</li>}
          {detail?.long_term && <li>✔️ Dài hạn</li>}
          {detail?.other_amenities && (
            <li className="col-span-2 flex items-start gap-2">
              <span className="shrink-0">✔️</span>

              <div className="min-w-0">
                <div className="font-medium">Tiện ích khác:</div>

                <div className="whitespace-pre-wrap break-words">
                  {String(detail.other_amenities).trim()}
                </div>
              </div>
            </li>
          )}
        </ul>
      </div>

      {isAdmin && (
        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPolicyOpen(true)}
                className="
                  rounded-full px-4 py-2 text-sm font-semibold text-white
                  border border-white/25
                  bg-[rgba(255, 255, 255, 0.26)]
                  backdrop-blur-[20px]
                  shadow-[0_8px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]
                  hover:bg-[rgba(255, 255, 255, 0.38)]
                  active:scale-[0.97]
                  transition-all
                "
                title="Xem chính sách"
              >
                📄 Chính sách & Quy định
              </button>
            </div>
          </div>

          {canSeePrivateFields && (
            <div className="text-[#F4E7D6]">
              <div className="font-medium mb-1">
                SĐT chủ nhà
              </div>

              {visibleZaloPhones.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-1 text-red-400 font-semibold">
                  {visibleZaloPhones.map((phone, index) => (
                    <Fragment key={phone.dial}>
                      {index > 0 ? <span aria-hidden="true" className="text-[#C9A27E]">|</span> : null}
                      <button
                        type="button"
                        onClick={() => setPhoneModal(phone.dial)}
                        className="hover:text-red-300 hover:underline transition-colors"
                      >
                        {phone.display}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500">-</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
</div>


{viewerOpen && mediaItems.length > 0 && (
  <div
    className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 backdrop-blur-[14px]"
    onClick={() => setViewerOpen(false)}
  >
    <div
      className="relative flex h-full w-full items-center justify-center select-none cursor-grab active:cursor-grabbing"
      onPointerDown={handleViewerPointerDown}
      onPointerMove={handleViewerPointerMove}
      onPointerUp={handleViewerPointerUp}
      onPointerCancel={handleViewerPointerCancel}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
    >
      <div className={`flex h-full w-full will-change-transform ${mediaSlideDirection !== 0 || mediaSnappingBack ? "transition-transform duration-300 ease-out" : ""}`} style={{ transform: mediaItems.length > 1 ? mediaTrackTransform : undefined }} onTransitionEnd={() => { if (viewerOpen) finishMediaSlide(); }}>
        {visibleMediaIndexes.map((mediaIndex, slot) => {
          const item = mediaItems[mediaIndex];
          const isCurrentSlide = mediaItems.length === 1 || slot === 1;
          return <div key={`viewer-${item.kind}-${item.url}-${slot}`} className="relative flex h-full w-full shrink-0 items-center justify-center bg-black">
            {item.kind === "video" ? isCurrentSlide ? (
              <div className="relative h-full w-full" onClick={(e) => { e.stopPropagation(); showOverlayAndMaybeHide(); }}>
                <video ref={videoRef} src={item.url} controls playsInline preload="none" className="h-full w-full object-contain bg-black/40" onPlay={() => { setShowPlay(false); showOverlayAndMaybeHide(); }} onPause={() => { setShowPlay(true); setOverlayVisible(true); clearOverlayTimer(); }} onEnded={() => { setShowPlay(true); setOverlayVisible(true); clearOverlayTimer(); }} />
                {(overlayVisible || showPlay) && <button className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/35 bg-white/10 text-2xl text-white backdrop-blur-[24px] shadow-[0_18px_60px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.35)]" onClick={(e) => { e.stopPropagation(); const v = videoRef.current; if (!v) return; setOverlayVisible(true); clearOverlayTimer(); if (v.paused) { void v.play(); setShowPlay(false); scheduleHideOverlay(1500); } else { v.pause(); setShowPlay(true); } }} aria-label={showPlay ? "Phát video" : "Tạm dừng video"} title={showPlay ? "Phát" : "Tạm dừng"}>{showPlay ? "▶" : "⏸"}</button>}
              </div>
            ) : <img src={item.thumb || ""} alt="" className="h-full w-full object-contain" draggable={false} /> : <img src={item.url} alt={room?.title || room?.room_code || ""} className="h-full w-full object-contain select-none pointer-events-none" draggable={false} loading={isCurrentSlide ? "eager" : "lazy"} />}
          </div>;
        })}
      </div>

      <button
        className="absolute right-4 top-4 z-[2147483647] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl text-white backdrop-blur-[24px] shadow-[0_14px_45px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-white/18"
        onClick={() => setViewerOpen(false)}
      >
        ✕
      </button>

      {mediaControlsVisible && activeIndex > 0 && (
        <button
          className="absolute left-4 z-[2147483647] flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-3xl text-white backdrop-blur-[24px] shadow-[0_14px_45px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-white/18"
          onClick={goPrevMedia}
        >
          ‹
        </button>
      )}

      {mediaControlsVisible && activeIndex < mediaItems.length - 1 && (
        <button
          className="absolute right-4 z-[2147483647] flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 text-3xl text-white backdrop-blur-[24px] shadow-[0_14px_45px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-white/18"
          onClick={goNextMedia}
        >
          ›
        </button>
      )}
    </div>
  </div>
)}

{(adminLevel === 1 || adminLevel === 2) && (
  <ShareRoomModal
    open={shareOpen}
    onClose={() => setShareOpen(false)}
    room={room}
    images={imageUrls}
    videos={videoUrls}
    roomUrl={roomShareUrl}
    adminLevel={adminLevel === 1 || adminLevel === 2 ? adminLevel : 0}
    detail={detail}
  />
)}

{/* ===== TOAST ===== */}
{toast && (
  <div
    className="
      fixed z-[99999] bottom-6 left-1/2 -translate-x-1/2
      px-5 py-2.5 text-sm font-medium text-white
      rounded-full
      border border-white/20
      bg-[rgba(255, 255, 255, 0.2)]
      backdrop-blur-[20px]
      shadow-[0_8px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]
      animate-[fadeIn_0.25s_ease]
    "
  >
    {toast}
  </div>
)}

{goingHome && (
  <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
    <div className="rounded-2xl border border-white/20 bg-black/55 px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
      Đang về danh sách...
    </div>
  </div>
)}

{phoneModal && phoneModalPhones.length > 0 && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30"
    onClick={() => setPhoneModal(null)}
  >
    <div
      className="w-[92%] max-w-[360px] rounded-2xl 
      border border-white/10 
      bg-[linear-gradient(135deg,rgba(255, 255, 255, 0.88),rgba(255, 255, 255, 0.54)),rgba(58,33,18,0.45)] 
      backdrop-blur-2xl 
      shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] 
      p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-1 text-center text-[#4a392b] font-bold">
        {phoneModalPhones.map((phone, index) => (
          <Fragment key={phone.dial}>
            {index > 0 ? <span aria-hidden="true" className="text-[#80634a]">|</span> : null}
            <a href={`tel:${phone.dial}`} className="underline decoration-[#80634a]/50 underline-offset-2">
              {phone.display}
            </a>
          </Fragment>
        ))}
      </div>

      {phoneModalPhones.map((phone) => (
        <div key={phone.dial} className="grid grid-cols-3 gap-2">
          <a
            href={`tel:${phone.dial}`}
            className="rounded-xl bg-[#A47A52]/75 px-2 py-2 text-center text-xs font-bold text-white border border-[#E0B77A]/25 backdrop-blur hover:bg-[#B8895C]/85"
          >
            📞 Gọi
          </a>
          <a
            href={`https://zalo.me/${phone.dial}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-[#9c7048]/25 bg-white/45 px-2 py-2 text-center text-xs font-bold text-[#4a392b] backdrop-blur hover:bg-white/65"
          >
            💬 Zalo
          </a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(phone.dial);
            }}
            className="rounded-xl border border-[#9c7048]/25 bg-white/45 px-2 py-2 text-center text-xs font-bold text-[#4a392b] backdrop-blur hover:bg-white/65"
          >
            📋 Copy
          </button>
        </div>
      ))}
    </div>
  </div>
)}

{policyOpen && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 p-4"
    onClick={() => setPolicyOpen(false)}
  >
    <div
      className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl border border-white/10 bg-[rgb(232, 229, 227)] p-4 text-[#F6E7D2] shadow-[0_24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.10)] backdrop-blur-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-lg font-semibold text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
            Chính Sách
          </div>

          {renderCopyIcon(policyCopyText, "Đã copy chính sách")}
        </div>

        <button
          type="button"
          onClick={() => setPolicyOpen(false)}
          className="rounded-full px-3 py-1 text-xl text-[#F6E7D2] hover:bg-white/10 hover:text-white"
          aria-label="Đóng"
        >
          ×
        </button>
      </div>

      <div
        className="whitespace-pre-wrap break-words text-sm leading-6 select-text text-white/80"
        style={{
          WebkitUserSelect: "text",
          userSelect: "text",
          touchAction: "auto",
        }}
      >
        {room?.chinh_sach?.trim() ? room.chinh_sach : "Chưa có chính sách"}
      </div>
    </div>
  </div>
)}

        </div>
    </div>
  );
}
