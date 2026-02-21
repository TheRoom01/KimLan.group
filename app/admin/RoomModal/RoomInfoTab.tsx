'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoomForm } from './types'
import type { RoomStatus } from '../../types/room'
import { sectionBox } from './styles'
import { DISTRICT_OPTIONS, ROOM_TYPE_OPTIONS } from "@/lib/filterOptions";


type Props = {

  value: RoomForm
  onChange: (next: RoomForm) => void
  chinh_sach: string
  onChangeChinhSach: (v: string) => void
  onAutofillByAddress?: (house: string, address: string) => void

  // label vẫn là "Ngày tạo" nhưng lấy từ updated_at theo yêu cầu
  updatedAt?: string | null

  uploading?: boolean
  onUploadFiles: (files: File[]) => void
  
}

// ✅ Nếu dữ liệu cũ đang có giá trị không nằm trong list,
// vẫn cho nó xuất hiện để tránh “mất value” khi mở form edit.
function ensureOption(options: readonly string[], current?: string | null): string[] {
  const v = (current ?? "").trim();
  if (!v) return [...options];

  // nếu đã có trong list → clone ra mảng mutable
  if (options.includes(v)) return [...options];

  // nếu dữ liệu cũ khác list → đưa lên đầu để không mất giá trị
  return [v, ...options];
}

