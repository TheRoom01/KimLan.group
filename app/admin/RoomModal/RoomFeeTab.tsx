'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { RoomDetail } from './types'
import { sectionBox } from './styles'

type Props = {
  detailForm: RoomDetail
  onChange: (data: Partial<RoomDetail>) => void
  isNew?: boolean
  allowAutofill?: boolean
  onAutofillDone?: () => void
}

export default function RoomFeeTab({
  detailForm,
  onChange,
  isNew = false,
  allowAutofill = false,
  onAutofillDone,
}: Props) {

  // Điền sẵn unit + default fee (CHỈ khi thêm mới) nếu DB đang trống/0
 useEffect(() => {
  if (!(isNew && allowAutofill)) return

  const patch: Partial<RoomDetail> = {}

  // ===== DEFAULT VALUES: chỉ chạy 1 lần, sau đó user muốn để 0/blank thì giữ nguyên =====
  if (!Number(detailForm.electric_fee_value)) patch.electric_fee_value = 4000
  if (!Number(detailForm.water_fee_value)) patch.water_fee_value = 100000
  if (!Number(detailForm.service_fee_value)) patch.service_fee_value = 200000

  // ===== DEFAULT UNITS: cũng chỉ fill 1 lần =====
  if (!detailForm.electric_fee_unit) patch.electric_fee_unit = 'kWh'
  if (!detailForm.water_fee_unit) patch.water_fee_unit = 'người/tháng'
  if (!detailForm.service_fee_unit) patch.service_fee_unit = 'phòng/tháng'
  if (!detailForm.parking_fee_unit) patch.parking_fee_unit = 'chiếc/tháng'

  if (Object.keys(patch).length) onChange(patch)

  // đánh dấu đã chạy autofill (kể cả patch rỗng) để không bao giờ tự điền lại
  onAutofillDone?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isNew, allowAutofill])


  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mq = window.matchMedia('(max-width: 640px)') // 640 ~ sm
    const apply = () => setIsMobile(mq.matches)

    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  const feeGridStyle = useMemo<React.CSSProperties>(
    () => (isMobile ? { ...grid2, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } : grid2),
    [isMobile]
  )

  const inputsRowStyle = useMemo<React.CSSProperties>(
    () => (isMobile ? { ...inputsRow, gridTemplateColumns: '1fr', gap: 6 } : inputsRow),
    [isMobile]
  )

  return (
    <div style={sectionBox}>
      {/* Hàng 1 */}
      <div style={feeGridStyle}>
        <MoneyField
          label="Tiền điện"
          value={detailForm.electric_fee_value}
          onValue={(v) => onChange({ electric_fee_value: v })}
          unit={normalizeUnit(detailForm.electric_fee_unit, 'kWh')}
          unitReadOnly
          rowStyle={inputsRowStyle}
        />

        <MoneyField
          label="Tiền nước"
          value={detailForm.water_fee_value}
          onValue={(v) => onChange({ water_fee_value: v })}
          unit={normalizeUnit(detailForm.water_fee_unit, 'người/tháng')}
          onUnit={(u) => onChange({ water_fee_unit: stripLeadingSlash(u) })}
          unitPlaceholder="người/tháng"
          rowStyle={inputsRowStyle}
        />
      </div>

      {/* Hàng 2 */}
      <div style={feeGridStyle}>
        <MoneyField
          label="Phí dịch vụ/Quản lý"
          value={detailForm.service_fee_value}
          onValue={(v) => onChange({ service_fee_value: v })}
          unit={normalizeUnit(detailForm.service_fee_unit, 'phòng/tháng')}
          onUnit={(u) => onChange({ service_fee_unit: stripLeadingSlash(u) })}
          unitPlaceholder="phòng/tháng"
          rowStyle={inputsRowStyle}
        />

        <MoneyField
          label="Phí gửi xe"
          value={detailForm.parking_fee_value}
          onValue={(v) => onChange({ parking_fee_value: v })}
          unit={normalizeUnit(detailForm.parking_fee_unit, 'chiếc/tháng')}
          onUnit={(u) => onChange({ parking_fee_unit: stripLeadingSlash(u) })}
          unitPlaceholder="chiếc/tháng"
          rowStyle={inputsRowStyle}
        />
      </div>

      {/* Giữ nguyên */}
      <TextArea
        label="Các phí khác"
        value={detailForm.other_fee_note || ''}
        onChange={(v) => onChange({ other_fee_note: v })}
      />
    </div>
  )
}

