import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CircleParking,
  Clock3,
  ExternalLink,
  ImageIcon,
  KeyRound,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  WashingMachine,
} from "lucide-react";

import PropertyInvitationsPanel from "@/components/owner/PropertyInvitationsPanel";
import PropertyMembersPanel, {
  type PropertyMemberItem,
} from "@/components/owner/PropertyMembersPanel";
import { getPropertyDetail } from "@/lib/owner/getPropertyDetail";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PropertyExtras = {
  gallery_images?: string[] | null;
  google_maps_url?: string | null;
  default_room_data?: Record<string, any> | null;
  note?: string | null;
};

type AccountUser = {
  display_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  phones?: Array<{ phone?: string | null }> | null;
};

const AMENITIES = [
  ["has_elevator", "Thang máy", Building2],
  ["has_stairs", "Cầu thang bộ", Sparkles],
  ["shared_washer", "Máy giặt chung", WashingMachine],
  ["private_washer", "Máy giặt riêng", WashingMachine],
  ["shared_dryer", "Máy sấy chung", Sparkles],
  ["private_dryer", "Máy sấy riêng", Sparkles],
  ["has_parking", "Chỗ để xe", CircleParking],
  ["has_basement", "Hầm xe", CircleParking],
  ["fingerprint_lock", "Khóa vân tay", ShieldCheck],
  ["allow_pet", "Cho nuôi thú cưng", PawPrint],
  ["allow_cat", "Cho nuôi mèo", PawPrint],
  ["allow_dog", "Cho nuôi chó", PawPrint],
  ["short_term", "Thuê ngắn hạn", CalendarDays],
  ["long_term", "Thuê dài hạn", CalendarDays],
] as const;

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPropertyDetail(id);
  const property = data.property;

  if (!property) {
    return <div className="rounded-xl border bg-white p-6">Không tìm thấy thông tin tòa nhà.</div>;
  }

  const supabase = await createSupabaseServerClient();
  const [authResult, permissionResult, accountResult, extrasResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("can_manage_property", { p_property_id: property.id }),
    supabase.rpc("get_owner_account_panel_v1"),
    supabase
      .from("properties")
      .select("gallery_images, google_maps_url, default_room_data, note")
      .eq("id", property.id)
      .single(),
  ]);

  const user = authResult.data.user;
  const canManage = permissionResult.data === true;
  const accountPanel = accountResult.data;
  const extras = (extrasResult.data ?? {}) as PropertyExtras;
  const accountUser = (accountPanel?.current_user ?? {}) as AccountUser;
  const accountMembers = (Array.isArray(accountPanel?.members) ? accountPanel.members : []) as Array<{
    user_id?: string;
    display_name?: string | null;
    contact_email?: string | null;
  }>;
  const memberNames = new Map(accountMembers.map((member) => [member.user_id, member]));
  const members = ((data.members ?? []) as PropertyMemberItem[]).map((member) => ({
    ...member,
    display_name: memberNames.get(member.user_id)?.display_name ?? null,
    email: memberNames.get(member.user_id)?.contact_email ?? null,
  }));
  const currentMembership = members.find(
    (member) => member.user_id === user?.id && member.status === "active",
  );
  const ownerMember = members.find((member) => member.role === "owner" && member.status === "active");
  const isOwner = currentMembership?.role === "owner";
  const rooms = data.rooms ?? [];
  const summary = data.summary;
  const displayName = propertyDisplayAddress(property);
  const defaults = extras.default_room_data ?? {};
  const roomDetails = defaults.room_details ?? {};
  const images = Array.from(
    new Set(
      [property.cover_image, ...(extras.gallery_images ?? [])].filter(
        (url): url is string => Boolean(url) && !isVideoUrl(String(url)),
      ),
    ),
  );
  const amenities = AMENITIES.filter(([key]) => Boolean(roomDetails[key]));
  const phones = Array.from(
    new Set(
      [
        ...(accountUser.phones ?? []).map((item) => item.phone),
        accountUser.contact_phone,
        ...String(defaults.zalo_phone ?? "").split(/[\n,;]/),
      ].map((value) => value?.trim()).filter(Boolean) as string[],
    ),
  );

  return (
    <div className="min-w-0 space-y-5 text-[#432918]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#80634a]">
          <Building2 size={16} /> Tòa nhà <span className="text-[#b79a7c]">/</span>
          <span className="max-w-[50vw] truncate text-[#4d3422]">{displayName}</span>
        </p>
        <Link href="/owner/properties" className="inline-flex items-center gap-2 rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#684324] transition hover:bg-[#f3e1c9]">
          <ArrowLeft size={16} /> Danh sách tòa nhà
        </Link>
      </div>

      <section className="grid overflow-hidden rounded-[24px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_310px]">
        <div className="border-b border-[#956b45]/20 p-4 lg:border-b-0 lg:border-r">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[#eadbc8]">
            {images[0] ? <img src={images[0]} alt={displayName} className="h-full w-full object-cover" /> : <EmptyImage />}
            {images.length > 0 ? <span className="absolute right-3 top-3 rounded-full bg-[#2b1a10]/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur"><ImageIcon className="mr-1 inline" size={14} /> {images.length} ảnh</span> : null}
          </div>
          {images.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {images.slice(0, 5).map((image, index) => <div key={image} className={`aspect-[4/3] overflow-hidden rounded-xl border-2 ${index === 0 ? "border-[#744722]" : "border-transparent"}`}><img src={image} alt={`Ảnh tòa nhà ${index + 1}`} className="h-full w-full object-cover" /></div>)}
            </div>
          ) : null}
        </div>

        <div className="border-b border-[#956b45]/20 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold sm:text-3xl">{displayName}</h1>
                <PropertyStatusBadge approvalStatus={property.approval_status} lifecycleStatus={property.lifecycle_status} />
              </div>
              <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#80634a]"><MapPin className="mt-0.5 shrink-0" size={17} /> {property.full_address || displayName}</p>
              {property.code ? <p className="mt-1 text-xs text-[#9a7758]">Mã tòa nhà: {property.code}</p> : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard title="Tổng phòng" value={summary.total_rooms} />
            <StatCard title="Đã thuê" value={summary.rented_rooms} color="text-[#2d6a3d]" />
            <StatCard title="Đang trống" value={summary.empty_rooms} color="text-[#22834c]" />
            <StatCard title="Sắp trống" value={summary.upcoming_rooms} color="text-[#9a5b13]" />
          </div>

          <p className="mt-6 whitespace-pre-line text-sm leading-7 text-[#6f5239]">
            {extras.note || defaults.description || "Thông tin vận hành và mô tả tòa nhà sẽ được hiển thị tại đây."}
          </p>

          {canManage && property.lifecycle_status !== "archived" ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/owner/properties/${property.id}/edit`} className="rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-4 py-2.5 text-sm font-semibold text-[#684324] hover:bg-[#f3e1c9]">Chỉnh sửa tòa nhà</Link>
              <Link href={`/owner/rooms/create?property_id=${property.id}`} className="rounded-xl bg-[#744722] px-4 py-2.5 text-sm font-semibold text-[#fff8eb] hover:bg-[#623817]">+ Tạo phòng</Link>
            </div>
          ) : null}
        </div>

        <aside className="p-5 sm:p-6">
          <h2 className="text-lg font-bold">Thông tin liên hệ</h2>
          <div className="mt-5 space-y-4 text-sm text-[#674b34]">
            {phones.length ? phones.slice(0, 2).map((phone) => <a key={phone} href={`tel:${phone}`} className="flex items-center gap-3 hover:text-[#744722]"><ContactIcon><Phone size={16} /></ContactIcon><span>{phone}</span></a>) : <ContactRow icon={<Phone size={16} />} text="Chưa cập nhật số điện thoại" />}
            {accountUser.contact_email || ownerMember?.email ? <a href={`mailto:${accountUser.contact_email || ownerMember?.email}`} className="flex items-center gap-3 break-all hover:text-[#744722]"><ContactIcon><Mail size={16} /></ContactIcon><span>{accountUser.contact_email || ownerMember?.email}</span></a> : null}
            <ContactRow icon={<UserRound size={16} />} text={ownerMember?.display_name || accountUser.display_name || "Chủ sở hữu tòa nhà"} />
            <ContactRow icon={<Clock3 size={16} />} text="Hỗ trợ theo lịch hẹn" />
            {extras.google_maps_url ? <a href={extras.google_maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 font-semibold text-[#744722]"><ContactIcon><ExternalLink size={16} /></ContactIcon><span>Mở Google Maps</span></a> : null}
          </div>
          {phones[0] ? <a href={`tel:${phones[0]}`} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-bold text-white transition hover:bg-[#623817]"><Phone size={16} /> Liên hệ quản lý</a> : null}
        </aside>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)]">
        <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-[0_10px_25px_rgba(92,61,34,0.06)]">
          <h2 className="text-lg font-bold">Tiện ích</h2>
          {amenities.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{amenities.map(([key, label, Icon]) => <div key={key} className="flex items-center gap-3 rounded-xl bg-[#f8ead7] px-3 py-3 text-sm font-semibold text-[#65472f]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#fff9ef] text-[#744722]"><Icon size={17} /></span>{label}</div>)}</div> : <p className="mt-3 text-sm text-[#80634a]">Chưa cập nhật tiện ích chung.</p>}
          {roomDetails.other_amenities ? <p className="mt-4 text-sm leading-6 text-[#80634a]">{roomDetails.other_amenities}</p> : null}
        </section>
        <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-[0_10px_25px_rgba(92,61,34,0.06)]">
          <h2 className="text-lg font-bold">Thông tin tòa nhà</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <InfoItem label="Loại hình" value="Tòa nhà cho thuê" />
            <InfoItem label="Số phòng" value={`${summary.total_rooms} phòng`} />
            <InfoItem label="Trạng thái" value={property.lifecycle_status === "archived" ? "Đã lưu trữ" : "Đang hoạt động"} />
            <InfoItem label="Quyền của bạn" value={currentMembership?.role || "Thành viên"} />
          </dl>
        </section>
      </div>

      <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 shadow-[0_10px_25px_rgba(92,61,34,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Phòng trong tòa nhà</h2><p className="mt-1 text-sm text-[#80634a]">Chọn một phòng để mở trang quản lý phòng.</p></div>
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#80634a]"><Legend color="bg-[#2f9e62]" label="Đang trống" /><Legend color="bg-[#cf5252]" label="Đã thuê" /><Legend color="bg-[#d99a35]" label="Sắp trống" /></div>
        </div>
        {rooms.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rooms.map((room) => {
              const status = room.displayStatus || room.status || "Đang trống";
              const style = roomStatusStyle(status);
              return <Link key={room.id} href={`/owner/rooms/${room.id}`} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${style.card}`}>
                <div className="flex items-start justify-between gap-3"><div><p className={`text-lg font-extrabold ${style.title}`}>{room.room_code || "Chưa đặt mã"}</p><p className="mt-1 text-xs text-[#80634a]">{room.room_type || "Chưa phân loại"}{room.price != null ? ` · ${Number(room.price).toLocaleString("vi-VN")}đ` : ""}</p></div><KeyRound size={17} className="shrink-0 opacity-60" /></div>
                <p className={`mt-3 text-right text-xs font-bold ${style.title}`}>{status}</p>
              </Link>;
            })}
          </div>
        ) : <div className="mt-5 rounded-2xl border border-dashed border-[#a9825f]/35 p-6 text-sm text-[#80634a]">Chưa có phòng trong tòa nhà này.</div>}
      </section>

      <PropertyMembersPanel propertyId={property.id} currentUserId={user?.id} initialMembers={members} isOwner={isOwner} />
      {canManage ? <PropertyInvitationsPanel propertyId={property.id} /> : null}
    </div>
  );
}