export default function RoomInfoTab({
  value,
  onChange,
  updatedAt,
  uploading = false,
  onUploadFiles,
  chinh_sach,
  onChangeChinhSach,
  onAutofillByAddress,
}: Props) {
  

  const fileRef = useRef<HTMLInputElement | null>(null)

  // Drag state (for reorder)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const [zaloUrlDraft, setZaloUrlDraft] = useState("");
const [zaloPhoneDraft, setZaloPhoneDraft] = useState("");

useEffect(() => {
  const rawUrl = String((value as any).link_zalo ?? "");
  setZaloUrlDraft(rawUrl);

  const rawPhone = String((value as any).zalo_phone ?? "");
  setZaloPhoneDraft(rawPhone);
}, [(value as any).link_zalo, (value as any).zalo_phone]);


const imageUrls = useMemo(() => {
  if (!Array.isArray((value as any)?.media)) return []

  return (value as any).media
    .filter((m: any) => m?.type === 'image' && m?.url)
    .map((m: any) => m.url)
}, [value])


  const mediaItems = useMemo(() => {
  const arr: any = (value as any).media;
  return Array.isArray(arr) ? arr : [];
}, [(value as any).media]);

const videoItems = useMemo(() => {
  return mediaItems.filter((m: any) => m?.type === "video" && m?.url);
}, [mediaItems]);

const [isMobile, setIsMobile] = useState(false)

useEffect(() => {
  if (typeof window === 'undefined') return

  const mq = window.matchMedia('(max-width: 640px)')
  const apply = () => setIsMobile(mq.matches)

  apply()
  mq.addEventListener?.('change', apply)
  return () => mq.removeEventListener?.('change', apply)
}, [])


  const setImageUrls = (urls: string[]) => {
    onChange({ ...value })
  }

  const moveItem = (from: number, to: number) => {
  if (from === to) return;
  if (from < 0 || to < 0) return;

  const media = Array.isArray((value as any)?.media)
    ? [...(value as any).media]
    : [];

  // Lấy index thật của các item image trong media (vì media có cả video)
  const imageIndexes = media
    .map((m: any, i: number) => (m?.type === "image" ? i : -1))
    .filter((i: number) => i !== -1);

  if (from >= imageIndexes.length || to >= imageIndexes.length) return;

  const realFrom = imageIndexes[from];
  const realTo = imageIndexes[to];

  // Move item trong mảng media theo index thật
  const [moved] = media.splice(realFrom, 1);
  media.splice(realTo, 0, moved);

  onChange({
    ...(value as any),
    media,
  });
};

  const infoGridStyle: React.CSSProperties = isMobile
  ? { ...grid4, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
  : grid4

  return (
    <div style={sectionBox}>
      {/* Row 1: Số nhà | tên đường | Phường | Quận */}
      <div style={infoGridStyle}>
        <Input
          label="Số nhà"
          value={value.house_number}
          onChange={v => onChange({ ...value, house_number: v })}
          onBlur={() => onAutofillByAddress?.(value.house_number, value.address)}
        />
        <Input
          label="Tên đường"
          value={value.address}
          onChange={v => onChange({ ...value, address: v })}
          onBlur={() => onAutofillByAddress?.(value.house_number, value.address)}
        />
        <Input
          label="Phường"
          value={value.ward}
          onChange={v => onChange({ ...value, ward: v })}
        />
        <Select
          label="Quận"
          value={value.district}
          options={ensureOption(DISTRICT_OPTIONS, value.district)}
          onChange={(v) => onChange({ ...value, district: v })}
        />

      </div>

      {/* Row 2: Mã phòng | Giá | Loại phòng */}
      <div style={infoGridStyle}>
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
        <Select
          label="Loại phòng"
          value={value.room_type}
          options={ensureOption(ROOM_TYPE_OPTIONS, value.room_type)}
          onChange={(v) => onChange({ ...value, room_type: v })}
        />

      </div>

      {/* Row 3: Trạng thái | Ngày tạo (lấy updated_at) | Thêm ảnh */}
      <div style={infoGridStyle}>
       <Select
  label="Trạng thái"
  value={value.status}
  options={["Trống", "Đã thuê"]}
  onChange={(v: string) => onChange({ ...value, status: v as RoomStatus })}
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

  const ok = files
    .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
    .map((file, index) => ({
      file,
      __order: index, // ✅ giữ thứ tự user chọn
    }));

  if (ok.length) {
    // chỉ gửi file theo đúng thứ tự đã map
    onUploadFiles(ok.map(x => x.file));
  }

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
{imageUrls.filter((u: string) => /^https?:\/\//.test(u)).length > 0 && (
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
      {imageUrls
        .filter((u: string) => /^https?:\/\//.test(u))
        .map((url: string, idx: number) => {
          const isDragging = dragIndex === idx
          const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx

          return (
            <div
              key={url}
              style={{
                ...thumbWrap,
                ...(isDragging ? draggingStyle : null),
                ...(isOver ? dragOverStyle : null),
              }}
              title={url}
              draggable
              onDragStart={(e) => {
                setDragIndex(idx)
                setOverIndex(null)
                e.dataTransfer.setData('text/plain', String(idx))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                setOverIndex(idx)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from =
                  dragIndex ??
                  Number.parseInt(e.dataTransfer.getData('text/plain') || '', 10)
                const to = idx

                if (Number.isFinite(from) && Number.isFinite(to)) {
                  moveItem(from, to) // giữ nguyên logic reorder của bạn
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
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault()
                  e.stopPropagation()

                  // ✅ XOÁ THẲNG TRONG value.media (nguồn dữ liệu thật)
                  const current = Array.isArray((value as any)?.media) ? (value as any).media : []
                  const nextMedia = current.filter((m: any) => {
                    const u = String(m?.url ?? m?.path ?? '')
                    // chỉ xoá đúng ảnh này
                    return !(m?.type === 'image' && u === url)
                  })

                  onChange({
                    ...(value as any),
                    media: nextMedia,
                  })
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
  {videoItems.map((m: any, idx: number) => {
    const videoUrl = String(m?.url ?? m?.path ?? '')

    return (
      <div
        key={`${videoUrl}-${idx}`}
        className="relative w-32 h-24 rounded-lg border bg-black flex-shrink-0"
      >
        {/* nút xoá video */}
        <button
          type="button"
          onClick={() => {
            const current = Array.isArray((value as any)?.media) ? (value as any).media : []
            const nextMedia = current.filter((x: any) => {
              const u = String(x?.url ?? x?.path ?? '')
              // chỉ xoá đúng video này
              return !(x?.type === 'video' && u === videoUrl)
            })

            onChange({
              ...(value as any),
              media: nextMedia,
            })
          }}
          className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-white/90 hover:bg-white flex items-center justify-center"
        >
          ✕
        </button>

        {/* video preview */}
        <video
          src={videoUrl}
          className="w-full h-full object-contain rounded-lg"
          preload="metadata"
          controls
        />
      </div>
    )
  })}
</div>

{/* Link Zalo + SĐT (2 cột, lưu RIÊNG: link_zalo & zalo_phone) */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
  <TextArea
    label="Link Zalo"
    value={zaloUrlDraft}
    onChange={(v) => {
      const nextUrl = String(v ?? "");
      setZaloUrlDraft(nextUrl);

      // ✅ chỉ cập nhật link_zalo
      onChange({ ...(value as any), link_zalo: nextUrl });
    }}
  />

  <div>
    <label style={labelStyle}>SĐT chủ</label>

    <textarea
      style={textareaStyle}
      value={zaloPhoneDraft}
      onChange={(e) => {
        const nextPhoneBlock = e.target.value; // ✅ giữ nguyên mọi icon/emoji/ký tự
        setZaloPhoneDraft(nextPhoneBlock);

        // ✅ chỉ cập nhật zalo_phone
        onChange({ ...(value as any), zalo_phone: nextPhoneBlock });
      }}
      placeholder={'☎️0** *** 000 A Tú'}
    />

    {/* ✅ HIỂN THỊ SỐ ĐÃ LỌC (mỗi dòng -> 1 số) */}
    <div style={{ marginTop: 6, fontSize: 13, color: "#111827", lineHeight: 1.4 }}>
      {zaloPhoneDraft
        .split(/\r?\n/)
        .map((line) => line.replace(/\D/g, "")) // ✅ chỉ giữ số
        .filter(Boolean)
        .map((digits, i) => (
          <div key={i}>{digits}</div>
        ))}
    </div>
  </div>
</div>


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
  onBlur,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} 
      onBlur={onBlur}/>
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

type SimpleSelectProps = {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}

function Select({
  label,
  value,
  options,
  onChange,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener("mousedown", onDown)
    return () => window.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <label style={labelStyle}>{label}</label>

     <button
  type="button"
  style={{
    ...inputStyle,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
   background:
    value === "Đã thuê"
      ? "#374151"   // xám đậm (gần đen)
      : value === "Trống"
      ? "#e5e7eb"   // xám vừa
      : inputStyle.background,
    color:
    value === "Đã thuê"
      ? "#ffffff"   // chữ trắng cho tương phản
      : "#111827",
     }}

  onClick={() => setOpen(v => !v)}
>
  <span>{value || "Chọn..."}</span>
  <span style={{ opacity: 0.6 }}>▾</span>
</button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
          }}
        >
          {options.map((o) => {
            const active = o === value
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: active
                    ? "#111827"
                    : o === "Đã thuê"
                    ? "#f3f4f6"
                    : o === "Trống"
                    ? "#f9fafb"
                    : "transparent",
                  color: active ? "#fff" : "#111827",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {o}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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
