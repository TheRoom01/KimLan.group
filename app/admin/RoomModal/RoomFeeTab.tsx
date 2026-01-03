'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { RoomDetail } from './types'
import { sectionBox } from './styles'

type Props = {
  detailForm: RoomDetail
  onChange: (data: Partial<RoomDetail>) => void
  isNew?: boolean
}

export default function RoomFeeTab({ detailForm, onChange, isNew = false }: Props) {
  // Điền sẵn unit + default fee (CHỈ khi thêm mới) nếu DB đang trống/0
  useEffect(() => {
    const patch: Partial<RoomDetail> = {}

    // ===== DEFAULT VALUES (chỉ khi thêm mới) =====
    if (isNew) {
      if (!Number(detailForm.electric_fee_value)) patch.electric_fee_value = 4000
      if (!Number(detailForm.water_fee_value)) patch.water_fee_value = 100000
      if (!Number(detailForm.service_fee_value)) patch.service_fee_value = 200000
    }

    // ===== DEFAULT UNITS (chỉ fill khi trống) =====
    // điện: cố định kWh trong DB (UI hiển thị /kWh)
    if (!detailForm.electric_fee_unit) patch.electric_fee_unit = 'kWh'
    if (!detailForm.water_fee_unit) patch.water_fee_unit = 'người/tháng'
    if (!detailForm.service_fee_unit) patch.service_fee_unit = 'phòng/tháng'
    if (!detailForm.parking_fee_unit) patch.parking_fee_unit = 'chiếc/tháng'

    if (Object.keys(patch).length) onChange(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    () => (isMobile ? { ...grid2, gridTemplateColumns: '1fr' } : grid2),
    [isMobile]
  )

  const inputsRowStyle = useMemo<React.CSSProperties>(
    () => (isMobile ? { ...inputsRow, gridTemplateColumns: '1fr 140px' } : inputsRow),
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
  return (
    <div>
      <label style={labelStyle}>{label}:</label>

      <div style={rowStyle ?? inputsRow}>
        <input
          style={inputStyle}
          type="number"
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onValue(Math.max(0, Number(e.target.value)))}
          placeholder="0"
        />

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
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea style={textareaStyle} value={value} onChange={(e) => onChange(e.target.value)} />
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
  gridTemplateColumns: '1fr 180px',
  gap: 12,
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
  minHeight: 120,
  resize: 'vertical',
}
