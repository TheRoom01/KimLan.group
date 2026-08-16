"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatVietnameseWard } from "@/lib/formatWard";

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

type RoomLike = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  price?: number | string | null;
  description?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  room: any;
  images: string[];
  videos?: string[];
  roomUrl: string;
  adminLevel: 0 | 1 | 2;
  detail?: any;
};

type BitmapLike = ImageBitmap | HTMLImageElement;

function joinParts(parts: Array<string | null | undefined>) {
  return parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join(", ");
}

function formatWard(ward: any) {
  return formatVietnameseWard(ward);
}

function compactShareHouseNumber(input: any) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  const m = s.match(/^(\d+\/?)/);
  return m?.[1] ?? s;
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

function formatVND(value: any) {
  const n = Number(value);
  if (Number.isFinite(n)) return n.toLocaleString("vi-VN") + " đ";
  return value ?? "";
}

function safeFileBaseName(input: string) {
  return (
    String(input || "room")
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "room"
  );
}

async function loadImageFromBlob(blob: Blob): Promise<BitmapLike> {
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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: BitmapLike,
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

async function buildCollageFileFromUrls(
  urls: string[],
  roomCodeOrId: string,
  prepareFile: (url: string, index: number) => Promise<File> = (url, index) =>
    r2ImageUrlToFile(url, index, roomCodeOrId)
) {
  const uniqueUrls = Array.from(
    new Set(urls.map((u) => String(u ?? "").trim()).filter(Boolean))
  );

  if (!uniqueUrls.length) {
    throw new Error("Không có ảnh để tạo collage");
  }

  const files = await Promise.all(
    uniqueUrls.map((url, index) => prepareFile(url, index))
  );

  const images = await Promise.all(files.map((f) => loadImageFromBlob(f)));

  const count = images.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const tile = count <= 2 ? 900 : count <= 4 ? 720 : count <= 9 ? 540 : 380;

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
  if (!ctx) throw new Error("Không thể tạo canvas");

  ctx.fillStyle = "#130c09";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = `700 ${Math.max(24, Math.round(tile * 0.06))}px system-ui, sans-serif`;
  ctx.fillText("The Room", gap, 38);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = `500 ${Math.max(14, Math.round(tile * 0.03))}px system-ui, sans-serif`;
  ctx.fillText(`Ảnh phòng · ${count} ảnh`, gap, 68);

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

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `500 ${Math.max(13, Math.round(tile * 0.028))}px system-ui, sans-serif`;
  ctx.fillText("Chia sẻ từ The Room", gap, height - 32);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error("Không thể xuất ảnh collage"));
          return;
        }
        resolve(b);
      },
      "image/jpeg",
      0.92
    );
  });

  return new File([blob], `${safeFileBaseName(roomCodeOrId)}-collage.jpg`, {
    type: "image/jpeg",
  });
}

function shareHouseNumberText(input: any) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  // Chỉ số thuần thì mask
  if (/^\d+$/.test(raw)) return "xx";

  // Còn lại giữ logic cũ
  return compactShareHouseNumber(raw);
}

async function r2ImageUrlToFile(
  url: string,
  index: number,
  roomCodeOrId: string
) {
  const cleanUrl = String(url ?? "").trim();
  if (!cleanUrl) throw new Error("Ảnh không có URL hợp lệ");

  const proxyUrl = `/api/share-image?url=${encodeURIComponent(cleanUrl)}`;

  const res = await fetch(proxyUrl, {
    method: "GET",
    cache: "force-cache",
  });

  if (!res.ok) {
    throw new Error(`Không tải được ảnh ${index + 1} qua proxy`);
  }

  const originalBlob = await res.blob();
  // Skip an expensive canvas decode/encode when the source is already JPEG.
  const jpegBlob = originalBlob.type.toLowerCase().includes("jpeg")
    ? originalBlob
    : await blobToJpegBlob(originalBlob, 0.9);

  return new File([jpegBlob], `${safeFileBaseName(roomCodeOrId)}-${index + 1}.jpg`, {
    type: "image/jpeg",
  });
}

