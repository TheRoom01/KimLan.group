'use client'

import { useEffect, useState, useRef, type CSSProperties } from 'react'
import type { Room, TabKey, RoomStatus } from '../../types/room'
import type { RoomForm, RoomDetail } from './types'
import { supabase } from '@/lib/supabase'

import TabButton from './TabButton'
import RoomInfoTab from './RoomInfoTab'
import RoomFeeTab from './RoomFeeTab'
import RoomAmenityTab from './RoomAmenityTab'

/* ================= STORAGE KEY HELPERS ================= */
// Symbols: func toSafeStorageKey
function toSafeStorageKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD') // tách dấu tiếng Việt
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-') // ký tự lạ/space => "-"
    .replace(/-+/g, '-') // gộp "--"
    .replace(/^-|-$/g, '') // bỏ "-" đầu/cuối
}

/* ================= DEFAULT DETAIL (QUAN TRỌNG) ================= */

const defaultDetailForm: RoomDetail = {
  electric_fee_value: 0,
  electric_fee_unit: 'kWh',

  water_fee_value: 0,
  water_fee_unit: 'người/tháng',

  service_fee_value: 0,
  service_fee_unit: 'phòng/tháng',

  parking_fee_value: 0,
  parking_fee_unit: 'chiếc',

  other_fee_value: 0,
  other_fee_note: '',

  /* amenities */
  has_elevator: false,
  has_stairs: false,
  fingerprint_lock: false,
  allow_pet: false,
  allow_cat: false,
  allow_dog: false,
  has_parking: false,
  has_basement: false,

  /* washer / dryer */
  shared_washer: false,
  private_washer: false,
  shared_dryer: false,
  private_dryer: false,

  other_amenities: '',
  detail_json: null,
}

/* ================= PROPS ================= */

type Props = {
  open: boolean
  onClose: () => void
  onNotify?: (msg: string) => void
  editingRoom: Room | null
  activeTab: TabKey
  setActiveTab: (tab: TabKey) => void

  // ✅ onSaved nhận room mới để trang admin cập nhật ngay
  onSaved: (updatedRoom: Room, opts?: { isNew?: boolean }) => void | Promise<void>
}

function normalizeStatus(v?: RoomStatus | string | null) {
  const s = String(v ?? '').toLowerCase().trim()
  if (s.includes('thuê')) return 'Đã thuê'
  if (s.includes('trống') || s === 'trong') return 'Trống'
  return 'Trống'
}

/* ================= COMPONENT ================= */

export default function RoomModal({
  open,
  onClose,
  editingRoom,
  activeTab,
  onNotify,
  setActiveTab,
  onSaved,
}: Props) {
  const isEdit = Boolean(editingRoom?.id)

   const [roomForm, setRoomForm] = useState<RoomForm>({
    room_code: '',
    room_type: '',
    house_number: '',
    address: '',
    ward: '',
    district: '',
    price: 0,
    status: 'Trống',
    description: '',
    link_zalo: '',
    zalo_phone: '',
    // media optional in RoomForm (tùy bạn đã khai báo chưa)
    media: [],
    chinh_sach: '',
    
  })

  
  const [detailForm, setDetailForm] = useState<RoomDetail>(defaultDetailForm)
const [feeAutofillDone, setFeeAutofillDone] = useState(false)
  
    const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const lastAutofillKeyRef = useRef<string>("");

  // ✅ NEW: draft room id cho flow "thêm mới + upload ngay"
  const draftRoomIdRef = useRef<string>("");

  // ✅ NEW: nhớ danh sách media ban đầu để biết user có thật sự đổi ảnh không
  const initialMediaSigRef = useRef<string>("");

  function genDraftId(): string {
    try {
      // ưu tiên UUID chuẩn nếu có
      // @ts-ignore
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        // @ts-ignore
        return crypto.randomUUID();
      }
    } catch {}
    // fallback đơn giản (vẫn đủ unique cho folder)
    return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }


   async function fileToHTMLImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      // @ts-ignore
      if (img.decode) await img.decode()
      else {
        await new Promise<void>((res, rej) => {
          img.onload = () => res()
          img.onerror = () => rej(new Error('Image load failed'))
        })
      }
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  function fillCanvasWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
    // ✅ ưu tiên ImageBitmap (nhanh)
    try {
      const bmp = await createImageBitmap(file)
      if ((bmp as any)?.width > 0 && (bmp as any)?.height > 0) return bmp
      try { bmp.close?.() } catch {}
    } catch {}

    // ✅ fallback decode bằng HTMLImageElement (ổn định hơn cho JPG tải từ Zalo)
    const img = await fileToHTMLImage(file)
    const canvas = document.createElement('canvas')
    const w = Math.max(1, (img as any).naturalWidth || img.width || 1)
    const h = Math.max(1, (img as any).naturalHeight || img.height || 1)
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No canvas context (fallback)')

    fillCanvasWhite(ctx, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    const bmp2 = await createImageBitmap(canvas)
    if ((bmp2 as any)?.width > 0 && (bmp2 as any)?.height > 0) return bmp2
    try { bmp2.close?.() } catch {}
    throw new Error('decode_failed_after_fallback')
  }