function EmptyImage() { return <div className="flex h-full flex-col items-center justify-center gap-2 text-[#98785b]"><Building2 size={32} /><span className="text-sm">Chưa có ảnh tòa nhà</span></div>; }
function ContactIcon({ children }: { children: React.ReactNode }) { return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f8ead7] text-[#744722]">{children}</span>; }
function ContactRow({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="flex items-center gap-3"><ContactIcon>{icon}</ContactIcon><span>{text}</span></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>; }
function InfoItem({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-[#9a7758]">{label}</dt><dd className="mt-1 font-semibold text-[#4d3422]">{value}</dd></div>; }

function StatCard({ title, value, color = "text-[#4d3422]" }: { title: string; value: number; color?: string }) {
  return <div className="rounded-2xl bg-[#f8ead7] p-3 text-center"><p className={`text-xl font-bold ${color}`}>{value}</p><p className="mt-1 text-xs text-[#80634a]">{title}</p></div>;
}

function PropertyStatusBadge({ approvalStatus, lifecycleStatus }: { approvalStatus?: string | null; lifecycleStatus?: string | null }) {
  if (lifecycleStatus === "archived") return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Đã lưu trữ</span>;
  const states: Record<string, { label: string; className: string }> = {
    approved: { label: "Đã duyệt", className: "bg-green-100 text-green-700" },
    pending: { label: "Chờ duyệt", className: "bg-amber-100 text-amber-800" },
    rejected: { label: "Bị từ chối", className: "bg-red-100 text-red-700" },
    draft: { label: "Bản nháp", className: "bg-gray-100 text-gray-700" },
  };
  const state = states[approvalStatus ?? "draft"] ?? states.draft;
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${state.className}`}><Check className="mr-1 inline" size={12} />{state.label}</span>;
}

function roomStatusStyle(status: string) {
  if (status === "Đã thuê") return { card: "border-red-200 bg-red-50/80 hover:border-red-300", title: "text-red-700" };
  if (status === "Sắp trống") return { card: "border-amber-200 bg-amber-50/80 hover:border-amber-300", title: "text-amber-700" };
  return { card: "border-emerald-200 bg-emerald-50/80 hover:border-emerald-300", title: "text-emerald-700" };
}

function isVideoUrl(url: string) { return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url) || url.includes("/video/"); }