async function r2VideoUrlToFile(
  url: string,
  index: number,
  roomCodeOrId: string
) {
  const cleanUrl = String(url ?? "").trim();
  if (!cleanUrl) throw new Error("Video không có URL hợp lệ");

  const proxyUrl = `/api/share-image?url=${encodeURIComponent(cleanUrl)}`;

  const res = await fetch(proxyUrl, {
    method: "GET",
    cache: "force-cache",
  });

  if (!res.ok) {
    throw new Error(`Không tải được video ${index + 1} qua proxy`);
  }

  const blob = await res.blob();

  return new File(
    [blob],
    `${safeFileBaseName(roomCodeOrId)}-video-${index + 1}.mp4`,
    {
      type: blob.type || "video/mp4",
    }
  );
}

export default function ShareRoomModal({
  open,
  onClose,
  room,
  images,
  videos = [],
  roomUrl,
  adminLevel,
  detail,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);

const [shareImageUrls, setShareImageUrls] = useState<string[]>([]);
const [shareVideoUrls, setShareVideoUrls] = useState<string[]>([]);
const [includeVideos, setIncludeVideos] = useState(false);

const [sharing, setSharing] = useState(false);
const [preparingImages, setPreparingImages] = useState(false);
const [preparingVideos, setPreparingVideos] = useState(false);

const [preparedFiles, setPreparedFiles] = useState<Record<string, File>>({});
const [preparedVideoFiles, setPreparedVideoFiles] = useState<Record<string, File>>({});
const imagePreparationCache = useRef(new Map<string, Promise<File>>());
const videoPreparationCache = useRef(new Map<string, Promise<File>>());

const MAX_NATIVE_SHARE_FILES = 10;
const MAX_NATIVE_SHARE_VIDEOS = 2;

  const [shareSel, setShareSel] = useState<Record<ShareKey, boolean>>({
    room_link: false,
    house_number: true,
    address: true,
    code: true,
    room_type: true,
    price: true,
    lift_stairs: true,
    fees: false,
    amenities: false,
    description: false,
  });

  const isAdmin = adminLevel === 1 || adminLevel === 2;
  const sourceDetail = detail ?? room ?? {};
  const shareFileBaseName = room.room_code || room.id;

  const prepareImageFile = useCallback(
    (url: string, index: number) => {
      const cacheKey = `${shareFileBaseName}:${url}`;
      const cached = imagePreparationCache.current.get(cacheKey);
      if (cached) return cached;

      const pending = r2ImageUrlToFile(url, index, shareFileBaseName).catch(
        (error) => {
          imagePreparationCache.current.delete(cacheKey);
          throw error;
        }
      );
      imagePreparationCache.current.set(cacheKey, pending);
      return pending;
    },
    [shareFileBaseName]
  );

  const prepareVideoFile = useCallback(
    (url: string, index: number) => {
      const cacheKey = `${shareFileBaseName}:${url}`;
      const cached = videoPreparationCache.current.get(cacheKey);
      if (cached) return cached;

      const pending = r2VideoUrlToFile(url, index, shareFileBaseName).catch(
        (error) => {
          videoPreparationCache.current.delete(cacheKey);
          throw error;
        }
      );
      videoPreparationCache.current.set(cacheKey, pending);
      return pending;
    },
    [shareFileBaseName]
  );

  const selectedImageUrls = useMemo(() => {
    return Array.from(
      new Set(
        (Array.isArray(images) ? images : [])
          .map((url) => String(url ?? "").trim())
          .filter(Boolean)
      )
    );
  }, [images]);

  const absoluteRoomUrl = useMemo(() => {
    const raw = String(roomUrl || "").trim();
    if (!raw) return "";

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }

    if (typeof window === "undefined") return raw;

    return `${window.location.origin}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }, [roomUrl]);

  useEffect(() => {
    if (!open) return;

    const cleanVideos: string[] = Array.from(
      new Set<string>(
        (Array.isArray(videos) ? videos : [])
          .map((url: string) => String(url ?? "").trim())
          .filter((url: string) => Boolean(url))
      )
    ).slice(0, MAX_NATIVE_SHARE_VIDEOS);

    setShareImageUrls(selectedImageUrls);
    setShareVideoUrls(cleanVideos);
    setIncludeVideos(false);

    setPreparedFiles({});
    setPreparedVideoFiles({});
  }, [open, selectedImageUrls, videos]);

useEffect(() => {
  if (!open || selectedImageUrls.length === 0) return;

  let cancelled = false;

  async function prepareImages() {
    setPreparingImages(true);

    const entries = await Promise.all(
      selectedImageUrls.map(async (url, index) => {
        try {
          return [url, await prepareImageFile(url, index)] as const;
        } catch (e) {
          console.error("prepare image error:", e);
          return null;
        }
      })
    );
    const next = Object.fromEntries(
      entries.filter(Boolean) as Array<readonly [string, File]>
    );

    if (!cancelled) {
      setPreparedFiles(next);
      setPreparingImages(false);
    }
  }

  prepareImages();

  return () => {
    cancelled = true;
  };
}, [open, selectedImageUrls, prepareImageFile]);

useEffect(() => {
  if (!open || !includeVideos || shareVideoUrls.length === 0) return;

  const selectedVideoUrls: string[] = Array.from(
    new Set<string>(
      shareVideoUrls
        .map((url: string) => String(url ?? "").trim())
        .filter((url: string) => Boolean(url))
    )
  ).slice(0, MAX_NATIVE_SHARE_VIDEOS);

  const allPrepared = selectedVideoUrls.every(
    (url: string) => preparedVideoFiles[url]
  );

  if (allPrepared) return;

  let cancelled = false;

  async function prepareVideos() {
    setPreparingVideos(true);

    const entries = await Promise.all(
      selectedVideoUrls.map(async (url, index) => {
        try {
          return [url, await prepareVideoFile(url, index)] as const;
        } catch (e) {
          console.error("prepare video error:", e);
          return null;
        }
      })
    );
    const next = Object.fromEntries(
      entries.filter(Boolean) as Array<readonly [string, File]>
    );

    if (!cancelled) {
      setPreparedVideoFiles(next);
      setPreparingVideos(false);
    }
  }

  prepareVideos();

  return () => {
    cancelled = true;
  };
}, [
  open,
  includeVideos,
  shareVideoUrls,
  preparedVideoFiles,
  prepareVideoFile,
]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function showToast(msg: string, duration = 4200) {
    setToast(msg);
    window.setTimeout(() => setToast(null), duration);
  }

  async function copyText(text: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

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

    if (shareSel.room_link && absoluteRoomUrl) {
      lines.push(`🔗 ${absoluteRoomUrl}`);
    }

    if (shareSel.address || shareSel.house_number) {
    const parts: string[] = [];

    if (shareSel.house_number && room.house_number) {
        parts.push(shareHouseNumberText(room.house_number));
    }

    if (shareSel.address) {
        const addr = joinParts([
        room.address,
        formatWard(room.ward),
        room.district,
        ]);

        if (addr) parts.push(addr);
    }

    if (parts.length) {
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

    if (shareSel.lift_stairs) {
      const hasLift = Boolean(sourceDetail?.has_elevator);
      const hasStairs = Boolean(sourceDetail?.has_stairs);

      const parts = [
        hasLift ? "Thang máy" : null,
        hasStairs ? "Thang bộ" : null,
      ].filter(Boolean) as string[];

      if (parts.length) {
        lines.push(`✅ ${parts.join(" & ")}`);
      }
    }

    if (shareSel.code) {
      lines.push(`_ Mã: ${room.room_code || "—"}`);
    }

    if (shareSel.room_type && room.room_type) {
      lines.push(`Loại phòng: ${room.room_type}`);
    }

    if (shareSel.price) {
      lines.push(`💰 Giá: ${room.price != null ? formatVND(room.price) : "—"}`);
    }

    if (shareSel.fees) {
      lines.push("");
      lines.push("Chi phí:");

      const feeRows: Array<{ label: string; value: string }> = [];

      if (sourceDetail?.electric_fee_value != null) {
        feeRows.push({
          label: "⚡ Điện",
          value: `${formatVND(sourceDetail.electric_fee_value)}${
            sourceDetail?.electric_fee_unit
              ? ` / ${feeUnitLabel(sourceDetail.electric_fee_unit)}`
              : ""
          }`,
        });
      }

      if (sourceDetail?.water_fee_value != null) {
        feeRows.push({
          label: "💧 Nước",
          value: `${formatVND(sourceDetail.water_fee_value)}${
            sourceDetail?.water_fee_unit
              ? ` / ${feeUnitLabel(sourceDetail.water_fee_unit)}`
              : ""
          }`,
        });
      }

      if (sourceDetail?.service_fee_value != null) {
        feeRows.push({
          label: "🧾 Dịch vụ",
          value: `${formatVND(sourceDetail.service_fee_value)}${
            sourceDetail?.service_fee_unit
              ? ` / ${feeUnitLabel(sourceDetail.service_fee_unit)}`
              : ""
          }`,
        });
      }

      if (sourceDetail?.parking_fee_value != null) {
        feeRows.push({
          label: "🏍️ Gửi xe",
          value: `${formatVND(sourceDetail.parking_fee_value)}${
            sourceDetail?.parking_fee_unit
              ? ` / ${feeUnitLabel(sourceDetail.parking_fee_unit)}`
              : " / xe"
          }`,
        });
      }

      if (sourceDetail?.other_fee_value != null || sourceDetail?.other_fee_note) {
        const otherFeeValue = Number(sourceDetail?.other_fee_value ?? 0);
        const valuePart = otherFeeValue > 0 ? formatVND(otherFeeValue) : "";
        const notePart = sourceDetail?.other_fee_note
          ? String(sourceDetail.other_fee_note).trim()
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

      if (feeRows.length) {
        feeRows.forEach((r) => lines.push(`- ${r.label}: ${r.value}`));
      } else {
        lines.push("- Đang cập nhật");
      }
    }

    if (shareSel.amenities) {
      const amen: string[] = [];

      if (sourceDetail?.shared_washer) amen.push("Máy giặt chung");
      if (sourceDetail?.private_washer) amen.push("Máy giặt riêng");
      if (sourceDetail?.shared_dryer) amen.push("Máy sấy chung");
      if (sourceDetail?.private_dryer) amen.push("Máy sấy riêng");
      if (sourceDetail?.has_parking) amen.push("Bãi xe");
      if (sourceDetail?.has_basement) amen.push("Hầm xe");
      if (sourceDetail?.fingerprint_lock) amen.push("Cửa vân tay");
      if (sourceDetail?.free_time) amen.push("Giờ giấc tự do");
      if (sourceDetail?.allow_pet) amen.push("Nuôi thú cưng");
      if (sourceDetail?.allow_cat) amen.push("Nuôi mèo");
      if (sourceDetail?.allow_dog) amen.push("Nuôi chó");
      if (sourceDetail?.no_pet) amen.push("Không thú cưng");
      if (sourceDetail?.short_term) amen.push("Ngắn hạn");
      if (sourceDetail?.long_term) amen.push("Dài hạn");

      const otherAmenitiesText = sourceDetail?.other_amenities
        ? String(sourceDetail.other_amenities).trim()
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

    if (shareSel.description && (room.description || sourceDetail?.description)) {
      lines.push("");
      lines.push("Mô tả:");
      lines.push(String(room.description ?? sourceDetail?.description ?? "").trim());
    }

    return lines.join("\n");
  }

  function toggleShareImage(url: string) {
    const cleanUrl = String(url ?? "").trim();
    if (!cleanUrl) return;

    setShareImageUrls((prev) => {
      const exists = prev.includes(cleanUrl);
      if (exists) return prev.filter((x) => x !== cleanUrl);
      return [...prev, cleanUrl];
    });
  }

  async function handleShare() {
    if (sharing) return;

    const text = buildShareText();
    const selected: string[] = Array.from(
      new Set<string>(
        shareImageUrls
          .map((url: string) => String(url ?? "").trim())
          .filter((url: string) => Boolean(url))
      )
    );

    const selectedVideos: string[] = includeVideos
      ? Array.from(
          new Set<string>(
            shareVideoUrls
              .map((url: string) => String(url ?? "").trim())
              .filter((url: string) => Boolean(url))
          )
        ).slice(0, MAX_NATIVE_SHARE_VIDEOS)
      : [];

    const hasText = text.trim().length > 0;
    const hasImages = selected.length > 0;
    const hasVideos = selectedVideos.length > 0;
    const hasMedia = hasImages || hasVideos;
    if (!hasText && !hasMedia) {
      showToast("Không có nội dung, ảnh hoặc video để chia sẻ");
      return;
    }

    setSharing(true);

    try {
      if (hasText) {
        await copyText(text);
      }

      if (!hasMedia) {
        if (navigator?.share) {
          try {
            await navigator.share({
              text,
              url: absoluteRoomUrl || undefined,
            });
            onClose();
            return;
          } catch {}
        }

        showToast("Đã copy nội dung");
        return;
      }

      if (
  selected.length <= MAX_NATIVE_SHARE_FILES &&
  selectedVideos.length <= MAX_NATIVE_SHARE_VIDEOS &&
  navigator?.share
) {
  // Preloading makes the modal feel faster, but it must not be a prerequisite
  // for sharing. A failed/slow preload used to leave the UI permanently saying
  // "Ảnh đang chuẩn bị". Fetch missing files as part of this user action so a
  // transient proxy/network failure can recover without reopening the modal.
  const imageFiles = await Promise.all(
    selected.map((url: string, index: number) =>
      preparedFiles[url] ?? prepareImageFile(url, index)
    )
  );

  const videoFiles = await Promise.all(
    selectedVideos.map((url: string, index: number) =>
      preparedVideoFiles[url] ?? prepareVideoFile(url, index)
    )
  );

      const files = [...imageFiles, ...videoFiles];

      const canShareFiles =
        typeof navigator.canShare === "function"
          ? navigator.canShare({ files })
          : false;

      if (canShareFiles) {
        // Zalo's iOS Share Extension aborts mixed text + multi-image payloads
        // after sending only part of the images. The text has already been
        // copied above, so give the native share sheet images only.
        await navigator.share({ files });

        onClose();
        return;
      }
    }

      const collageFile = await buildCollageFileFromUrls(
        selected,
        room.room_code || room.id,
        (url, index) =>
          Promise.resolve(preparedFiles[url] ?? prepareImageFile(url, index))
      );

      const canShareCollage =
        typeof navigator.canShare === "function"
          ? navigator.canShare({ files: [collageFile] })
          : false;

      if (navigator?.share && canShareCollage) {
        await navigator.share({
          files: [collageFile],
        });
        onClose();
        return;
      }

      const url = URL.createObjectURL(collageFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = collageFile.name;
      a.click();

      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("Thiết bị không hỗ trợ share trực tiếp — đã tải 1 ảnh tổng hợp");
      onClose();
    } catch (e) {
      console.error("handleShare error:", e);
      showToast("Không thể chia sẻ ngay lúc này");
    } finally {
      setSharing(false);
    }
  }

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <>
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
        onClick={onClose}
      >
        <div
          className="
            flex w-full flex-col overflow-hidden
            max-h-[calc(100dvh-16px)]
            rounded-t-2xl
            border border-white/15
            bg-[rgba(252,202,141,0.25)]
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
                onClick={onClose}
                className="px-3 py-1 rounded-lg text-[#F4E7D6] hover:bg-white/10"
              >
                Đóng
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
            <div className="grid grid-cols-2 items-start gap-4 sm:gap-6">
              <div className="space-y-3">
                {isAdmin && (
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

                {isAdmin && (
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
            {shareVideoUrls.length > 0 && (
              <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={includeVideos}
                    onChange={(e) => setIncludeVideos(e.target.checked)}
                    className="mt-1"
                  />

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#F4E7D6]">
                      Gửi video kèm theo
                    </div>
                    
                    {includeVideos && (
                      <div className="mt-2 text-xs text-[#F4E7D6]/75">
                        {preparingVideos
                          ? "Đang chuẩn bị video..."
                          : "Video sẽ được gửi nếu thiết bị hỗ trợ."}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#F4E7D6]/80">
                  Ảnh gửi kèm (ưu tiên dưới 10 ảnh)
                </div>

                <div className="text-xs text-[#F4E7D6]/60">
                  Đã chọn {shareImageUrls.length}/{selectedImageUrls.length}
                </div>
              </div>

              {selectedImageUrls.length > 0 ? (
                <>
                  <div className="grid grid-cols-5 gap-2">
                    {selectedImageUrls.map((url, idx) => {
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
                          title={selected ? "Bấm để bỏ chọn ảnh" : "Bấm để chọn ảnh"}
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
                      onClick={() => setShareImageUrls(selectedImageUrls)}
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
                {sharing || preparingImages || preparingVideos
                ? includeVideos && shareVideoUrls.length > 0
                  ? `Đang chuẩn bị ${shareImageUrls.length} ảnh + ${shareVideoUrls.length} video...`
                  : `Đang chuẩn bị ${shareImageUrls.length} ảnh...`
                : includeVideos && shareVideoUrls.length > 0
                  ? "Chia sẻ ảnh/video + copy nội dung"
                  : shareImageUrls.length > 0
                    ? "Chia sẻ"
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

      {toast && (
        <div
          className="
            fixed z-[2147483647] bottom-6 left-1/2 -translate-x-1/2
            px-5 py-2.5 text-sm font-medium text-white
            rounded-full
            border border-white/20
            bg-[rgba(255,255,255,0.2)]
            backdrop-blur-[20px]
            shadow-[0_8px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]
          "
        >
          {toast}
        </div>
      )}
    </>,
    document.body
  );
}
