'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoomForm } from './types'
import type { RoomStatus } from '../../types/room'
import { sectionBox } from './styles'

type Props = {

  value: RoomForm
  onChange: (next: RoomForm) => void
  chinh_sach: string
  onChangeChinhSach: (v: string) => void

  // label vẫn là "Ngày tạo" nhưng lấy từ updated_at theo yêu cầu
  updatedAt?: string | null

  uploading?: boolean
  onUploadFiles: (files: File[]) => void
  
}

export default function RoomInfoTab({
  value,
  onChange,
  updatedAt,
  uploading = false,
  onUploadFiles,
  chinh_sach,
  onChangeChinhSach,
  
}: Props) {
  

  const fileRef = useRef<HTMLInputElement | null>(null)

  // Drag state (for reorder)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const imageUrls = useMemo(() => {
    return (value.gallery_urls || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }, [value.gallery_urls])

  const mediaItems = useMemo(() => {
  const arr: any = (value as any).media;
  return Array.isArray(arr) ? arr : [];
}, [(value as any).media]);

const videoItems = useMemo(() => {
  return mediaItems.filter((m: any) => m?.type === "video" && m?.url);
}, [mediaItems]);


  const setImageUrls = (urls: string[]) => {
    onChange({ ...value, gallery_urls: urls.join(', ') })
  }

  const moveItem = (from: number, to: number) => {
    if (from === to) return
    if (from < 0 || to < 0) return
    if (from >= imageUrls.length || to >= imageUrls.length) return

    const next = imageUrls.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setImageUrls(next)
  }

  return (
    <div style={sectionBox}>
      {/* Row 1: Số nhà | tên đường | Phường | Quận */}
      <div style={grid4}>
        <Input
          label="Số nhà"
          value={value.house_number}
          onChange={v => onChange({ ...value, house_number: v })}
        />
        <Input
          label="Tên đường"
          value={value.address}
          onChange={v => onChange({ ...value, address: v })}
        />
        <Input
          label="Phường"
          value={value.ward}
          onChange={v => onChange({ ...value, ward: v })}
        />
        <Input
          label="Quận"
          value={value.district}
          onChange={v => onChange({ ...value, district: v })}
        />
      </div>

      {/* Row 2: Mã phòng | Giá | Loại phòng */}
      <div style={grid4}>
        <Input
          label="Mã phòng"
          value={value.room_code}
          onChange={v => onChange({ ...value, room_code: v })}
        />
        <InputNumber
          label="Giá"
          value={value.price}
          onChange={v => onChange({ ...value, price: v })}
        />
        <Input
          label="Loại phòng"
          value={value.room_type}
          onChange={v => onChange({ ...value, room_type: v })}
        />
      </div>

      {/* Row 3: Trạng thái | Ngày tạo (lấy updated_at) | Thêm ảnh */}
      <div style={grid4}>
        <Select<RoomStatus>
          label="Trạng thái"
          value={value.status}
          options={['Trống', 'Đã thuê']}
          onChange={v => onChange({ ...value, status: v })}
        />

        <ReadOnly label="Ngày tạo" value={formatDate(updatedAt)} />

        <div>
          <label style={labelStyle}>Ảnh</label>

          <input
  ref={fileRef}
  type="file"
  accept="image/*,video/*"
  multiple
  style={{ display: "none" }}
  onChange={(e) => {
    const files = Array.from(e.target.files ?? []);
    const ok = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (ok.length) onUploadFiles(ok);
    e.currentTarget.value = "";
  }}
/>


          <button
            type="button"
            style={{ ...addImageBtn, opacity: uploading ? 0.6 : 1 }}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            aria-busy={uploading}
          >
            {uploading ? 'Đang tải...' : 'Thêm ảnh/Video'}
          </button>

          {/* Gợi ý UX nhỏ */}
          <div style={helperText}>
            {imageUrls.length > 0 ? (
              <>
                Đã thêm <b>{imageUrls.length}</b> ảnh. Kéo-thả để đổi thứ tự. Bấm <b>✕</b> để xoá.
              </>
            ) : (
              <>Bạn có thể chọn nhiều ảnh cùng lúc (JPG/PNG/WEBP).</>
            )}
          </div>
        </div>
      </div>

      {/* Preview ảnh */}
      {imageUrls.length > 0 && (
        <div>
          <label style={labelStyle}>Ảnh đã thêm</label>

          <div
  style={{
    ...previewGrid,
    ...(typeof window !== 'undefined' && window.innerWidth >= 768
      ? previewGridDesktop
      : null),
  }}
>
            {imageUrls.map((url, idx) => {
              const isDragging = dragIndex === idx
              const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx

              return (
                <div
                  key={`${url}-${idx}`}
                  style={{
                    ...thumbWrap,
                    ...(isDragging ? draggingStyle : null),
                    ...(isOver ? dragOverStyle : null),
                  }}
                  title={url}
                  draggable
                  onDragStart={e => {
                    setDragIndex(idx)
                    setOverIndex(null)
                    // Required in some browsers to initiate drag
                    e.dataTransfer.setData('text/plain', String(idx))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnter={e => {
                  e.preventDefault()
                  setOverIndex(prev => (prev === idx ? prev : idx))
}}
onDragOver={e => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  setOverIndex(prev => (prev === idx ? prev : idx))
}}

                  onDrop={e => {
                    e.preventDefault()

                    // Prefer dragIndex from state; fallback to dataTransfer
                    const from =
                      dragIndex ?? Number.parseInt(e.dataTransfer.getData('text/plain') || '', 10)
                    const to = idx

                    if (Number.isFinite(from) && Number.isFinite(to)) {
                      moveItem(from, to)
                    }

                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                >
                  <button
                    type="button"
                    aria-label="Xoá ảnh"
                    style={removeBtn}
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      const next = imageUrls.filter((_, i) => i !== idx)
                      setImageUrls(next)
                    }}
                  >
                    ✕
                  </button>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
              
<img
  src={url}
  alt={`room-${idx}`}
  style={thumbImg}
  draggable={false}
  loading="lazy"
  decoding="async"
/>

                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Preview video */}
<div className="flex gap-3 overflow-x-auto">
  {videoItems.map((m: any, idx: number) => (
    <div
      key={`${m.url}-${idx}`}
      className="relative w-32 h-24 rounded-lg border bg-black flex-shrink-0"
    >
      {/* ❌ nút xoá */}
      <button
        type="button"
        onClick={() => {
          // xoá video khỏi media
          const nextMedia = (value.media || []).filter(
            (x: any) => x.url !== m.url
          );
          onChange({ ...value, media: nextMedia });
        }}
        className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
      >
        ✕
      </button>

      {/* video preview */}
      <video
        src={m.url}
        className="w-full h-full object-contain rounded-lg"
        preload="metadata"
        controls
      />
    </div>
  ))}
</div>


      {/* Link Zalo (textarea) - nằm trên mô tả */}
      <TextArea
        label="Link Zalo"
        value={value.link_zalo}
        onChange={v => onChange({ ...value, link_zalo: v })}
      />

      {/* Mô tả */}
      <TextArea
        label="Mô tả"
        value={value.description}
        onChange={v => onChange({ ...value, description: v })}
      />

      <label style={labelStyle}>Chính sách</label>
<textarea
  value={chinh_sach}
  onChange={(e) => onChangeChinhSach(e.target.value)}
  placeholder="Nhập chính sách..."
/>


    </div>
  )
}

/* ================= UI HELPERS ================= */

const previewGridDesktop: React.CSSProperties = {
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function InputNumber({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea style={textareaStyle} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: T[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select style={inputStyle} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input style={{ ...inputStyle, background: '#f3f4f6' }} value={value} readOnly />
    </div>
  )
}

function formatDate(input?: string | null) {
  if (!input) return '-'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('vi-VN')
}

/* ================= STYLE ================= */

const labelStyle: React.CSSProperties = {
  fontSize: 16, // đã tăng cỡ chữ label trước đó
  marginBottom: 6,
  display: 'block',
  color: '#374151',
}

const helperText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 1.4,
  color: '#6b7280',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 110,
  resize: 'vertical',
}

const addImageBtn: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px dashed #93c5fd',
  background: '#eff6ff',
  color: '#1d4ed8',
  cursor: 'pointer',
  fontWeight: 600,
}

const previewGrid: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))',
}

const grid4: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
}
const thumbWrap: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  borderRadius: 10,
  overflow: 'hidden',
  border: '1px solid #e5e7eb',
  background: '#fff',
  position: 'relative',
  userSelect: 'none',
}

const draggingStyle: React.CSSProperties = {
  opacity: 0.6,
  transform: 'scale(0.98)',
}

const dragOverStyle: React.CSSProperties = {
  outline: '2px dashed #93c5fd',
  outlineOffset: 2,
}

const removeBtn: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 26,
  height: 26,
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: 'rgba(255,255,255,0.9)',
  cursor: 'pointer',
  fontWeight: 700,
  lineHeight: '24px',
}

const thumbImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  pointerEvents: 'none', // tránh ảnh chặn drag events
}
