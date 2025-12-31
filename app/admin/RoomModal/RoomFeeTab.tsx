'use client'

import { useEffect } from 'react'
import type { RoomDetail } from './types'
import { sectionBox } from './styles'

type Props = {
  detailForm: RoomDetail
  onChange: (data: Partial<RoomDetail>) => void
}

export default function RoomFeeTab({ detailForm, onChange }: Props) {
  // Điền sẵn unit nếu DB đang trống + chuẩn hoá có dấu "/"
  useEffect(() => {
    const patch: Partial<RoomDetail> = {}

    // điện: cố định kWh trong DB (UI hiển thị /kWh)
    if (!detailForm.electric_fee_unit) patch.electric_fee_unit = 'kWh'

    if (!detailForm.water_fee_unit) patch.water_fee_unit = '/người/tháng'
    if (!detailForm.service_fee_unit) patch.service_fee_unit = '/phòng/tháng'
    if (!detailForm.parking_fee_unit) patch.parking_fee_unit = '/chiếc/tháng'

    if (Object.keys(patch).length) onChange(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={sectionBox}>
      {/* Hàng 1 */}
      <div style={grid2}>
        <MoneyField
          label="Tiền điện"
          value={detailForm.electric_fee_value}
          onValue={v => onChange({ electric_fee_value: v })}
          unit={normalizeUnit(detailForm.electric_fee_unit, 'kWh')}
          unitReadOnly
        />

        <MoneyField
          label="Tiền nước"
          value={detailForm.water_fee_value}
          onValue={v => onChange({ water_fee_value: v })}
          unit={normalizeUnit(detailForm.water_fee_unit, '/người/tháng')}
          onUnit={u => onChange({ water_fee_unit: u })}
          unitPlaceholder="/người/tháng"
        />
      </div>

      {/* Hàng 2 */}
      <div style={grid2}>
        <MoneyField
          label="Phí dịch vụ/Quản lý"
          value={detailForm.service_fee_value}
          onValue={v => onChange({ service_fee_value: v })}
          unit={normalizeUnit(detailForm.service_fee_unit, '/phòng/tháng')}
          onUnit={u => onChange({ service_fee_unit: u })}
          unitPlaceholder="/phòng/tháng"
        />

        <MoneyField
          label="Phí gửi xe"
          value={detailForm.parking_fee_value}
          onValue={v => onChange({ parking_fee_value: v })}
          unit={normalizeUnit(detailForm.parking_fee_unit, '/chiếc/tháng')}
          onUnit={u => onChange({ parking_fee_unit: u })}
          unitPlaceholder="/chiếc/tháng"
        />
      </div>

      {/* Giữ nguyên */}
      <TextArea
        label="Các phí khác"
        value={detailForm.other_fee_note || ''}
        onChange={v => onChange({ other_fee_note: v })}
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
}: {
  label: string
  value: number
  onValue: (v: number) => void
  unit: string
  onUnit?: (u: string) => void
  unitReadOnly?: boolean
  unitPlaceholder?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}:</label>

      <div style={inputsRow}>
        <input
          style={inputStyle}
          type="number"
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onValue(Math.max(0, Number(e.target.value)))}
          placeholder="0"
        />

        <input
          style={{
            ...inputStyle,
            width: 180,
            background: unitReadOnly ? '#f3f4f6' : '#f8fafc',
          }}
          value={unitReadOnly ? unit : unit || ''}
          readOnly={unitReadOnly}
          onChange={e => onUnit?.(e.target.value)}
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
      <textarea style={textareaStyle} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

/* ================= HELPERS ================= */

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