import "./RoomModal/compact.css";
import "./admin-desktop.css";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import StaffAccountsButton from "./StaffAccountsButton";
import AdminLinkPending from "./AdminLinkPending";
import { getAdminRequestContext } from "./request-context";

const navLinkClass = "relative inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10 sm:text-sm";

async function NewRequestsBadge() {
  const { supabase, level } = await getAdminRequestContext();
  if (!level) return null;
  const { count, error } = await supabase
    .from("room_consult_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error || !count) return null;
  return (
    <span aria-label={`${count} yêu cầu mới`} className="min-w-5 rounded-full bg-[#b91c1c] px-1.5 py-0.5 text-center text-[11px] leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

async function AdminActions() {
  const { level } = await getAdminRequestContext();
  if (!level) return null;
  return (
    <>
      {level === 1 && <StaffAccountsButton />}
      <Link href="/admin/room-inquiries" className={navLinkClass}>
        Tư vấn / xem phòng
        <Suspense fallback={null}><NewRequestsBadge /></Suspense>
        <AdminLinkPending />
      </Link>
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-app-shell min-h-screen overflow-x-hidden bg-[#efe5d7]">
      <div className="admin-app-frame mx-auto max-w-[1200px] px-4 py-4">
        <header className="admin-navigation mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[#956b45]/25 bg-[#704522] px-3 py-2 text-[#fff6e8] shadow-[0_8px_24px_rgba(83,48,22,0.14)] sm:px-4">
          <Link href="/" aria-label="Về trang chủ" className="relative shrink-0 rounded-lg">
            <Image src="/logo-ui.webp" alt="The Room SG" width={56} height={56} unoptimized className="h-12 w-12 rounded-lg object-contain sm:h-14 sm:w-14" />
            <AdminLinkPending />
          </Link>
          <nav aria-label="Điều hướng Admin" className="admin-navigation-links flex min-w-0 flex-wrap items-center gap-1">
            <Link href="/admin" className={navLinkClass}>Quản lý phòng<AdminLinkPending /></Link>
            <Suspense fallback={<span aria-hidden="true" className="h-6 w-24 animate-pulse rounded-lg bg-white/20" />}>
              <AdminActions />
            </Suspense>
          </nav>
        </header>
        <div className="admin-content-card rounded-2xl bg-white border border-black/5">
          <div className="admin-content-body p-4">
            {children}</div>
        </div>
      </div>
    </div>
  )
}