async function canvasToWebpFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  quality = 0.82,
  minBytes = 8 * 1024 // ✅ quá nhỏ => thường encode lỗi/đen
): Promise<File> {
  const makeBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/webp',
        quality
      )
    })

  const blob1 = await makeBlob()
  if (blob1.size >= minBytes) return new File([blob1], fileName, { type: 'image/webp' })

  // ✅ retry 1 lần
  const blob2 = await makeBlob()
  if (blob2.size >= minBytes) return new File([blob2], fileName, { type: 'image/webp' })

  throw new Error(`webp_encode_failed_small_blob size=${blob2.size}`)
}

function resizeToCanvas(src: ImageBitmap, maxWidthOrHeight: number): HTMLCanvasElement {
  const { width, height } = src
  const scale = Math.min(1, maxWidthOrHeight / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas context')

  // chất lượng resize tốt
    ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // ✅ chống nền đen do alpha/decoder
  fillCanvasWhite(ctx, w, h)

  ctx.drawImage(src, 0, 0, w, h)

  return canvas
}

/**
 * Resize ảnh về WebP (max 1600px), cố gắng target dung lượng bằng cách giảm quality.
 * - targetBytes: ví dụ 500KB
 */
async function compressImageWebp(
  file: File,
  opts: { max: number; targetBytes: number; baseName: string }
): Promise<File> {
  const bmp = await fileToImageBitmap(file)
  const canvas = resizeToCanvas(bmp, opts.max)
  bmp.close?.()

  // thử quality giảm dần để đạt target
  const qualities = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6]
  let out: File | null = null

  for (const q of qualities) {
    const f = await canvasToWebpFile(canvas, `${opts.baseName}.webp`, q)
    out = f
    if (f.size <= opts.targetBytes) break
  }

  return out!
}

async function makeThumbWebp(
  file: File,
  opts: { max: number; targetBytes: number }
): Promise<File> {
  const bmp = await fileToImageBitmap(file)
  const canvas = resizeToCanvas(bmp, opts.max)
  bmp.close?.()

  const qualities = [0.85, 0.8, 0.75, 0.7]
  let out: File | null = null
  for (const q of qualities) {
    const f = await canvasToWebpFile(canvas, `thumb.webp`, q)
    out = f
    if (f.size <= opts.targetBytes) break
  }
  return out!
}

  // ================== UPLOAD FILES ==================
const handleUploadFiles = async (files: File[]) => {
  if (!files?.length) return

  const okFiles = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
  if (!okFiles.length) return

 // ===== VIDEO RULE (FRONTEND) =====
const MAX_VIDEO_MB = 20
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024

const MAX_VIDEOS_PER_ROOM = 2
const MAX_VIDEO_SECONDS = 90 // < 1m30s

const existingVideosCount = Array.isArray((roomForm as any)?.media)
  ? (roomForm as any).media.filter((m: any) => m?.type === 'video').length
  : 0

const selectedVideos = okFiles.filter((f) => f.type.startsWith('video/'))
if (existingVideosCount + selectedVideos.length > MAX_VIDEOS_PER_ROOM) {
  alert(`Mỗi phòng chỉ được upload tối đa ${MAX_VIDEOS_PER_ROOM} video`)
  return
}

async function assertVideoDuration(file: File) {
  await new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      const d = video.duration
      if (!Number.isFinite(d)) return reject(new Error('Không đọc được thời lượng video'))
      if (d >= MAX_VIDEO_SECONDS) {
        return reject(new Error(`Mỗi video phải ngắn hơn ${MAX_VIDEO_SECONDS} giây (1 phút 30)`))
      }
      resolve()
    }

    video.onerror = () => reject(new Error('Không đọc được video'))
  })
}
// =================================

  // Validate size/type trước khi upload
