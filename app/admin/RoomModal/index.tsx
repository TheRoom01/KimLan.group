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
  
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const lastAutofillKeyRef = useRef<string>("");

  async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  // ImageBitmap decode nhanh hơn Image() và hỗ trợ tốt trên Chrome/Edge
  return await createImageBitmap(file)
}

async function canvasToWebpFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  quality = 0.82
): Promise<File> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/webp',
      quality
    )
  })
  return new File([blob], fileName, { type: 'image/webp' })
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
      (roomForm.room_code || 'unknown')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9-_]/g, '') || 'unknown'

    const uploadedMedia: { type: 'image' | 'video'; url: string; path: string }[] = []

    for (const file of okFiles) {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')

      // Ảnh: convert WebP 1600px, target ~500KB
      let uploadFile: File = file
      if (isImage) {
        const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
        uploadFile = await compressImageWebp(file, {
          max: 1600,
          targetBytes: 500 * 1024,
          baseName,
        })
      }

      // ✅ upload qua API R2 (server) — không dùng supabase.storage nữa
      const fd = new FormData()
      fd.append('room_id', `room-${safeRoomCode}`)
      fd.append('file', uploadFile)
      
      const res = await fetch('/api/upload/r2', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        let msg = 'Upload failed'
        try {
          const j = await res.json()
          msg = j?.error || j?.message || msg
        } catch {}
        throw new Error(msg)
      }

      const j = await res.json()
      const publicUrl = String(j?.url || '').trim()
      if (!publicUrl) throw new Error('Upload failed: missing url')

      uploadedMedia.push({
        type: isVideo ? 'video' : 'image',
        url: publicUrl,
        path: publicUrl,
      })

      // Nếu đây là ảnh đầu tiên của phòng (cover) thì tạo thumb.webp và upload với fixed_name
      if (isImage) {
        const existingImagesCount = Array.isArray((roomForm as any)?.media)
          ? (roomForm as any).media.filter((m: any) => m?.type === 'image').length
          : 0

        // cover = ảnh đầu tiên (phòng chưa có ảnh và batch này vừa upload ảnh đầu)
        const uploadedImagesCount = uploadedMedia.filter((m) => m.type === 'image').length

        if (existingImagesCount === 0 && uploadedImagesCount === 1) {
          const thumbFile = await makeThumbWebp(file, { max: 600, targetBytes: 250 * 1024 })

          const fdThumb = new FormData()
          fdThumb.append('room_id', `room-${safeRoomCode}`)
          fdThumb.append('fixed_name', 'thumb.webp')
          fdThumb.append('file', thumbFile)

          const resThumb = await fetch('/api/upload/r2', { method: 'POST', body: fdThumb })
          if (!resThumb.ok) {
            // không chặn toàn bộ flow nếu thumb lỗi, nhưng có log để debug
            console.warn('Upload thumb.webp failed')
          }
        }
      }

    }

    setRoomForm((prev: any) => {
      const prevMedia = Array.isArray(prev.media) ? prev.media : []
      const nextMedia = [...prevMedia, ...uploadedMedia]
      return { ...prev, media: nextMedia }
    })
  } catch (e: any) {
    console.error('Upload failed:', e)
    alert(e?.message ?? 'Upload failed')
  } finally {
    setUploading(false)
  }
}

 async function tryAutofillByAddress(house: string, addr: string, opts?: { force?: boolean }) {
  const house_number = house.trim();
  const address = addr.trim();
  if (!house_number || !address) return;

  const key = `${house_number}__${address}`;
  if (!opts?.force && lastAutofillKeyRef.current === key) return;
  lastAutofillKeyRef.current = key;

  // 1) tìm phòng mẫu gần nhất (KHÔNG lấy chính phòng đang edit)
  let q = supabase
    .from("rooms")
    .select("id, ward, district, link_zalo, chinh_sach")
    .eq("house_number", house_number)
    .eq("address", address)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (editingRoom?.id) q = q.neq("id", editingRoom.id);

  const { data: roomSample, error } = await q.maybeSingle();

  if (error || !roomSample) return;

  // 2) lấy room_details của phòng mẫu
  const { data: detailSample } = await supabase
    .from("room_details")
    .select(`
      electric_fee_value, electric_fee_unit,
      water_fee_value, water_fee_unit,
      service_fee_value, service_fee_unit,
      parking_fee_value, parking_fee_unit,
      other_fee_value, other_fee_note,
      has_elevator, has_stairs,
      shared_washer, private_washer,
      shared_dryer, private_dryer,
      has_parking, has_basement,
      fingerprint_lock,
      allow_cat, allow_dog,
      other_amenities
    `)
    .eq("room_id", roomSample.id)
    .maybeSingle();

  // 3) nếu đang edit thì hỏi confirm trước khi overwrite
  const isEdit = Boolean(editingRoom?.id);
  if (isEdit) {
    const ok = window.confirm("Đồng bộ thông tin theo địa chỉ này? (Sẽ ghi đè dữ liệu hiện tại)");
    if (!ok) return;
  }

  // 4) OVERWRITE (cách 2)
  setRoomForm((prev) => ({
    ...prev,
    ward: roomSample.ward ?? "",
    district: roomSample.district ?? "",
    link_zalo: roomSample.link_zalo ?? "",
    chinh_sach: roomSample.chinh_sach ?? "",
  }));

  if (detailSample) {
    setDetailForm((prev) => ({
      ...prev,
      ...detailSample,
    }));
  }
}

  /* ===== LOAD DATA WHEN EDIT ===== */
  useEffect(() => {
    setErrorMsg(null)

    // THÊM MỚI
    if (!editingRoom?.id) {
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
      return
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
      const { data, error } = await supabase.from('rooms').insert(payload).select('*').single()
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

  const pruneResp = await fetch(`/api/rooms/${roomId}/prune-r2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_code: roomCodeForR2,
      keep_urls: keepUrls,
    }),
  });

  if (!pruneResp.ok) {
    // không throw để tránh “lưu DB ok nhưng prune fail” làm mất dữ liệu UI,
    // bạn có thể bật throw nếu muốn bắt buộc prune thành công
    console.warn("prune-r2 failed", await pruneResp.text());
  }
} 

// ✅ ĐÁNH DẤU HOME "DIRTY" ĐỂ BACK VỀ HOME KHÔNG RESTORE LIST CŨ (ảnh cũ)
try {
  sessionStorage.setItem("HOME_DIRTY_V1", "1")
  sessionStorage.removeItem("HOME_BACK_SNAPSHOT_V1")
  sessionStorage.removeItem("HOME_STATE_V2")
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
                onChange={(patch) =>
                  setDetailForm((prev) => ({ ...prev, ...patch }))
                }
                isNew={!editingRoom?.id}
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


