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
  if (!visible.length) return <p style={{ color: "#64748b", fontSize: 13 }}>Chưa có ảnh/video. Thay đổi sẽ được lưu cùng bản nháp.</p>
  return <section aria-label="Sắp xếp ảnh và video">
    <div style={{ marginBottom: 6, color: '#475569', fontSize: 13 }}>Kéo thả để đổi thứ tự ảnh/video. Thay đổi được lưu khi bấm Lưu bản nháp hoặc Duyệt/Đăng.</div>
    <style>{`.import-media-move { opacity: 0; transition: opacity .15s; } .import-media-tile:hover .import-media-move, .import-media-tile:focus-within .import-media-move { opacity: 1; } @media (pointer: coarse) { .import-media-move { opacity: 1; } } .import-media-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 10px; } @media (min-width: 768px) { .import-media-preview-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }`}</style>
    <div className="import-media-preview-grid">
      {visible.map(({ item, index }) => {
        const label = `${item.type === 'video' ? 'Video' : 'Ảnh'} ${index + 1}`
        const url = String(item.url || item.path)
        return <div key={`${item.type}-${item.id || url}`} className="import-media-tile" data-room-media-index={index} data-media-id={item.id || url} role="group" aria-label={label}
          draggable={!disabled}
          onDragStart={event => { drag.current = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
          onDragOver={event => { if (drag.current == null) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(index) }}
          onDrop={event => { event.preventDefault(); if (drag.current != null) move(drag.current, index); clear() }}
          onDragEnd={clear}
          style={{ minWidth: 0, position: 'relative', aspectRatio: '1 / 1', border: '1px solid #e5e7eb', outline: over === index ? '2px dashed #93c5fd' : undefined, outlineOffset: 2, borderRadius: 10, overflow: 'hidden', background: '#fff', userSelect: 'none' }}>
          <button type="button" disabled={disabled} aria-label={`Xóa ${label}`} onClick={event => { event.stopPropagation(); if (!disabled) onChange(media.filter((_, position) => position !== index).map((item, order) => ({ ...item, sort_order: order }))) }} style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, zIndex: 2, borderRadius: 999, border: '1px solid #e5e7eb', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontWeight: 700, lineHeight: '24px' }}>✕</button>
          <div style={{ height: '100%', width: '100%' }}>
            {item.type === 'image'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt={label} draggable={false} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <video src={url} poster={item.thumb || undefined} controls preload="metadata" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div className="import-media-move" style={{ position: 'absolute', left: 6, bottom: 6 }}>
            <button type="button" disabled={disabled} aria-label={`Sắp xếp ${label}`} title="Kéo để đổi thứ tự hoặc dùng phím mũi tên" style={{ touchAction: 'none', cursor: 'grab', padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'rgba(255,255,255,0.9)' }}
              onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); move(index, index + (event.key === 'ArrowLeft' ? -1 : 1)) }}
              onPointerDown={event => { if (event.pointerType === 'mouse') return; event.preventDefault(); drag.current = index; target.current = index; event.currentTarget.setPointerCapture(event.pointerId) }}
              onPointerMove={event => { if (event.pointerType === 'mouse' || drag.current == null) return; const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-room-media-index]'); if (element) { target.current = Number(element.getAttribute('data-room-media-index')); setOver(target.current) } }}
              onPointerUp={event => { if (event.pointerType === 'mouse') return; if (drag.current != null && target.current != null) move(drag.current, target.current); clear() }}
              onPointerCancel={clear}>↔</button>
          </div>
        </div>
      })}
    </div>
  </section>
}