for (const f of okFiles) {
  if (f.type.startsWith('video/')) {
    // size (<= 20MB)
    if (f.size > MAX_VIDEO_BYTES) {
      alert(`Video quá lớn (>${MAX_VIDEO_MB}MB): ${f.name}`)
      return
    }

    // mp4 only
    const isMp4 = f.type.includes('mp4') || f.name.toLowerCase().endsWith('.mp4')
    if (!isMp4) {
      alert(`Chỉ hỗ trợ video mp4: ${f.name}`)
      return
    }

    // duration < 90s
    try {
      await assertVideoDuration(f) // trong assertVideoDuration nhớ dùng điều kiện: if (d >= 90) reject(...)
    } catch (e: any) {
      alert(e?.message || `Video không hợp lệ: ${f.name}`)
      return
    }
  } else {
    // image: tạm giới hạn 20MB cho tới khi làm bước resize/webp
    const maxBytes = 20 * 1024 * 1024
    if (f.size > maxBytes) {
      alert(`Ảnh quá lớn: ${f.name}`)
      return
    }
  }
}

  setUploading(true)
  try {
    // NOTE: patch 2 bạn skip, nên vẫn dùng room_code / unknown
   const safeRoomCode =
    String(roomForm.room_code || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '')

  if (!safeRoomCode) {
    alert('Thiếu Mã phòng (room_code). Vui lòng nhập mã trước khi upload ảnh/video.')
    return
  }
  // =======================
// ✅ NEW: cho phép thêm mới + upload ngay (dùng draft id)
// =======================
const roomUuid = String(editingRoom?.id || draftRoomIdRef.current || '').trim()

if (!roomUuid) {
  alert('Không tạo được ID phòng tạm. Vui lòng thử lại hoặc bấm Lưu phòng trước.')
  return
}

    // ===== helper: run pool concurrency =====
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  const executing = new Set<Promise<void>>()

  for (const item of items) {
    const p = worker(item).finally(() => executing.delete(p))
    executing.add(p)

    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
}

// ===== compute existing images BEFORE upload (stable) =====
const existingImagesCount = Array.isArray((roomForm as any)?.media)
  ? (roomForm as any).media.filter((m: any) => m?.type === 'image').length
  : 0

// thumb chỉ tạo nếu phòng trước đó chưa có ảnh, và batch này có ít nhất 1 ảnh
const firstImageFileInBatch = okFiles.find((f) => f.type.startsWith('image/')) ?? null
const shouldMakeThumb = existingImagesCount === 0 && Boolean(firstImageFileInBatch)

// ===== upload concurrently, update UI incrementally =====
const CONCURRENCY = 3
let thumbStarted = false

// ✅ serialize convert ảnh để tránh race/memory pressure trên mobile
let imageConvertChain = Promise.resolve()
async function withImageConvertLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = imageConvertChain.then(fn, fn)
  imageConvertChain = run.then(() => undefined, () => undefined)
  return run
}

