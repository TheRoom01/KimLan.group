"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";

import { supabase } from "@/lib/supabase";
import { getBrowserContext, openExternalBrowser } from "@/lib/browser";

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
  if (type === "gsheet") return "Mở Google Sheet";
  if (type === "gdrive") return "Mở Google Drive";
  if (type === "gdoc") return "Mở Google Docs";
  return "Mở liên kết";
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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [phoneModal, setPhoneModal] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  const searchParams = useSearchParams();
  const isModal = searchParams.get("modal") === "1";

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [adminLevel, setAdminLevel] = useState(0);
  
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
  const [fetchStatus, setFetchStatus] = useState<"loading" | "done">("loading");
  
  const [downloadingImages, setDownloadingImages] = useState(false);
  const mediaItemsLengthRef = useRef(0);
  const viewerDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const viewerDragArmedRef = useRef(false);

    const touchStartXRef = useRef(0);

  const onTouchStart = (e: any) => {
    touchStartXRef.current = e.touches?.[0]?.clientX ?? 0;
    showMediaControlsTemporarily();
  };

  const onTouchEnd = (e: any) => {
    const endX = e.changedTouches?.[0]?.clientX ?? 0;
    const count = mediaItemsLengthRef.current;
    const startX = touchStartXRef.current;

    if (!count) return;

    const diffX = startX - endX;

    if (Math.abs(diffX) > 50) {
      showMediaControlsTemporarily();

      if (diffX > 0 && activeIndex < count - 1) {
        setActiveIndex((i: number) => i + 1);
      }

      if (diffX < 0 && activeIndex > 0) {
        setActiveIndex((i: number) => i - 1);
      }
    }
  };

    function goPrevMedia() {
      setActiveIndex((i) => Math.max(i - 1, 0));
    }

    function goNextMedia() {
      const count = mediaItemsLengthRef.current;
      setActiveIndex((i) => Math.min(i + 1, Math.max(count - 1, 0)));
    }

    function handleViewerPointerDown(e: any) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement)?.closest?.("button")) return;

      viewerDragStartRef.current = { x: e.clientX, y: e.clientY };
      viewerDragArmedRef.current = true;

      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {}
    }

    function handleViewerPointerUp(e: any) {
      if (e.pointerType !== "mouse") return;
      if (!viewerDragArmedRef.current || !viewerDragStartRef.current) return;

      if ((e.target as HTMLElement)?.closest?.("button")) {
        viewerDragArmedRef.current = false;
        viewerDragStartRef.current = null;
        return;
      }

      const dx = e.clientX - viewerDragStartRef.current.x;
      const dy = e.clientY - viewerDragStartRef.current.y;

      viewerDragArmedRef.current = false;
      viewerDragStartRef.current = null;

      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {}

      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;

      if (dx < 0) goNextMedia();
      else goPrevMedia();
    }

    function handleViewerPointerCancel(e?: any) {
      viewerDragArmedRef.current = false;
      viewerDragStartRef.current = null;

      try {
        if (e?.currentTarget?.releasePointerCapture && e?.pointerId != null) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
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

  // ===== SHARE (Chi phí) =====
type ShareKey =
  | "room_link"
  | "house_number"
  | "address"
  | "code"
  | "room_type"
  | "price"
  | "lift_stairs"
  | "fees"
  | "amenities"
  | "description";

  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showOpenBrowserBar, setShowOpenBrowserBar] = useState(false);

  // ===== SHARE IMAGES =====
  // Auto chọn toàn bộ ảnh đang có.
  // Lưu ý: khi share thật qua Zalo/Messenger, nếu quá nặng có thể cần giới hạn lại sau.
  const [shareImageUrls, setShareImageUrls] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const MAX_NATIVE_SHARE_FILES = 10;

  

const [shareSel, setShareSel] = useState<Record<ShareKey, boolean>>({
    room_link: false,
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

function buildShareText() {
  const lines: string[] = [];

  // ===== 1. LINK =====
  if (shareSel.room_link && roomShareUrl) {
    lines.push(`🔗 ${roomShareUrl}`);
  }

  // ===== 2. ĐỊA CHỈ =====
  if (shareSel.address || shareSel.house_number) {
    const parts: string[] = [];

    if (shareSel.house_number && houseNumber) {
      parts.push(compactShareHouseNumber(houseNumber));
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
      // 👉 nếu có link phía trên thì cách 1 dòng
      if (lines.length > 0) lines.push("");

      let firstLine = "";

      if (parts.length >= 2) {
        firstLine = `${parts[0]} ${parts[1]}`;
        if (parts.length > 2) {
          firstLine += ", " + parts.slice(2).join(", ");
        }
      } else {
        firstLine = parts[0];
      }

      lines.push(`📍 ${firstLine}`);
    }
  }

  // ===== 3. THANG MÁY / THANG BỘ =====
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

  // ===== 4. MÃ + LOẠI PHÒNG =====
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

  // ===== 5. GIÁ =====
  if (shareSel.price) {
    lines.push(`💰 Giá: ${priceText || "—"}`);
  }

  // ===== 6. CHI PHÍ =====
  if (shareSel.fees) {
    lines.push("");
    lines.push("Chi phí:");

    if (feeRows.length) {
      feeRows.forEach((r) => lines.push(`- ${r.label}: ${r.value}`));
    } else {
      lines.push("- Đang cập nhật");
    }
  }

  // ===== 7. TIỆN ÍCH =====
  if (shareSel.amenities) {
    const amen: string[] = [];

    if (detail?.shared_washer) amen.push("Máy giặt chung");
    if (detail?.private_washer) amen.push("Máy giặt riêng");
    if (detail?.shared_dryer) amen.push("Máy sấy chung");
    if (detail?.private_dryer) amen.push("Máy sấy riêng");
    if (detail?.has_parking) amen.push("Bãi xe");
    if (detail?.has_basement) amen.push("Hầm xe");
    if (detail?.fingerprint_lock) amen.push("Cửa vân tay");
    if (detail?.allow_pet) amen.push("Nuôi thú cưng");
    if (detail?.allow_cat) amen.push("Nuôi mèo");
    if (detail?.allow_dog) amen.push("Nuôi chó");
    const otherAmenitiesText = detail?.other_amenities
      ? String(detail.other_amenities).trim()
      : "";

    lines.push("");
    lines.push("Tiện ích:");

    if (amen.length) {
      amen.forEach((x) => lines.push(`- ${x}`));
    }

    if (otherAmenitiesText) {
      if (amen.length) lines.push("");
      lines.push(otherAmenitiesText);
    }

    if (!amen.length && !otherAmenitiesText) {
      lines.push("- Đang cập nhật");
    }
  }

  // ===== 8. MÔ TẢ =====
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
  if (sharing) return;

  const text = buildShareText();
  const selectedImageUrls = Array.from(
    new Set(
      shareImageUrls.map((url) => String(url ?? "").trim()).filter(Boolean)
    )
  );

  const hasText = text.trim().length > 0;
  const hasImages = selectedImageUrls.length > 0;

  if (!hasText && !hasImages) {
    showToast("Không có nội dung hoặc ảnh để chia sẻ");
    return;
  }

  setSharing(true);

  try {
    // copy text trước để luôn có clipboard fallback
    if (hasText) {
      const copied = await copyText(text);
      if (copied) {
        showToast(
          hasImages
            ? "Đã copy nội dung — nếu app chat bỏ text thì bạn chỉ cần dán vào"
            : "Đã copy nội dung",
          4500
        );
      }
    }

    // ===== 1) Không có ảnh =====
    if (!hasImages) {
      if (navigator?.share) {
        try {
          await navigator.share({ title: "The Room", text });
          showToast("Đã mở chia sẻ");
          setShareOpen(false);
          return;
        } catch {}
      }

      await copyShareTextFallback(
        text,
        "Thiết bị không hỗ trợ share trực tiếp — đã copy nội dung"
      );
      return;
    }

    // ===== 2) Có ảnh: thử share nhiều file nếu còn trong giới hạn =====
    if (selectedImageUrls.length <= MAX_NATIVE_SHARE_FILES && navigator?.share) {
      const files: File[] = [];

      for (let i = 0; i < selectedImageUrls.length; i += 1) {
        files.push(await r2ImageUrlToFile(selectedImageUrls[i], i));
      }

      const canShareFiles =
        typeof navigator.canShare === "function"
          ? navigator.canShare({ files })
          : false;

      if (canShareFiles) {
        await navigator.share({
          title: "The Room",
          files,
        });

        showToast("Đã mở chia sẻ ảnh");
        setShareOpen(false);
        return;
      }
    }

    // ===== 3) Quá nhiều ảnh hoặc share files không hỗ trợ -> gộp thành 1 collage =====
    const collageFile = await buildCollageFileFromUrls(selectedImageUrls);

    const canShareCollage =
      typeof navigator.canShare === "function"
        ? navigator.canShare({ files: [collageFile] })
        : false;

    if (navigator?.share && canShareCollage) {
      await navigator.share({
        title: "The Room",
        files: [collageFile],
      });

      showToast("Đã mở chia sẻ ảnh tổng hợp");
      setShareOpen(false);
      return;
    }

    // ===== 4) Fallback cuối: tải 1 ảnh tổng hợp =====
    downloadBlob(collageFile, collageFile.name);
    showToast("Thiết bị không hỗ trợ share trực tiếp — đã tải 1 ảnh tổng hợp");
    setShareOpen(false);
  } catch (e: any) {
    console.error("handleShare error:", e);

    try {
      if (hasImages) {
        const collageFile = await buildCollageFileFromUrls(selectedImageUrls);
        downloadBlob(collageFile, collageFile.name);
        showToast("Không share được trực tiếp — đã tải 1 ảnh tổng hợp");
        setShareOpen(false);
        return;
      }
    } catch (collageErr) {
      console.error("collage fallback error:", collageErr);
    }

    await copyShareTextFallback(
      text,
      hasImages
        ? "Không gửi được ảnh trực tiếp — đã copy nội dung"
        : undefined
    );
  } finally {
    setSharing(false);
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
      // ✅ Security: role được tính trong RPC theo auth.uid(); FE không gửi role nữa (giữ param để tương thích)
      const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
        p_id: id,
        p_role: 0,
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
}, [id]);

 const detail =
  (room?.room_detail ??
    room?.room_details ?? // ✅ phòng trường hợp RPC trả key số nhiều
    room?.detail ??
    room?.details ??
    {}) as any;

// ✅ Patch 4: nếu RPC không trả link_zalo / zalo_phone cho admin => fallback đọc thẳng từ rooms
useEffect(() => {
  const level = Number(adminLevel) || 0;

  // Chỉ L1 mới được fallback lấy link/sđt từ bảng gốc
  if (level !== 1) return;

  if (!room?.id) return;

  const hasAny =
    String(room?.link_zalo ?? "").trim() || String(room?.zalo_phone ?? "").trim();
  if (hasAny) return;

  let cancelled = false;

  (async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("link_zalo, zalo_phone, is_hidden")
        .eq("id", room.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) return;
      if ((data as any)?.is_hidden) return;

      const link_zalo = (data as any)?.link_zalo ?? null;
      const zalo_phone = (data as any)?.zalo_phone ?? null;

      if (link_zalo || zalo_phone) {
        setRoom((prev: any) =>
          prev
            ? {
                ...prev,
                link_zalo: prev?.link_zalo ?? link_zalo,
                zalo_phone: prev?.zalo_phone ?? zalo_phone,
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
}, [adminLevel, room?.id, room?.link_zalo, room?.zalo_phone]);

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

useEffect(() => {
  if (!shareOpen) return;

  // ✅ Mỗi lần mở modal, tự chọn toàn bộ ảnh đang có
  setShareImageUrls(imageUrls);
}, [shareOpen, imageUrls]);

function toggleShareImage(url: string) {
  const cleanUrl = String(url ?? "").trim();
  if (!cleanUrl) return;

  setShareImageUrls((prev) => {
    const exists = prev.includes(cleanUrl);

    if (exists) {
      return prev.filter((x) => x !== cleanUrl);
    }

    return [...prev, cleanUrl];
  });
}

async function loadImageFromBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(blob);
  }

  return await new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không đọc được ảnh"));
    };

    img.src = objectUrl;
  });
}

async function blobToJpegBlob(blob: Blob, quality = 0.9): Promise<Blob> {
  const image = await loadImageFromBlob(blob);

  const width =
    image instanceof HTMLImageElement ? image.naturalWidth : image.width;

  const height =
    image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  if (!width || !height) {
    throw new Error("Ảnh không có kích thước hợp lệ");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Không thể xử lý ảnh trên thiết bị này");
  }

  // Nền trắng để tránh ảnh WebP/PNG trong suốt bị đen khi đổi sang JPG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (jpegBlob) => {
        if (!jpegBlob) {
          reject(new Error("Không thể chuyển ảnh sang JPG"));
          return;
        }

        resolve(jpegBlob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function r2ImageUrlToFile(url: string, index: number) {
  const cleanUrl = String(url ?? "").trim();

  if (!cleanUrl) {
    throw new Error("Ảnh không có URL hợp lệ");
  }

  const proxyUrl = `/api/share-image?url=${encodeURIComponent(cleanUrl)}`;

  const res = await fetch(proxyUrl, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Không tải được ảnh ${index + 1} qua proxy`);
  }

  const originalBlob = await res.blob();

  // ✅ Convert WebP/R2 image thành JPEG để Messenger/Zalo nhận ổn hơn
  const jpegBlob = await blobToJpegBlob(originalBlob, 0.9);

  const safeRoomCode = String(roomCode || id || "room")
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return new File([jpegBlob], `${safeRoomCode}-${index + 1}.jpg`, {
    type: "image/jpeg",
  });
}

function safeFileBaseName(input: string) {
  return String(input || "room")
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "room";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap | HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const sw = image.width;
  const sh = image.height;

  const srcRatio = sw / sh;
  const dstRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sW = sw;
  let sH = sh;

  if (srcRatio > dstRatio) {
    sW = sh * dstRatio;
    sx = (sw - sW) / 2;
  } else {
    sH = sw / dstRatio;
    sy = (sh - sH) / 2;
  }

  ctx.drawImage(image, sx, sy, sW, sH, dx, dy, dw, dh);
}

async function buildCollageFileFromUrls(urls: string[]) {
  const uniqueUrls = Array.from(
    new Set(urls.map((u) => String(u ?? "").trim()).filter(Boolean))
  );

  if (!uniqueUrls.length) {
    throw new Error("Không có ảnh để tạo collage");
  }

  const sourceFiles: File[] = [];
  for (let i = 0; i < uniqueUrls.length; i += 1) {
    sourceFiles.push(await r2ImageUrlToFile(uniqueUrls[i], i));
  }

  const images = await Promise.all(sourceFiles.map((f) => loadImageFromBlob(f)));

  const count = images.length;
  const cols =
    count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  const tile =
    count <= 2 ? 900 : count <= 4 ? 720 : count <= 9 ? 540 : 380;

  const gap = 12;
  const headerH = 104;
  const footerH = 84;
  const rows = Math.ceil(count / cols);

  const width = cols * tile + (cols + 1) * gap;
  const height = headerH + rows * tile + (rows + 1) * gap + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Không thể tạo canvas");
  }

  // background
  ctx.fillStyle = "#130c09";
  ctx.fillRect(0, 0, width, height);

  // title
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = `700 ${Math.max(24, Math.round(tile * 0.06))}px system-ui, sans-serif`;
  ctx.fillText("The Room", gap, 38);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 ${Math.max(14, Math.round(tile * 0.03))}px system-ui, sans-serif`;
  ctx.fillText(`Ảnh phòng · ${count} ảnh`, gap, 68);

  // tiles
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = gap + col * (tile + gap);
    const y = headerH + gap + row * (tile + gap);

    ctx.fillStyle = "#1b120f";
    ctx.fillRect(x, y, tile, tile);

    drawCoverImage(ctx, img, x, y, tile, tile);

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(x + 10, y + 10, 44, 28);

    ctx.fillStyle = "#fff";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillText(String(i + 1), x + 24, y + 30);

    if ("close" in img && typeof img.close === "function") {
      img.close();
    }
  }

  // footer
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `500 ${Math.max(13, Math.round(tile * 0.028))}px system-ui, sans-serif`;
  ctx.fillText("Chia sẻ từ The Room", gap, height - 32);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) {
        reject(new Error("Không thể xuất ảnh collage"));
        return;
      }
      resolve(b);
    }, "image/jpeg", 0.92);
  });

  return new File([blob], `${safeFileBaseName(roomCode || id || "room")}-collage.jpg`, {
    type: "image/jpeg",
  });
}

