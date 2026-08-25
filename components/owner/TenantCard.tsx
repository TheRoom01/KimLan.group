"use client";

import Link from "next/link";
import { Building2, ImageIcon, KeyRound, Phone, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { readApiResponse } from "@/lib/api/client";
import { propertyDisplayAddress } from "@/lib/owner/propertyDisplayAddress";
import { showOwnerNavigationSkeleton } from "@/lib/owner/clientExperience";

export type TenantCardData = {
  tenant: {
    id: string;
    full_name: string;
    phone?: string | null;
    cccd?: string | null;
    cccd_front_url?: string | null;
    cccd_back_url?: string | null;
  };
  active_contract?: {
    id?: string | null;
    tenant_role?: string | null;
    monthly_price?: number | null;
    room?: {
      id?: string | null;
      room_code?: string | null;
    } | null;
    property?: {
      id?: string | null;
      name?: string | null;
      house_number?: string | null;
      address?: string | null;
      ward?: string | null;
      district?: string | null;
      city?: string | null;
      full_address?: string | null;
    } | null;
  } | null;
  contracts_count?: number;
};

export default function TenantCard({ item }: { item: TenantCardData }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const tenant = item.tenant;
  const contract = item.active_contract;
  const detailHref = `/owner/tenants/${tenant.id}`;
  const isRepresentative =
    contract?.tenant_role === "Chủ hợp đồng" ||
    contract?.tenant_role === "representative";

  function openTenant() {
    showOwnerNavigationSkeleton();
    router.push(detailHref);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTenant();
    }
  }

  function keepCardClosed(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  async function deleteTenant() {
    if (!window.confirm(`Xóa khách thuê ${tenant.full_name}? Thao tác này sẽ gỡ khách khỏi hợp đồng.`)) return;
    setDeleting(true);
    try {
      await readApiResponse(await fetch(`/api/owner/tenants/${tenant.id}`, { method: "DELETE" }));
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Không thể xóa khách thuê");
      setDeleting(false);
    }
  }

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Xem hồ sơ khách thuê ${tenant.full_name}`}
      onClick={openTenant}
      onKeyDown={handleKeyDown}
      className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(92,61,34,0.13)] focus-visible:ring-2 focus-visible:ring-[#744722]"
    >
      <button
        type="button"
        onClick={(event) => {
          keepCardClosed(event);
          void deleteTenant();
        }}
        disabled={deleting}
        aria-label={`Xóa ${tenant.full_name}`}
        className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-red-700 shadow-md backdrop-blur hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 size={17} />
      </button>

      <div className="grid grid-cols-2 gap-px bg-[#d8c0a4]">
        <IdentityImage url={tenant.cccd_front_url} label="CCCD mặt trước" />
        <IdentityImage url={tenant.cccd_back_url} label="CCCD mặt sau" />
      </div>

      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-[#432918]">{tenant.full_name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isRepresentative ? "bg-[#744722] text-[#fff8eb]" : "bg-[#eadbc8] text-[#76573e]"}`}>
                {isRepresentative ? "Đại diện" : "Ở cùng"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#80634a]">
              <Phone size={14} />
              {tenant.phone || "Chưa có SĐT"}
            </p>
          </div>
          <UserRound size={20} className="shrink-0 text-[#9b7655]" />
        </div>

        {contract ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-3 text-sm text-[#74583e] sm:grid-cols-2">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#8a6b50]">Tòa nhà</span>
                {contract.id ? (
                  <Link
                    href={`/owner/contracts/${contract.id}`}
                    onClick={keepCardClosed}
                    aria-label="Mở hợp đồng thuê"
                    title="Mở hợp đồng thuê"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#744722] transition hover:bg-[#ead2b2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#744722]"
                  >
                    <KeyRound size={17} />
                  </Link>
                ) : null}
              </div>
              {contract.property?.id ? (
                <Link
                  href={`/owner/properties/${contract.property.id}`}
                  onClick={keepCardClosed}
                  className="mt-0.5 block font-bold text-[#4d3422] underline decoration-[#9b7655]/45 underline-offset-2 hover:text-[#744722]"
                >
                  {propertyDisplayAddress(contract.property)}
                </Link>
              ) : (
                <strong className="mt-0.5 block text-[#4d3422]">{propertyDisplayAddress(contract.property)}</strong>
              )}
            </div>

            <div className="min-w-0">
              <span className="text-xs text-[#8a6b50]">Phòng</span>
              {contract.room?.id ? (
                <Link
                  href={`/owner/rooms/${contract.room.id}`}
                  onClick={keepCardClosed}
                  className="mt-0.5 block font-bold text-[#4d3422] underline decoration-[#9b7655]/45 underline-offset-2 hover:text-[#744722]"
                >
                  {contract.room.room_code ?? "-"}
                </Link>
              ) : (
                <strong className="mt-0.5 block text-[#4d3422]">{contract.room?.room_code ?? "-"}</strong>
              )}
            </div>

            <InfoValue label="Giá thuê" value={contract.monthly_price ? `${Number(contract.monthly_price).toLocaleString("vi-VN")}đ` : "-"} />
            <InfoValue label="Số hợp đồng" value={String(item.contracts_count ?? 0)} />
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-[#f8ead7] p-3 text-sm text-[#80634a]">Chưa có hợp đồng đang hiệu lực.</p>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#8a6547] opacity-80 transition group-hover:text-[#684324] group-hover:opacity-100">
          <Building2 size={14} /> Bấm vào card để xem hồ sơ khách thuê
        </p>
      </div>
    </article>
  );
}

function IdentityImage({ url, label }: { url?: string | null; label: string }) {
  return (
    <div className="relative aspect-[1.58/1] min-w-0 overflow-hidden bg-[#eadbc8]">
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[#98785b]">
          <ImageIcon size={22} />
          <span className="text-[10px] font-medium">Chưa có {label.toLowerCase()}</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-[#fff9ef]/90 px-2 py-1 text-[10px] font-bold text-[#684324] shadow-sm backdrop-blur">{label}</span>
    </div>
  );
}

function InfoValue({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-xs text-[#8a6b50]">{label}</span>
      <strong className="mt-0.5 block text-[#4d3422]">{value}</strong>
    </p>
  );
}