await runPool(okFiles, CONCURRENCY, async (file) => {
  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')

  // Ảnh: convert WebP 1600px, target ~500KB
  let uploadFile: File = file
    if (isImage) {
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
    try {
      uploadFile = await withImageConvertLock(() =>
        compressImageWebp(file, {
          max: 1600,
          targetBytes: 500 * 1024,
          baseName,
        })
      )
    } catch (e) {
      console.warn('compressImageWebp failed, fallback to original', e)
      uploadFile = file
    }
  }


  // ✅ upload qua API R2 (server)
// =======================
// NEW: Presign + PUT direct R2 (no /api/upload/r2)
// =======================

const roomId = roomUuid

// helper: xin presign rồi PUT lên R2, trả về publicUrl
async function presignAndPutToR2(params: {
  room_id: string
  file: File
  fixed_name?: 'thumb.webp'
}) {
  const { room_id, file, fixed_name } = params

  const pres = await fetch('/api/upload/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id,
      fixed_name: fixed_name ?? undefined,
      file_name: fixed_name ?? file.name ?? 'file.bin',
      content_type: file.type || (fixed_name ? 'image/webp' : 'application/octet-stream'),
      size: file.size,
    }),
  })

  if (!pres.ok) {
    const status = pres.status
    const ct = pres.headers.get('content-type') || ''
    let rawText = ''
    try {
      rawText = await pres.text()
    } catch {}

    const snippet = (rawText || '').slice(0, 300).trim()
    const detail =
      `[upload/r2-presign] status=${status} content-type=${ct}\n` +
      (snippet ? `response: ${snippet}` : '(no body)')

    console.error(detail)
    throw new Error(`Presign failed (HTTP ${status})\n\n${detail}`)
  }

  const pj = await pres.json()
  const uploadUrl = String(pj?.uploadUrl || '').trim()
  const publicUrl = String(pj?.publicUrl || pj?.url || '').trim()
  const requiredHeaders = (pj?.requiredHeaders || {}) as Record<string, string>

  if (!uploadUrl || !publicUrl) {
    throw new Error('Presign failed: missing uploadUrl/publicUrl')
  }

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: requiredHeaders,
    body: file,
  })

  if (!put.ok) {
    const status = put.status
    const ct = put.headers.get('content-type') || ''
    let rawText = ''
    try {
      rawText = await put.text()
    } catch {}

    const snippet = (rawText || '').slice(0, 300).trim()
    const detail =
      `[r2/put] status=${status} content-type=${ct}\n` +
      (snippet ? `response: ${snippet}` : '(no body)')

    console.error(detail)
    throw new Error(`R2 PUT failed (HTTP ${status})\n\n${detail}`)
  }

  return { publicUrl }
}

// ---- main upload (image/video) ----
const { publicUrl } = await presignAndPutToR2({
  room_id: roomId,
  file: uploadFile,
})

const mediaItem = {
  type: isVideo ? 'video' : 'image',
  url: publicUrl,
  path: publicUrl,
} as const

// ✅ UI update ngay (không đợi xong hết)
setRoomForm((prev: any) => {
  const prevMedia = Array.isArray(prev.media) ? prev.media : []
  return { ...prev, media: [...prevMedia, mediaItem] }
})