async function copyShareTextFallback(text: string, message?: string) {
  if (!text.trim()) {
    showToast(message || "Thiết bị không hỗ trợ gửi ảnh trực tiếp");
    return;
  }

  const ok = await copyText(text);

  showToast(
    ok
      ? message || "Đã copy nội dung — mở Zalo/Messenger và dán vào"
      : "Không thể copy — hãy chọn và copy thủ công"
  );
}

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

useEffect(() => {
  mediaItemsLengthRef.current = mediaItems.length;
}, [mediaItems.length]);

useEffect(() => {
  mediaItemsLengthRef.current = mediaItems.length;
}, [mediaItems.length]);

// ===== RENDER GUARD =====

if (!id || fetchStatus === "loading") {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/45 p-3">
      <div
        className="
          relative w-[355px] max-w-[calc(100vw-24px)]
          md:w-[520px] md:max-w-[calc(100vw-48px)]
          h-[720px] max-h-[calc(100dvh-24px)]
          md:h-[860px] md:max-h-[calc(100dvh-40px)]
          overflow-hidden rounded-[24px]
          border border-white/15
          bg-[#E9D7C3]
          shadow-[0_24px_80px_rgba(0,0,0,0.55)]
        "
      >
        <div className="p-3 space-y-3">
          <div className="h-[300px] md:h-[330px] rounded-[18px] bg-white/10 animate-pulse" />

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

  // ✅ Hợp nhất dữ liệu từ link_zalo + zalo_phone
const linkRaw = String(room?.link_zalo ?? "");
const phoneRaw = String(room?.zalo_phone ?? "");

// ✅ giữ nguyên toàn bộ nội dung admin nhập
const zaloLinkRaw = linkRaw.trim();

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


return (
  <div
  className="
    fixed inset-0 z-[99999]
    flex items-center justify-center
    bg-black/55 p-3
    text-[#F4E7D6]
  "
  onClick={handleCloseModal}
>
  <div
    className="
      relative flex flex-col overflow-hidden
      w-[355px] max-w-[calc(100vw-24px)]
      md:w-[520px] md:max-w-[calc(100vw-48px)]
      h-[720px] max-h-[calc(100dvh-24px)]
      md:h-[860px] md:max-h-[calc(100dvh-40px)]
      rounded-[24px]
      border
      shadow-[0_24px_80px_rgba(0,0,0,0.55)]
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
      router.push("/");
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
          className="relative w-full h-[250px] md:h-[360px] rounded-[18px] overflow-hidden bg-black cursor-grab active:cursor-grabbing select-none"
          tabIndex={0}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onPointerDown={handleViewerPointerDown}
          onPointerUp={handleViewerPointerUp}
          onPointerCancel={handleViewerPointerCancel}
          onPointerLeave={handleViewerPointerCancel}
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
            if (activeItem?.kind !== "video") setViewerOpen(true);
          }}
        >
          {activeItem ? (
            activeItem.kind === "video" ? (
              <div
                className="relative w-full h-full"
                onClick={(e) => {
                  e.stopPropagation();
                  showOverlayAndMaybeHide();
                }}
              >
                {showPlay && activeItem.thumb ? (
                  <img
                    src={activeItem.thumb}
                    className="absolute inset-0 w-full h-full object-contain z-[1]"
                  />
                ) : null}

                <video
                  ref={videoRef}
                  src={activeItem.url}
                  controls
                  preload="metadata"
                  playsInline
                  poster={activeItem.thumb || undefined}
                  className="w-full h-full object-contain bg-black"
                  onPlay={() => {
                    setShowPlay(false);
                    showOverlayAndMaybeHide();
                  }}
                  onPause={() => {
                    setShowPlay(true);
                    setOverlayVisible(true);
                    clearOverlayTimer();
                  }}
                  onEnded={() => {
                    setShowPlay(true);
                    setOverlayVisible(true);
                    clearOverlayTimer();
                  }}
                />

                {(overlayVisible || showPlay) && (
                  <button
                    className="absolute inset-0 z-[2] m-auto w-16 h-16 rounded-full
                               bg-black/40 text-white text-2xl
                               flex items-center justify-center
                               border border-white/40 backdrop-blur"
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = videoRef.current;
                      if (!v) return;

                      setOverlayVisible(true);
                      clearOverlayTimer();

                      if (v.paused) {
                        v.play();
                        setShowPlay(false);
                        scheduleHideOverlay(1500);
                      } else {
                        v.pause();
                        setShowPlay(true);
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
                className="w-full h-full object-contain bg-black"
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

          {isAdmin && imageUrls.length > 0 && (
            <>
              {/* Nút tải ảnh: góc trái */}
              <button
                type="button"
                disabled={downloadingImages}
                onClick={(e) => {
                  e.stopPropagation();
                  if (downloadingImages) return;

                  try {
                    setDownloadingImages(true);
                    const url = `/api/rooms/${encodeURIComponent(id)}/download-images`;
                    window.open(url, "_blank");
                  } finally {
                    setDownloadingImages(false);
                  }
                }}
                className="
                  absolute bottom-3 left-3 z-20
                  inline-flex items-center gap-1
                  rounded-full
                  border border-white/20
                  bg-black/35
                  px-2 py-1
                  text-[10px] font-medium text-white
                  backdrop-blur-[10px]
                  shadow-[0_8px_24px_rgba(0,0,0,0.35)]
                  hover:bg-black/80
                  transition
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
                title={downloadingImages ? "Đang chuẩn bị file..." : "Tải ảnh"}
              >
                {downloadingImages ? "⏳" : "⬇️"}
              </button>

              {/* Nút chia sẻ: góc phải */}
             <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareOpen(true);
                }}
                className="
                  absolute bottom-3 right-3 z-20
                  inline-flex items-center justify-center
                  h-10 w-10
                  rounded-full
                  border border-white/20
                  bg-black/35
                  backdrop-blur-[10px]
                  shadow-[0_8px_24px_rgba(0,0,0,0.35)]
                  hover:bg-black/80
                  transition
                "
                title="Chia sẻ"
                aria-label="Chia sẻ"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0 text-white"
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
              </button>
            </>
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

      {/* ===== Ngày cập nhật ===== */}
      <div className="flex items-center justify-end gap-1 mt-1 mb-0 text-sm text-white/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.25)]">
        {updatedText && <div>Đã cập nhật: {updatedText}</div>}
      </div>

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
                  statusText === "Còn Trống"
                    ? "bg-[rgba(34,197,94,0.18)] text-green-300 border border-green-400/30 backdrop-blur"
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
          <div className="mt-2 text-red-700 text-[15px] leading-snug whitespace-pre-line">
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

          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[#F4E7D6]">
              <div className="min-w-0">
                {zaloLinkRaw ? (
                  renderSmartLinks(zaloLinkRaw)
                ) : (
                  <div className="text-gray-500">-</div>
                )}
              </div>

              <div>
                <div className="font-medium mb-1"> SĐT chủ nhà </div>
                {zaloPhones.length > 0 ? (
                  <div className="space-y-1">
                    {zaloPhones.map((p, i) => (
                      <button
                        key={`${p}-${i}`}
                        onClick={() => setPhoneModal(p)}
                        className="
                          text-left w-full break-all
                          text-red-400 font-semibold
                          hover:text-red-300 hover:underline
                          transition-colors
                        "
                      >
                        {p}
                      </button>
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={handleViewerPointerDown}
      onPointerUp={handleViewerPointerUp}
      onPointerCancel={handleViewerPointerCancel}
      onPointerLeave={handleViewerPointerCancel}
      onClick={(e) => e.stopPropagation()}
    >
      {activeItem?.kind === "video" ? (
        <div className="relative h-full w-full">
          <div
            className="relative h-full w-full"
            onClick={(e) => {
              e.stopPropagation();
              showOverlayAndMaybeHide();
            }}
          >
            <video
              ref={videoRef}
              src={activeItem.url}
              controls
              playsInline
              preload="none"
              className="h-full w-full object-contain bg-black/40"
              onPlay={() => {
                setShowPlay(false);
                showOverlayAndMaybeHide();
              }}
              onPause={() => {
                setShowPlay(true);
                setOverlayVisible(true);
                clearOverlayTimer();
              }}
              onEnded={() => {
                setShowPlay(true);
                setOverlayVisible(true);
                clearOverlayTimer();
              }}
            />

            {(overlayVisible || showPlay) && (
              <button
                className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/35 bg-white/10 text-2xl text-white backdrop-blur-[24px] shadow-[0_18px_60px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.35)]"
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (!v) return;

                  setOverlayVisible(true);
                  clearOverlayTimer();

                  if (v.paused) {
                    v.play();
                    setShowPlay(false);
                    scheduleHideOverlay(1500);
                  } else {
                    v.pause();
                    setShowPlay(true);
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
          alt={room?.title || room?.room_code || ""}
          className="h-full w-full object-contain select-none pointer-events-none"
          draggable={false}
          loading="lazy"
        />
      )}

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
      {/* ===== SHARE MODAL ===== */}
    {(adminLevel === 1 || adminLevel === 2) && shareOpen && (
      <div
        className="
          fixed inset-0 
          z-[99999] 
          flex items-end justify-center
          overflow-y-auto overscroll-contain
          bg-black/50 
          p-2 sm:p-4
          backdrop-blur-[8px]
          md:items-center
        "
        onClick={() => setShareOpen(false)}
      >
    <div
      className="
        flex w-full flex-col overflow-hidden
        max-h-[calc(100dvh-16px)]
        rounded-t-2xl
        border border-white/15
        bg-[rgba(158,106,57,0.25)]
        backdrop-blur-[50px]
        text-white
        shadow-[0_30px_100px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.2)]
        md:max-h-[calc(100dvh-48px)]
        md:max-w-lg
        md:rounded-3xl
      "
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
        <div className="text-lg font-semibold">Chia sẻ</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setShareSel((s) => ({ ...s, room_link: !s.room_link }))
            }
            className={[
              "px-3 py-1 rounded-lg border transition-colors",
             shareSel.room_link
            ? "bg-white/15 text-white border-white/30"
            : "bg-white/5 text-[#F4E7D6] border-white/20 hover:bg-white/10 hover:border-white/55",
            ].join(" ")}
          >
            Link phòng
          </button>

         <button
            type="button"
            onClick={() => setShareOpen(false)}
            className="px-3 py-1 rounded-lg text-[#F4E7D6] hover:bg-white/10"
           >
            Đóng
          </button>
        </div>
      </div>

    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
      <div className="grid grid-cols-2 items-start gap-4 sm:gap-6">

        {/* CỘT TRÁI */}
        <div className="space-y-3">
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
              onChange={(e) =>
                setShareSel((s) => ({ ...s, address: e.target.checked }))
              }
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
              onChange={(e) =>
                setShareSel((s) => ({ ...s, price: e.target.checked }))
              }
            />
            <span>Giá phòng</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.lift_stairs}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, lift_stairs: e.target.checked }))
              }
            />
            <span>Thang máy / Thang bộ</span>
          </label>
        </div>

        {/* CỘT PHẢI */}
        <div className="space-y-3">
          <div className="text-sm font-semibold text-[#F4E7D6]/80">Tuỳ chọn</div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.fees}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, fees: e.target.checked }))
              }
            />
            <span>Chi phí</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.amenities}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, amenities: e.target.checked }))
              }
            />
            <span>Tiện ích</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shareSel.description}
              onChange={(e) =>
                setShareSel((s) => ({ ...s, description: e.target.checked }))
              }
            />
            <span>Mô tả</span>
          </label>
              </div>
            </div>

            <div className="pt-2 border-t border-white/20" />

            {/* ===== CHỌN ẢNH GỬI KÈM ===== */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#F4E7D6]/80">
                  Ảnh gửi kèm (ưu tiên dưới 10 ảnh)
                </div>

                <div className="text-xs text-[#F4E7D6]/60">
                  Đã chọn {shareImageUrls.length}/{imageUrls.length}
                </div>
              </div>

              {imageUrls.length > 0 ? (
                <>
                  <div className="grid grid-cols-5 gap-2">
                    {imageUrls.map((url, idx) => {
                      const selected = shareImageUrls.includes(url);

                      return (
                        <button
                          key={`${url}-${idx}`}
                          type="button"
                          onClick={() => toggleShareImage(url)}
                          className={[
                            "relative aspect-square overflow-hidden rounded-xl border transition-all",
                            selected
                              ? "border-sky-300 ring-2 ring-sky-300/50"
                              : "border-white/15 opacity-70 hover:opacity-100",
                          ].join(" ")}
                          title={
                            selected
                              ? "Bấm để bỏ chọn ảnh"
                              : "Bấm để chọn ảnh"
                          }
                        >
                          <img
                            src={url}
                            alt={`Ảnh phòng ${idx + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />

                          <div
                            className={[
                              "absolute inset-0 flex items-center justify-center text-sm font-bold transition",
                              selected
                                ? "bg-black/25 text-white"
                                : "bg-black/0 text-transparent",
                            ].join(" ")}
                          >
                            ✓
                          </div>

                          {idx === 0 && (
                            <div className="absolute left-1 top-1 rounded-full bg-black/45 backdrop-blur-[2px] px-1.5 py-[1px] text-[9px] font-medium text-white">
                              Bìa
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setShareImageUrls(imageUrls)}
                        className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#F4E7D6] hover:bg-white/10"
                       >
                        Chọn tất cả ảnh
                    </button>

                    <button
                      type="button"
                      onClick={() => setShareImageUrls([])}
                      className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-[#F4E7D6] hover:bg-white/10"
                    >
                      Bỏ chọn ảnh
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3 text-sm text-[#F4E7D6]/65">
                  Phòng này chưa có ảnh để gửi kèm.
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/20" />

            <div className="text-sm font-semibold text-[#F4E7D6]/80">
              Preview nội dung
            </div>

           <pre className="max-h-32 md:max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/20 bg-[rgba(255,255,255,0.06)] p-3 text-sm text-[#F4E7D6] backdrop-blur-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
              {buildShareText()}
            </pre>

            <div className="
              sticky bottom-0 z-10 -mx-1 flex gap-2
              rounded-2xl
              border border-white/15
              bg-[rgba(128,61,26,0.74)]
              px-2 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]
              backdrop-blur-[36px]
            ">
             <button
                type="button"
                disabled={sharing}
                onClick={handleShare}
                className="
                  flex-1 rounded-2xl border border-white/25
                  bg-[rgba(246,187,142,0.62)]
                  py-2 font-semibold text-white
                  backdrop-blur-[24px]
                  hover:bg-white/15
                  disabled:cursor-not-allowed disabled:opacity-60
                "
               >
               {sharing
                ? `Đang chuẩn bị ${shareImageUrls.length} ảnh...`
                : shareImageUrls.length > 0
                  ? "Chia sẻ ảnh + copy nội dung"
                  : "Chia sẻ nội dung"}
              </button>

               <button
                  type="button"
                  disabled={sharing}
                  onClick={async () => {
                    const text = buildShareText();
                    const ok = await copyText(text);
                    showToast(
                      ok
                        ? "Đã copy nội dung — mở Zalo/Messenger và dán vào"
                        : "Không thể copy — hãy chọn và copy thủ công"
                    );
                  }}
                  className="
                    flex-1 rounded-2xl border border-white/25
                    bg-[rgba(255,255,255,0.06)]
                    py-2 font-semibold text-white
                    backdrop-blur-[24px]
                    hover:bg-white/12
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
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
{phoneModal && (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30"
    onClick={() => setPhoneModal(null)}
  >
    <div
      className="w-[280px] rounded-2xl 
      border border-white/10 
      bg-[linear-gradient(135deg,rgba(255, 255, 255, 0.88),rgba(255, 255, 255, 0.54)),rgba(58,33,18,0.45)] 
      backdrop-blur-2xl 
      shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] 
      p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-center text-[#f4eadf] font-semibold">
        {phoneModal}
      </div>

      <a
        href={`tel:${phoneModal}`}
        className="block text-center rounded-xl bg-[#A47A52]/65 text-white py-2 border border-[#E0B77A]/25 backdrop-blur hover:bg-[#B8895C]/75"
      >
        📞 Gọi điện
      </a>

      <a
        href={`https://zalo.me/${phoneModal}`}
        target="_blank"
        rel="noreferrer"
        className="block text-center rounded-xl border border-[#E0B77A]/25 bg-white/5 text-[#f4eadf] py-2 backdrop-blur hover:bg-white/10"
      >
        💬 Nhắn Zalo
      </a>

      <button
        onClick={async () => {
          await navigator.clipboard.writeText(phoneModal);
        }}
        className="block w-full text-center rounded-xl border border-[#E0B77A]/20 bg-white/5 text-white py-2 backdrop-blur hover:bg-white/10"
      >
        📋 Copy số
      </button>
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
