'use client'

import type { RoomDetail } from './types'
import { amenityConfig } from './room.config'
import { sectionBox } from './styles'

type Props = {
  detailForm: RoomDetail
  onChange: (data: Partial<RoomDetail>) => void
}

export default function RoomAmenityTab({ detailForm, onChange }: Props) {
  return (
    <div style={sectionBox}>
      <div style={grid}>
        {amenityConfig.map(item => {
          const key = item.key as keyof RoomDetail
          const checked = Boolean((detailForm as any)[key])

          return (
            <div key={String(key)} style={amenityCard}>
              <span style={amenityLabel}>{item.label}</span>

              <label style={switchWrap}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e =>
                    onChange({ [key]: e.target.checked } as Partial<RoomDetail>)
                  }
                  style={switchInput}
                />

                <span
                  style={{
                    ...switchTrack,
                    ...(checked ? switchTrackOn : {}),
                  }}
                >
                  <span
                    style={{
                      ...switchKnob,
                      transform: checked ? 'translateX(20px)' : 'translateX(0px)',
                    }}
                  />
                </span>
              </label>
            </div>
          )
        })}
      </div>

      <div style={textareaWrap}>
        <label style={labelStyle}>Các tiện ích khác</label>
        <textarea
          style={textareaStyle}
          value={detailForm.other_amenities ?? ''}
          onChange={e => onChange({ other_amenities: e.target.value })}
          placeholder="Nhập các tiện ích khác (phân cách bằng dấu phẩy)"
        />
      </div>
    </div>
  )
}

/* ================= STYLE ================= */

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
}

const amenityCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
  fontSize: 16,
  gap: 12,
}

const amenityLabel: React.CSSProperties = {
  color: '#111827',
  lineHeight: 1.2,
}

/* ===== PILL SWITCH ===== */
const switchWrap: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  flex: '0 0 auto',
}

const switchInput: React.CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 0,
  height: 0,
  pointerEvents: 'none',
}

const switchTrack: React.CSSProperties = {
  width: 46,
  height: 26,
  borderRadius: 999,
  background: '#d1d5db',
  display: 'flex',
  alignItems: 'center',
  padding: 3,
  boxSizing: 'border-box',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
}

const switchTrackOn: React.CSSProperties = {
  background: '#2563eb',
}

const switchKnob: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
  transition: 'all 0.2s ease',
}

/* ===== TEXTAREA ===== */
const textareaWrap: React.CSSProperties = {
  marginTop: 14,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 16,
  marginBottom: 8,
  color: '#374151',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  minHeight: 110,
  resize: 'vertical',
}