/* ================= SUB ================= */

function MoneyField({
  label,
  value,
  onValue,
  unit,
  onUnit,
  unitReadOnly = false,
  unitPlaceholder,
  rowStyle,
}: {
  label: string
  value: number
  onValue: (v: number) => void
  unit: string
  onUnit?: (u: string) => void
  unitReadOnly?: boolean
  unitPlaceholder?: string
  rowStyle?: React.CSSProperties
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)

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
    <div>
      <label style={labelStyle}>{label}:</label>

      <div style={rowStyle ?? inputsRow}>
        <div style={moneyInputWrap}>
          <input
            ref={inputRef}
            style={{ ...inputStyle, paddingRight: 34 }}
            type="text"
            inputMode="numeric"
            value={Number.isFinite(value) && value > 0 ? Math.trunc(value).toLocaleString('vi-VN') : ''}
            onChange={(e) => {
              const caret = e.currentTarget.selectionStart ?? e.currentTarget.value.length
              const digitPosition = e.currentTarget.value.slice(0, caret).replace(/\D/g, '').length
              const raw = e.target.value.replace(/\D/g, '')
              onValue(raw ? Number.parseInt(raw, 10) : 0)
              restoreCaret(digitPosition)
            }}
            placeholder="0"
          />
          <span style={moneySuffix}>đ</span>
        </div>

        <input
          style={{
            ...inputStyle,
            width: '100%',
            background: unitReadOnly ? '#f3f4f6' : '#f8fafc',
          }}
          value={unitReadOnly ? unit : unit || ''}
          readOnly={unitReadOnly}
          onChange={(e) => onUnit?.(e.target.value)}
          placeholder={unitPlaceholder}
        />
      </div>
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
  const [height, setHeight] = useState(100)

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (moveEvent: PointerEvent) => setHeight(Math.max(100, Math.min(420, startHeight + moveEvent.clientY - startY)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <textarea style={{ ...textareaStyle, height }} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" aria-label="Kéo để mở rộng ô nhập" title="Kéo để mở rộng" style={resizeHandle} onPointerDown={startResize}>↕</button>
      </div>
    </div>
  )
}

/* ================= HELPERS ================= */

function stripLeadingSlash(v: string) {
  const s = (v ?? '').trim()
  if (!s) return ''
  return s.startsWith('/') ? s.slice(1) : s
}

function normalizeUnit(input: string | undefined | null, fallback: string) {
  const raw = (input ?? '').trim()
  const u = raw || fallback
  // điện nếu là "kWh" thì hiển thị "/kWh"
  if (u === 'kWh') return '/kWh'
  // nếu chưa có "/" thì thêm vào
  if (u.startsWith('/')) return u
  return `/${u}`
}

/* ================= STYLE ================= */

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 18,
  marginBottom: 16,
}

const inputsRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, 28%)',
  gap: 12,
  alignItems: 'stretch',
}

const labelStyle: React.CSSProperties = {
  fontSize: 16, // tăng 20%+
  marginBottom: 8,
  display: 'block',
  color: '#374151',
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
  minHeight: 100,
  resize: 'none',
  paddingRight: 34,
  display: 'block',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
  fontFamily: 'inherit',
}

const moneyInputWrap: React.CSSProperties = { position: 'relative', minWidth: 0 }

const moneySuffix: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#475569',
  fontWeight: 700,
  pointerEvents: 'none',
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
