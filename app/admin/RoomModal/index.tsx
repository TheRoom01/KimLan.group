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
    // media optional in RoomForm (tùy bạn đã khai báo chưa)
    media: [],
    chinh_sach: '',
    
  })

  
  const [detailForm, setDetailForm] = useState<RoomDetail>(defaultDetailForm)
  
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const lastAutofillKeyRef = useRef<string>("");

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

    for (const file of okFiles) {
      const isVideo = file.type.startsWith('video/')

      // ✅ upload qua API R2 (server) — không dùng supabase.storage nữa
      const fd = new FormData()
      fd.append('room_id', `room-${safeRoomCode}`)
      fd.append('file', file)

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

      // path chỉ để debug/hiển thị; giờ dùng luôn url (hoặc để rỗng)
      uploadedMedia.push({
        type: isVideo ? 'video' : 'image',
        url: publicUrl,
        path: publicUrl,
      })
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

    })

    // ✅ Fetch media thật từ DB để tránh mất ảnh khi submit (list admin thường không có field media)
   void (async () => {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('media')
      .eq('id', editingRoom.id)
      .single()

    if (error) {
      console.error('fetch rooms.media failed:', error)
      return
    }


    setRoomForm((prev: any) => {
  const dbMedia = Array.isArray(data?.media) ? data.media : null

    return {
      ...prev,
      // ưu tiên DB media; nếu DB không có thì giữ prev
      media: dbMedia ?? prev.media ?? [],
    }
  })

    } catch (e) {
      console.error('fetch rooms.media exception:', e)
    }
  })()

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