// ✅ thumb.webp: chỉ 1 lần, và đúng “ảnh đầu tiên của phòng”
if (shouldMakeThumb && isImage && file === firstImageFileInBatch && !thumbStarted) {
  thumbStarted = true
  try {
    const thumbFile = await makeThumbWebp(file, { max: 600, targetBytes: 250 * 1024 })

    // presign fixed_name=thumb.webp => key cố định rooms/<roomId>/images/thumb.webp
    await presignAndPutToR2({
      room_id: roomId,
      file: thumbFile,
      fixed_name: 'thumb.webp',
    })
  } catch (e) {
    console.warn('Upload thumb.webp failed', e)
  }
}
})

  } catch (e: any) {
    console.error('Upload failed:', e)
    alert(e?.message ?? 'Upload failed')
  } finally {
    setUploading(false)
  }
}

 async function tryAutofillByAddress(house: string, addr: string, opts?: { force?: boolean }) {
  const house_number = String(house ?? "").trim();
  const address = String(addr ?? "").trim();
  if (!house_number || !address) {
    if (opts?.force) onNotify?.("Nhập đủ Số nhà + Địa chỉ trước khi đồng bộ.");
    return;
  }

  // Auto (blur) tránh sync lại cùng key; nhưng force thì luôn chạy
  const key = `${house_number}__${address}`;
  if (!opts?.force && lastAutofillKeyRef.current === key) return;
  lastAutofillKeyRef.current = key;

  // ✅ Bấm nút Đồng bộ nhà: luôn hỏi confirm (dù thêm mới hay edit)
  if (opts?.force) {
    const ok = window.confirm(
      `Đồng bộ theo nhà này?\nSố nhà: ${house_number}\nĐịa chỉ: ${address}\n\nSẽ ghi đè các field đã chọn theo PHÒNG MỚI NHẤT.`
    );
    if (!ok) {
      onNotify?.("Đã huỷ đồng bộ.");
      return;
    }
  }

  // 1) lấy PHÒNG MỚI NHẤT theo house_number + address (không quan tâm room_details)
  let q = supabase
    .from("rooms")
    .select("id, ward, district, link_zalo, zalo_phone, chinh_sach, updated_at")
    .eq("house_number", house_number)
    .eq("address", address)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (editingRoom?.id) q = q.neq("id", editingRoom.id);

  const { data: roomSample, error: roomErr } = await q.maybeSingle();

  if (roomErr) {
    onNotify?.(`Đồng bộ thất bại: ${roomErr.message}`);
    return;
  }
  if (!roomSample) {
    onNotify?.("Không tìm thấy phòng mới nhất trùng Số nhà + Địa chỉ để đồng bộ.");
    return;
  }

  // 2) lấy room_details của phòng mới nhất qua RPC (bypass RLS)
const { data: rpcData, error: detailErr } = await supabase.rpc(
  "fetch_room_detail_full_v1",
  {
    p_id: roomSample.id,
    p_role: 0,
  }
)

if (detailErr) {
  onNotify?.(`Đồng bộ chi phí/tiện ích thất bại: ${detailErr.message}`)
  // vẫn tiếp tục sync phần "nhà"
}

// RPC trả "room full", details có thể nằm ở nhiều key khác nhau
const detailSample =
  (rpcData as any)?.room_detail ??
  (rpcData as any)?.room_details ??
  (rpcData as any)?.detail ??
  (rpcData as any)?.details ??
  null


  // 3) OVERWRITE theo phòng mới nhất
  setRoomForm((prev) => ({
    ...prev,
    ward: (roomSample as any).ward ?? "",
    district: (roomSample as any).district ?? "",
    link_zalo: (roomSample as any).link_zalo ?? "",
    zalo_phone: (roomSample as any).zalo_phone ?? "",
    chinh_sach: (roomSample as any).chinh_sach ?? "",
  }));

   // room_details: chỉ overwrite khi RPC không lỗi
  if (!detailErr) {
    if (detailSample) {
      setDetailForm({ ...defaultDetailForm, ...(detailSample as any) });
    } else {
      setDetailForm(defaultDetailForm);
    }
  }

  onNotify?.("✅ Đã đồng bộ theo phòng mới nhất.");
}

  /* ===== LOAD DATA WHEN EDIT ===== */
  useEffect(() => {
    setErrorMsg(null)

    // THÊM MỚI
   if (!editingRoom?.id) {
      // ✅ tạo draft id để upload ảnh/video ngay cả khi chưa lưu phòng
      draftRoomIdRef.current = genDraftId();

      setRoomForm({
        room_code: '',
        room_type: '',
        house_number: '',
        address: '',
        ward: '',
        district: '',
        price: 0,
        status: 'Trống',
        description: '',
        link_zalo: '',
         zalo_phone: '',
        media: [],
        chinh_sach: '',
      })
      setDetailForm(defaultDetailForm)
      setFeeAutofillDone(false)
      return
    }

    // ✅ NEW: snapshot media ban đầu (để save không động ảnh thì không prune)
    try {
      const media0 = Array.isArray((editingRoom as any)?.media) ? (editingRoom as any).media : [];
      const sig0 = JSON.stringify(
        media0
          .filter((m: any) => m?.url && (m?.type === "image" || m?.type === "video"))
          .map((m: any) => `${m.type}:${String(m.url).trim()}`)
          .sort()
      );
      initialMediaSigRef.current = sig0;
    } catch {
      initialMediaSigRef.current = "";
    }


    // EDIT ROOM
    setRoomForm({
      room_code: editingRoom.room_code ?? '',
      room_type: editingRoom.room_type ?? '',
      house_number: editingRoom.house_number ?? '',
      address: editingRoom.address ?? '',
      ward: editingRoom.ward ?? '',
      district: editingRoom.district ?? '',
      price: editingRoom.price ?? 0,
      status: normalizeStatus(editingRoom.status),
      description: editingRoom.description ?? '',
      media: Array.isArray((editingRoom as any).media) ? (editingRoom as any).media : [],
      link_zalo: (editingRoom as any).link_zalo ?? '',
      chinh_sach: (editingRoom as any).chinh_sach ?? '',
      zalo_phone:
      (editingRoom as any).zalo_phone ??
      (() => {
        const raw = String((editingRoom as any).link_zalo ?? "");
        const lines = raw.split(/\r?\n/);
        return lines.slice(1).join("\n").trim(); // fallback data cũ
      })(),

    })

       // ✅ Load full room data via RPC (bypass RLS like /rooms/[id])
  void (async () => {
    try {
      const { data, error } = await supabase.rpc("fetch_room_detail_full_v1", {
        p_id: editingRoom.id,
        p_role: 0, // giữ param để tương thích; role thực tế tính theo auth.uid() ở DB
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const room = (data ?? {}) as any;

      // 1) Media: ưu tiên room.media (nếu RPC trả), fallback image_urls
      const mediaFromRpc = Array.isArray(room?.media)
        ? room.media
            .filter((m: any) => m?.url && (m?.type === "image" || m?.type === "video"))
            .map((m: any) => ({ type: m.type, url: String(m.url), path: String(m.url) }))
        : [];

      const imageUrlsFallback = Array.isArray(room?.image_urls)
        ? room.image_urls.map((u: any) => ({ type: "image", url: String(u), path: String(u) }))
        : [];

      const nextMedia = mediaFromRpc.length ? mediaFromRpc : imageUrlsFallback;

      setRoomForm((prev: any) => ({
        ...prev,
        media: nextMedia,
      }));

      // 2) Detail: ưu tiên room.room_detail / room.room_details (như /rooms/[id])
      const detail =
        (room?.room_detail ??
          room?.room_details ??
          room?.detail ??
          room?.details ??
          null) as any;

      setDetailForm(detail ? { ...defaultDetailForm, ...(detail as RoomDetail) } : defaultDetailForm);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Load phòng thất bại");
    }
  })();

  }, [editingRoom])

  const requestClose = () => {
  // nếu đang lưu / upload thì không cho đóng (tránh lỗi UX)
  if (saving || uploading) return

  const ok = window.confirm("Bạn có chắc muốn đóng? Thay đổi sẽ không được lưu.")
  if (ok) onClose()
}

  if (!open) return null

  /* ===== VALIDATE ===== */
  function validate(): string | null {
    if (!roomForm.room_code.trim()) return 'Vui lòng nhập mã phòng.'
    if (!roomForm.address.trim() && !roomForm.house_number.trim()) return 'Nhập ít nhất Số nhà hoặc Địa chỉ.'
    if (roomForm.price < 0) return 'Giá không hợp lệ.'
    return null
  }

  /* ===== SUBMIT ===== */
  async function handleSubmit() {
  const media = Array.isArray((roomForm as any).media) ? (roomForm as any).media : []
  const v = validate()
  if (v) {
    setErrorMsg(v)
    return
  }

  try {
    setSaving(true)
    setErrorMsg(null)

    let roomId = editingRoom?.id
    let updatedRoom: Room | null = null
    const isNew = !isEdit

    // ✅ payload rooms: KHÔNG còn media nữa
    const payload = {
      room_code: roomForm.room_code,
      room_type: roomForm.room_type,
      house_number: roomForm.house_number,
      address: roomForm.address,
      ward: roomForm.ward,
      district: roomForm.district,
      price: roomForm.price,
      status: normalizeStatus(roomForm.status),
      description: roomForm.description,
      link_zalo: roomForm.link_zalo,
      zalo_phone: roomForm.zalo_phone,
      chinh_sach: roomForm.chinh_sach,
    }

    if (isEdit && roomId) {
      const { data, error } = await supabase.from('rooms').update(payload).eq('id', roomId).select('*').single()
      if (error) throw error
      updatedRoom = data as Room
        } else {
      // ✅ nếu đã upload trước khi lưu, reuse draft id để room_id khớp folder media
      const newId = String(draftRoomIdRef.current || "").trim() || (
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined
      )

      const insertData = newId ? { id: newId, ...payload } : payload

      const { data, error } = await supabase
        .from('rooms')
        .insert(insertData)
        .select('*')
        .single()

      if (error) throw error
      updatedRoom = data as Room
      roomId = (data as any)?.id
    }

    if (!roomId || !updatedRoom) throw new Error('Không lấy được dữ liệu phòng sau khi lưu.')

    // =========================
    // ✅ SYNC room_media (B7.6–B7.7)
    // =========================
    const normalized = (Array.isArray(media) ? media : [])
      .filter((m: any) => m?.url && (m?.type === 'image' || m?.type === 'video'))
      .map((m: any) => ({
        type: m.type as 'image' | 'video',
        url: String(m.url),
      }))

    const firstImageIndex = normalized.findIndex((m) => m.type === 'image')
    const coverIndex = firstImageIndex >= 0 ? firstImageIndex : (normalized.length ? 0 : -1)

    const rows = normalized.map((m, idx) => ({
      room_id: roomId,
      provider: 'r2',
      type: m.type,
      url: m.url,
      is_cover: idx === coverIndex,
      sort_order: idx,
    }))

  // replace-all để đảm bảo sort_order đúng 100%
{
  const del = await supabase.from('room_media').delete().eq('room_id', roomId)
  if (del.error) throw del.error

  if (rows.length > 0) {
    const ins = await supabase.from('room_media').insert(rows)
    if (ins.error) throw ins.error
  }

  // ✅ PRUNE R2: xoá ảnh đã bị remove khỏi DB + xoá thumb.webp cũ để tránh stale
  // keep_urls chỉ lấy những ảnh/video còn tồn tại và thuộc R2
  const keepUrls = (normalized || [])
    .map((x: any) => String(x?.url || "").trim())
    .filter(Boolean);

  const roomCodeForR2 = String(updatedRoom?.room_code || roomForm?.room_code || "").trim();

 // ✅ NEW: chỉ prune khi user thật sự thay đổi danh sách media
let shouldPrune = true;
try {
  const sigNow = JSON.stringify(
    (normalized || [])
      .map((m: any) => `${m.type}:${String(m.url).trim()}`)
      .sort()
  );

  const sig0 = String(initialMediaSigRef.current || "");
  // nếu đang edit và media không đổi -> không prune
  if (isEdit && sig0 && sigNow === sig0) shouldPrune = false;

  // safety: nếu vì lý do nào đó media đang rỗng (load lỗi) mà trước đó có sig0 -> không prune
  if (isEdit && sig0 && (normalized || []).length === 0) shouldPrune = false;
} catch {
  // nếu so sánh lỗi thì thôi, đừng prune cho an toàn
  shouldPrune = false;
}

if (shouldPrune) {
  const pruneResp = await fetch(`/api/rooms/${roomId}/prune-r2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_code: roomCodeForR2,
      keep_urls: keepUrls,
    }),
  });

    if (!pruneResp.ok) {
      console.warn("prune-r2 failed", await pruneResp.text());
    }
  } else {
    console.log("Skip prune-r2: media not changed (or unsafe to prune)");
  }
}

// ✅ ĐÁNH DẤU HOME "DIRTY" ĐỂ BACK VỀ HOME KHÔNG RESTORE LIST CŨ (ảnh cũ)
try {
  const stamp = String(Date.now());

  // same-tab
  sessionStorage.setItem("HOME_DIRTY_V1", stamp); // stamp để debug dễ hơn
  sessionStorage.removeItem("HOME_BACK_SNAPSHOT_V1");
  sessionStorage.removeItem("HOME_STATE_V2");
  sessionStorage.removeItem("HOME_BACK_HINT_V1"); // ✅ chặn D2 restore URL từ hint stale

  // cross-tab (Home list đang mở ở tab khác)
  localStorage.setItem("HOME_DIRTY_V1", stamp);
} catch {}

    // ✅ UX: đóng modal ngay, update list ngay
    setSaving(false)
    onClose()
       onNotify?.('Đã lưu phòng. Đang lưu chi tiết...')
    void onSaved(updatedRoom, { isNew })
    
// ✅ Lưu chi tiết qua RPC (chuẩn Supabase, bypass RLS)
void (async () => {
  const { error } = await supabase.rpc('save_room_details_v1', {
    p_room_id: roomId,
    p_payload: detailForm, // detailForm có thể là object thường, supabase sẽ gửi json
  })

  if (error) {
    console.error('save_room_details_v1 failed:', error)
    alert(`Lưu chi tiết thất bại: ${error.message}`)
  }
})()

  } catch (e: any) {
    setErrorMsg(e?.message ?? 'Lưu thất bại')
  } finally {
    setSaving((s) => (s ? false : s))
  }
}

  /* ================= UI ================= */

  return (
    <div style={overlay} onMouseDown={requestClose}>
      <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={modalBody}>
          <h3>{isEdit ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}</h3>

          {errorMsg && <div style={errorBox}>Lỗi: {errorMsg}</div>}

          <div style={tabs}>
            <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')}>
              Thông tin
            </TabButton>
            <TabButton active={activeTab === 'fee'} onClick={() => setActiveTab('fee')}>
              Chi phí
            </TabButton>
            <TabButton active={activeTab === 'amenity'} onClick={() => setActiveTab('amenity')}>
              Tiện ích
            </TabButton>
          </div>

          {/* ===== TAB INFO ===== */}
          {activeTab === 'info' && (
            <RoomInfoTab
              value={roomForm}
              onChange={setRoomForm}
              updatedAt={editingRoom?.updated_at ?? null}
              uploading={uploading}
              onUploadFiles={handleUploadFiles}
              chinh_sach={roomForm.chinh_sach}
             onChangeChinhSach={(v: string) => setRoomForm(prev => ({ ...prev, chinh_sach: v }))}
             onAutofillByAddress={tryAutofillByAddress}
              />
          )}

          {/* ===== TAB FEE ===== */}
           {activeTab === 'fee' && (
            <RoomFeeTab
              detailForm={detailForm}
              isNew={!editingRoom?.id}
              allowAutofill={!feeAutofillDone && !editingRoom?.id}
              onAutofillDone={() => setFeeAutofillDone(true)}
              onChange={(patch) => {
                // user sửa/xoá (kể cả về 0) => coi như đã “touched”, không autofill lại nữa
                setFeeAutofillDone(true)
                setDetailForm((prev) => ({ ...prev, ...patch }))
              }}
            />
          )}


          {/* ===== TAB AMENITY ===== */}
          {activeTab === 'amenity' && (
            <RoomAmenityTab
              detailForm={detailForm}
              onChange={(patch) => setDetailForm((prev) => ({ ...prev, ...patch }))}
            />
          )}
        </div>

      <div
  style={{
    ...footerSticky,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
  }}
>
  {/* LEFT */}
  <div>
    <button onClick={requestClose} style={btnCancel} disabled={saving} type="button">
      Huỷ
    </button>
  </div>

  {/* CENTER */}
  <div style={{ display: "flex", justifyContent: "center" }}>
  <button
    type="button"
    style={btnSync}
    disabled={saving}
    onClick={() => {
      tryAutofillByAddress(roomForm.house_number, roomForm.address, { force: true });
    }}
  >
    Đồng bộ nhà
  </button>

  </div>

  {/* RIGHT */}
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <button onClick={handleSubmit} style={btnSaveLight} disabled={saving} type="button">
      {saving ? "Đang lưu..." : "Lưu"}
    </button>
  </div>
</div>

      </div>
    </div>
  )
}

/* ================= STYLE ================= */

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  padding: 16,
  overflowY: 'auto',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const modal: CSSProperties = {
  width: '100%',
  maxWidth: 1000,
  maxHeight: '85vh',
  background: '#fff',
  borderRadius: 12,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const modalBody: CSSProperties = {
  padding: 20,
  overflowY: 'auto',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  flex: 1,
  minHeight: 0,
}

const footerSticky: CSSProperties = {
  padding: 16,
  borderTop: '1px solid #e5e7eb',
  background: '#fff',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
}

const tabs: CSSProperties = { display: 'flex', gap: 8, marginBottom: 16 }

const errorBox: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#991b1b',
}

const btnCancel: CSSProperties = {
  background: '#e5e7eb',
  color: '#111827',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
}

const btnSaveLight: CSSProperties = {
  background: '#60a5fa',
  color: '#fff',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
}
const btnSync: CSSProperties = {
  background: '#111827',
  color: '#fff',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
}


