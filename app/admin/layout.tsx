import Link from "next/link";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#efe5d7]">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#956b45]/25 bg-[#704522] px-4 py-3 text-[#fff6e8] shadow-[0_8px_24px_rgba(83,48,22,0.14)]">
          <Link href="/admin" className="text-sm font-black tracking-wide sm:text-base">The Room SG <span className="font-medium text-[#e9cfad]">· Quản trị</span></Link>
          <div className="flex items-center gap-2">
            <nav aria-label="Điều hướng Admin" className="flex flex-wrap items-center gap-1.5">
              <Link href="/admin" className="rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10 sm:text-sm">Quản lý phòng</Link>
              <Link href="/admin/room-inquiries" className="rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10 sm:text-sm">Yêu cầu phòng</Link>
              <Link href="/admin/notifications" className="rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10 sm:text-sm">Thông báo</Link>
            </nav>
          </div>
        </header>
        <div className="rounded-2xl bg-white border border-black/5">
          <div className="p-4">
            {children}</div>
        </div>
      </div>
    </div>
  )
}
