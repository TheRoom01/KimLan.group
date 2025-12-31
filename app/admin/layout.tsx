export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-200 overflow-x-hidden">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <div className="rounded-2xl bg-white border border-black/5">
          <div className="p-4">
        
            {children}</div>
        </div>
      </div>
    </div>
  )
}
