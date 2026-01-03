'use client'

import { useEffect, useState, type CSSProperties } from 'react'
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
    gallery_urls: '',
    link_zalo: '',
    // media optional in RoomForm (tùy bạn đã khai báo chưa)
    media: [],
    chinh_sach: '',
    
  })

  const [detailForm, setDetailForm] = useState<RoomDetail>(defaultDetailForm)

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // ================== UPLOAD FILES ==================
  const handleUploadFiles = async (files: File[]) => {
    if (!files?.length) return

    const okFiles = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (!okFiles.length) return

    for (const f of okFiles) {
      const maxBytes = f.type.startsWith('video/') ? 300 * 1024 * 1024 : 20 * 1024 * 1024
      if (f.size > maxBytes) {
        alert(`File quá lớn: ${f.name}`)
        return
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
      const uploadedImageUrls: string[] = []

      for (const file of okFiles) {
        const isVideo = file.type.startsWith('video/')
        const folder = isVideo ? 'videos' : 'images'

        const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase()
        const id = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`
        const filePath = `${folder}/room-${safeRoomCode}/${id}.${ext}`

        const { error: upErr } = await supabase.storage.from('room-images').upload(filePath, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: '3600',
        })
        if (upErr) throw upErr

        const { data } = supabase.storage.from('room-images').getPublicUrl(filePath)
        const publicUrl = data?.publicUrl || ''

        uploadedMedia.push({
          type: isVideo ? 'video' : 'image',
          url: publicUrl,
          path: filePath,
        })

        if (!isVideo) uploadedImageUrls.push(publicUrl)
      }

      setRoomForm((prev: any) => {
        const prevMedia = Array.isArray(prev.media) ? prev.media : []
        const nextMedia = [...prevMedia, ...uploadedMedia]

        const prevGallery = String(prev.gallery_urls || '').trim()
        const prevGalleryArr = prevGallery
          ? prevGallery.split(',').map((x: string) => x.trim()).filter(Boolean)
          : []

        const nextGalleryArr = [...prevGalleryArr, ...uploadedImageUrls]
        const nextGallery = nextGalleryArr.join(', ')

        return {
          ...prev,
          media: nextMedia,
          gallery_urls: nextGallery,
        }
      })
    } catch (e: any) {
      console.error('Upload failed:', e)
      alert(e?.message ?? 'Upload failed')
    } finally {
      setUploading(false)
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
        gallery_urls: '',
        link_zalo: '',
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
      gallery_urls: editingRoom.gallery_urls ?? '',
      media: Array.isArray((editingRoom as any).media) ? (editingRoom as any).media : [],
      link_zalo: (editingRoom as any).link_zalo ?? '',
      chinh_sach: (editingRoom as any).chinh_sach ?? '',

    })

    ;(async () => {
      const { data, error } = await supabase
        .from('room_details')
        .select('*')
        .eq('room_id', editingRoom.id)
        .maybeSingle()

      if (error) {
        setErrorMsg(error.message)
        return
      }

      if (data) {
        const d: any = data

       setDetailForm({
  ...defaultDetailForm,
  ...(d as RoomDetail),
}) 
      
      } else {
        setDetailForm(defaultDetailForm)
      }
    })()
  }, [editingRoom])

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
    const imageUrlsFromMedia = media
      .filter((m: any) => m?.type === 'image' && m?.url)
      .map((m: any) => String(m.url))

    const galleryCompat = imageUrlsFromMedia.join(', ')

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
        media,
        gallery_urls: galleryCompat,
        link_zalo: roomForm.link_zalo,
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

      // ✅ UX: đóng modal ngay, update list ngay
      setSaving(false)
      onClose()
      onNotify?.('Đã lưu phòng. Đang lưu chi tiết...')
      void onSaved(updatedRoom, { isNew })

      // ✅ Lưu chi tiết chạy ngầm, không chặn UI
      const detailPayload = {
  ...detailForm,
  room_id: roomId,
} satisfies Partial<RoomDetail> & { room_id: string }


      void (async () => {
  try {
    const { error } = await supabase
  .from('room_details')
  .upsert(detailPayload, { onConflict: 'room_id' })


    if (error) {
      console.error(error)
    }
  } catch (err) {
    console.error(err)
  }
})()

    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Lưu thất bại')
    } finally {
      // ✅ phòng trường hợp đã setSaving(false) trước khi onClose()
      setSaving((s) => (s ? false : s))
    }
  }

  /* ================= UI ================= */

  return (
    <div style={overlay} onMouseDown={onClose}>
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
              />
          )}

          {/* ===== TAB FEE ===== */}
          {activeTab === 'fee' && (
            <RoomFeeTab detailForm={detailForm} onChange={(patch) => setDetailForm((prev) => ({ ...prev, ...patch }))} />
          )}

          {/* ===== TAB AMENITY ===== */}
          {activeTab === 'amenity' && (
            <RoomAmenityTab
              detailForm={detailForm}
              onChange={(patch) => setDetailForm((prev) => ({ ...prev, ...patch }))}
            />
          )}
        </div>

        <div style={footerSticky}>
          <button onClick={onClose} style={btnCancel} disabled={saving} type="button">
            Huỷ
          </button>
          <button onClick={handleSubmit} style={btnSaveLight} disabled={saving} type="button">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
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
