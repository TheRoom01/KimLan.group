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

function normalizeStreetWord(word: string) {
  const w = String(word ?? "").trim();
  if (!w) return "";

  const upperWhole = w.toUpperCase();

  // Giữ nguyên một số viết tắt/phổ biến
  const KEEP_UPPER = new Set([
    "CMT8",
    "XVNT",
    "KDC",
    "KDT",
    "QL",
    "QL1A",
    "QL13",
    "ĐT",
    "TP",
    "HCM",
  ]);

  if (KEEP_UPPER.has(upperWhole)) return upperWhole;

  // D5 / D2 / N1 / B3...
  if (/^[A-ZĐ]\d+$/i.test(w)) {
    const first = w.charAt(0).toUpperCase();
    return first + w.slice(1).toLowerCase();
  }

  // 3/2, 14/5, 30/4... giữ phần số
  if (/^\d+(\/\d+)+$/.test(w)) return w;

  // token có số + chữ liền nhau kiểu QL13, CMT8 -> upper toàn bộ
  if (/^(?=.*[A-Za-zĐđ])(?=.*\d)[A-Za-zĐđ0-9/.-]+$/.test(w)) {
    return upperWhole;
  }

  // chữ thường -> viết hoa chữ cái đầu
  const lower = w.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function toTitleCaseStreet(input: string) {
  const street = String(input ?? "")
    .trim()
    .replace(/\s+/g, " ");

  const compact = street
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s_-]+/g, "")
    .toLowerCase();

  if (compact === "cmt8" || compact === "cmt08") {
    return "Cách Mạng Tháng 8";
  }

  return street
    .split(" ")
    .filter(Boolean)
    .map(normalizeStreetWord)
    .join(" ");
}

function toTitleCaseWard(input: string) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
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

  const detailGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    alignItems: 'start',
  }

  return (
    <div style={sectionBox}>
      {/* Row 1: Số nhà | tên đường | Phường | Quận */}
      <div style={infoGridStyle}>
        <Input
          label="Số nhà"
          value={value.house_number}
          onChange={v => onChange({
            ...value,
            property_id: undefined,
            house_number: v,
          })}
          onBlur={() => {
            const normalizedAddress = toTitleCaseStreet(value.address);
            if (normalizedAddress !== value.address) {
              onChange({
                ...value,
                property_id: undefined,
                address: normalizedAddress,
              });
            }
            onAutofillByAddress?.(value.house_number, normalizedAddress);
          }}
        />
        <Input
          label="Tên đường"
          value={value.address}
          onChange={v => onChange({
            ...value,
            property_id: undefined,
            address: v,
          })}
          onBlur={() => {
        const normalizedAddress = toTitleCaseStreet(value.address);
        onChange({
          ...value,
          property_id: undefined,
          address: normalizedAddress,
        });
        onAutofillByAddress?.(value.house_number, normalizedAddress);
      }}
        />
        <Input
          label="Phường"
          value={value.ward}
          onChange={v => onChange({
            ...value,
            property_id: undefined,
            ward: v,
          })}
          onBlur={() => {
            const normalizedWard = toTitleCaseWard(value.ward);
            if (normalizedWard !== value.ward) {
              onChange({
                ...value,
                property_id: undefined,
                ward: normalizedWard,
              });
            }
          }}
        />
        <Select
          label="Quận"
          value={value.district}
          options={ensureOption(DISTRICT_OPTIONS, value.district)}
          onChange={(v) => onChange({
            ...value,
            property_id: undefined,
            district: v,
          })}
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
        statusColors
        value={value.status ?? "Đang trống"}
        options={[
          "Đang trống",
          "Đã thuê",
          "Sắp trống",
        ]}
        onChange={(v: string) =>
          onChange({
            ...value,
            status: v as RoomStatus,
          })
        }
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

          if (files.length) onUploadFiles(files);

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

{/* Các khối nhiều chữ luôn xếp 2 cột, kể cả mobile */}
<div style={detailGridStyle}>
  <TextArea
    label="Link nhóm Zalo & File:"
    value={zaloUrlDraft}
    onChange={(v) => {
      const nextUrl = String(v ?? "");
      setZaloUrlDraft(nextUrl);

      // ✅ chỉ cập nhật link_zalo
      onChange({ ...(value as any), link_zalo: nextUrl });
    }}
  />

  <div style={{ minWidth: 0 }}>
    <label style={labelStyle}>SĐT chủ nhà:</label>

    <ResizableTextArea
      value={zaloPhoneDraft}
      onChange={(nextPhoneBlock) => {
        setZaloPhoneDraft(nextPhoneBlock);
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
      

 {/* Mô tả */}
      <TextArea
        label="Mô tả:"
        value={value.description}
        onChange={v => onChange({ ...value, description: v })}
      />

    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>Chính sách:</label>
      <ResizableTextArea
        value={chinh_sach}
        onChange={onChangeChinhSach}
        placeholder="Nhập chính sách..."
      />
    </div>
    <TextArea
        label="Link Google Maps:"
        value={value.google_maps_url}
        onChange={(v) => onChange({ ...value, google_maps_url: v })}
      />
</div>
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
      <MoneyInput value={value} onChange={onChange} />
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
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      <ResizableTextArea value={value} onChange={onChange} />
    </div>
  )
}

function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const digits = Number.isFinite(value) && value > 0 ? Math.trunc(value).toLocaleString('vi-VN') : ''

  const restoreCaret = (digitPosition: number) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      let seen = 0
      let caret = input.value.length
      for (let index = 0; index < input.value.length; index += 1) {
        if (/\d/.test(input.value[index])) seen += 1
        if (seen === digitPosition) {
          caret = index + 1
          break
        }
      }
      input.setSelectionRange(caret, caret)
    })
  }

  return (
    <div style={moneyInputWrap}>
      <input
        ref={inputRef}
        style={{ ...inputStyle, paddingRight: 34 }}
        type="text"
        inputMode="numeric"
        value={digits}
        onChange={(e) => {
          const caret = e.currentTarget.selectionStart ?? e.currentTarget.value.length
          const digitPosition = e.currentTarget.value.slice(0, caret).replace(/\D/g, '').length
          const raw = e.target.value.replace(/\D/g, '')
          onChange(raw ? Number.parseInt(raw, 10) : 0)
          restoreCaret(digitPosition)
        }}
        placeholder="0"
        aria-label="Số tiền"
      />
      <span style={moneySuffix}>đ</span>
    </div>
  )
}

function ResizableTextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [height, setHeight] = useState(92)

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height

    const move = (moveEvent: PointerEvent) => {
      setHeight(Math.max(92, Math.min(420, startHeight + moveEvent.clientY - startY)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return (
    <div style={textareaWrap}>
      <textarea
        style={{ ...textareaStyle, height }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        aria-label="Kéo để mở rộng ô nhập"
        title="Kéo để mở rộng"
        style={resizeHandle}
        onPointerDown={startResize}
      >
        ↕
      </button>
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
  statusColors?: boolean
}

const STATUS_SELECT_COLORS: Record<string, React.CSSProperties> = {
  "Đã thuê": { background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b" },
  "Đang trống": { background: "#dcfce7", borderColor: "#bbf7d0", color: "#166534" },
  "Sắp trống": { background: "#fef9c3", borderColor: "#fde047", color: "#854d0e" },
}

function Select({
  label,
  value,
  options,
  onChange,
  statusColors = false,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
    if (!open) return

    const onDown = (e: Event) => {
      const target = e.target as Node | null
      if (!target) return
      if (!wrapRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    // ✅ mobile + desktop
    // - pointerdown: cover hầu hết (mouse/touch/pen)
    // - touchstart: fallback cho iOS cũ
    // - mousedown: fallback
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("touchstart", onDown, { capture: true, passive: true } as any)
    window.addEventListener("mousedown", onDown, true)

    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("touchstart", onDown, true)
      window.removeEventListener("mousedown", onDown, true)
    }
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
    ...(statusColors ? STATUS_SELECT_COLORS[value] : {}),
    ...(statusColors ? {
      width: "fit-content",
      minWidth: 112,
      borderRadius: 999,
      padding: "8px 12px",
      fontWeight: 700,
      gap: 8,
    } : {}),
     }}

  onClick={() => setOpen(v => !v)}
>
  <span>{statusColors ? "✓ " : ""}{value || "Chọn..."}</span>
  <span style={{ opacity: 0.7 }}>⌄</span>
</button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: statusColors ? "auto" : 0,
            minWidth: statusColors ? 128 : undefined,
            zIndex: 1000,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            maxHeight: 260,
            overflowY: "auto",
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
          }}
        >
          {options.filter((o) => !statusColors || o !== value).map((o) => {
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
                  ...(statusColors ? STATUS_SELECT_COLORS[o] : {
                    background: active ? "#111827" : "transparent",
                    color: active ? "#fff" : "#111827",
                  }),
                  border: statusColors ? `1px solid ${STATUS_SELECT_COLORS[o]?.borderColor ?? "#e5e7eb"}` : "none",
                  borderRadius: statusColors ? 8 : 0,
                  marginBottom: statusColors ? 4 : 0,
                  fontWeight: statusColors ? 700 : 400,
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
  minHeight: 92,
  resize: 'none',
  paddingRight: 34,
  display: 'block',
}

const textareaWrap: React.CSSProperties = {
  position: 'relative',
  minWidth: 0,
}

const resizeHandle: React.CSSProperties = {
  position: 'absolute',
  right: 5,
  bottom: 5,
  width: 28,
  height: 28,
  border: '1px solid #94a3b8',
  borderRadius: 7,
  background: '#fff',
  color: '#334155',
  fontSize: 21,
  fontWeight: 800,
  lineHeight: 1,
  cursor: 'ns-resize',
  touchAction: 'none',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
}

const moneyInputWrap: React.CSSProperties = {
  position: 'relative',
}

const moneySuffix: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#475569',
  fontWeight: 700,
  pointerEvents: 'none',
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
