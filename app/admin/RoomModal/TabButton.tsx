'use client'

type Props = {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  type?: 'button' | 'submit' | 'reset'
}

export default function TabButton({ active, children, onClick, type = 'button' }: Props) {
  return (
    <button
      onClick={onClick}
      type={type}
      style={{
        flex: 1,
        padding: 10,
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        background: active ? '#2563eb' : '#e5e7eb',
        color: active ? '#fff' : '#111827',
      }}
    >
      {children}
    </button>
  )
}