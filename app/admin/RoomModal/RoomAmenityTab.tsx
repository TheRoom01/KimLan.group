'use client'

import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  AppWindow, Ban, Bike, CalendarCheck, CalendarClock, CarFront, Cat, Clock3,
  Dog, Fingerprint, Globe2, ShieldCheck, Sun, WashingMachine, Wind,
  createLucideIcon, type LucideIcon,
} from 'lucide-react'
import type { RoomDetail } from './types'
import { amenityConfig } from './room.config'
import { sectionBox } from './styles'

type Props = {
  detailForm: RoomDetail
  onChange: (data: Partial<RoomDetail>) => void
}

const Stairs = createLucideIcon('Stairs', [
  ['path', { d: 'M3 21h5v-5h5v-5h5V6h3', key: 'steps' }],
])

const Elevator = createLucideIcon('Elevator', [
  ['rect', { x: '4', y: '8', width: '16', height: '13', rx: '1', key: 'doors' }],
  ['path', { d: 'M12 8v13M7 5l2-2 2 2m2-2 2 2 2-2', key: 'arrows' }],
])

const amenityIcons: Partial<Record<(typeof amenityConfig)[number]['key'], LucideIcon>> = {
  fingerprint_lock: Fingerprint,
  free_time: Clock3,
  no_live_in_landlord: ShieldCheck,
  has_stairs: Stairs,
  has_elevator: Elevator,
  no_pet: Ban,
  allow_cat: Cat,
  allow_dog: Dog,
  short_term: CalendarClock,
  has_basement: CarFront,
  has_parking: Bike,
  long_term: CalendarCheck,
  private_washer: WashingMachine,
  shared_washer: WashingMachine,
  accepts_foreign_tenants: Globe2,
  private_dryer: Wind,
  shared_dryer: Wind,
  has_balcony: Sun,
  has_window: AppWindow,
}

export default function RoomAmenityTab({ detailForm, onChange }: Props) {
  const [notesHeight, setNotesHeight] = useState(110)

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = notesHeight
    const move = (moveEvent: PointerEvent) => setNotesHeight(Math.max(110, Math.min(420, startHeight + moveEvent.clientY - startY)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }

  return (
    <div className="room-modal-section" style={sectionBox}>
      <div className="room-modal-amenities" style={grid}>
        {amenityConfig.map(item => {
          const key = item.key as keyof RoomDetail
          const checked = Boolean((detailForm as any)[key])
          const Icon = amenityIcons[item.key]

          return (
 
            <button
              key={String(key)}
              type="button"
              className={key === 'has_balcony' ? 'room-modal-amenity-new-row' : undefined}
              aria-pressed={checked}
              style={{
                ...amenityCard,
                ...(Icon ? amenityCardWithIcon : {}),
                ...(checked ? amenityCardOn : {}),
              }}
              onClick={() =>
                onChange({ [key]: !checked } as Partial<RoomDetail>)
              }
            >
              <span
                className="room-modal-amenity-label"
                style={{
                  ...amenityLabel,
                  ...(checked ? amenityLabelOn : {}),
                }}
              >
                {Icon && <Icon className="room-modal-amenity-icon" size={16} strokeWidth={1.75} aria-hidden="true" />}
                <span>{item.label}</span>
              </span>

              <span
                className="room-modal-amenity-switch"
                aria-hidden="true"
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
            </button>
          )
        })}
      </div>

      <div style={textareaWrap}>
        <label style={labelStyle}>Các tiện ích khác</label>
        <div style={{ position: 'relative' }}>
          <textarea
            style={{ ...textareaStyle, height: notesHeight }}
            value={detailForm.other_amenities ?? ''}
            onChange={e => onChange({ other_amenities: e.target.value })}
            placeholder={`Nhập các tiện ích khác theo đúng bố cục bạn muốn hiển thị

        Ví dụ:
        - Có ban công
        - Có máy giặt riêng
        - Giờ giấc tự do`}
          />
          <button type="button" aria-label="Kéo để mở rộng ô nhập" title="Kéo để mở rộng" style={resizeHandle} onPointerDown={startResize}>↕</button>
        </div>
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
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
}

const amenityCardOn: React.CSSProperties = {
  background: '#eff6ff',
  border: '1px solid #2563eb',
  boxShadow: '0 0 0 1px rgba(37, 99, 235, 0.12)',
}

const amenityCardWithIcon: React.CSSProperties = {
  paddingLeft: 4,
  gap: 3,
}

const amenityLabel: React.CSSProperties = {
  color: '#111827',
  lineHeight: 1.2,
}

const amenityLabelOn: React.CSSProperties = {
  color: '#1d4ed8',
  fontWeight: 600,
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
  resize: 'none',
  paddingRight: 34,
  display: 'block',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
  fontFamily: 'inherit',
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
