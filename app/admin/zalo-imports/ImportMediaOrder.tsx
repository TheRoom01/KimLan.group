'use client'

import { useRef, useState } from 'react'

export default function ImportMediaOrder({ media, onChange, disabled = false }: {
  media: any[]; onChange: (media: any[]) => void; disabled?: boolean
}) {
  const drag = useRef<number | null>(null)
  const target = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const move = (from: number, to: number) => {
    if (disabled || from === to || from < 0 || to < 0 || from >= media.length || to >= media.length) return
    const next = [...media]
    next.splice(to, 0, next.splice(from, 1)[0])
    onChange(next.map((item, index) => ({ ...item, sort_order: index })))
  }
  const clear = () => { drag.current = null; target.current = null; setOver(null) }
  const visible = media.map((item, index) => ({ item, index })).filter(({ item }) =>
    ['image', 'video'].includes(item?.type) && /^https?:\/\//.test(String(item?.url || item?.path || '')))
  if (!visible.length) return null
  return <section aria-label="Sắp xếp ảnh và video">
    <div style={{ marginBottom: 6, color: '#475569', fontSize: 13 }}>Kéo thả để đổi thứ tự ảnh/video. Thứ tự được lưu tự động. Trên điện thoại, giữ nút ↔ để kéo.</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
      {visible.map(({ item, index }) => {
        const label = `${item.type === 'video' ? 'Video' : 'Ảnh'} ${index + 1}`
        const url = String(item.url || item.path)
        return <div key={`${item.type}-${item.id || url}`} data-room-media-index={index} data-media-id={item.id || url} role="group" aria-label={label}
          draggable={!disabled}
          onDragStart={event => { drag.current = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
          onDragOver={event => { if (drag.current == null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(index) }}
          onDrop={event => { event.preventDefault(); if (drag.current != null) move(drag.current, index); clear() }}
          onDragEnd={clear}
          style={{ minWidth: 0, border: over === index ? '2px dashed #2563eb' : '2px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#f8fafc' }}>
          <div style={{ height: 110, background: '#0f172a' }}>
            {item.type === 'image'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt={label} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <video src={url} poster={item.thumb || undefined} controls preload="metadata" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 4, gap: 4 }}>
            <button type="button" disabled={disabled} aria-label={`Sắp xếp ${label}`} title="Kéo để đổi thứ tự hoặc dùng phím mũi tên" style={{ touchAction: 'none', cursor: 'grab', padding: '6px 8px' }}
              onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); move(index, index + (event.key === 'ArrowLeft' ? -1 : 1)) }}
              onPointerDown={event => { if (event.pointerType === 'mouse') return; event.preventDefault(); drag.current = index; target.current = index; event.currentTarget.setPointerCapture(event.pointerId) }}
              onPointerMove={event => { if (event.pointerType === 'mouse' || drag.current == null) return; const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-room-media-index]'); if (element) { target.current = Number(element.getAttribute('data-room-media-index')); setOver(target.current) } }}
              onPointerUp={event => { if (event.pointerType === 'mouse') return; if (drag.current != null && target.current != null) move(drag.current, target.current); clear() }}
              onPointerCancel={clear}>↔ <span style={{ fontSize: 12 }}>{index + 1}</span></button>
          </div>
        </div>
      })}
    </div>
  </section>
}
