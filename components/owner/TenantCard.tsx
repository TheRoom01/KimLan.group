"use client";

import Link from "next/link";
import { Building2, ImageIcon, KeyRound, MessageCircle, Phone, Trash2, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type MouseEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
    contract_type?: "lease" | "deposit" | string | null;
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
  const [identityPreview, setIdentityPreview] = useState<{ url: string; label: string } | null>(null);
  const router = useRouter();
  const tenant = item.tenant;
  const contract = item.active_contract;
  const detailHref = `/owner/tenants/${tenant.id}`;
  const isRepresentative =
    contract?.tenant_role === "Chủ hợp đồng" ||
    contract?.tenant_role === "representative";
  const phoneDigits = tenant.phone?.replace(/\D/g, "") ?? "";

  useEffect(() => {
    if (!identityPreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIdentityPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [identityPreview]);

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
        <IdentityImage url={tenant.cccd_front_url} label="CCCD mặt trước" onOpen={(url, label) => setIdentityPreview({ url, label })} />
        <IdentityImage url={tenant.cccd_back_url} label="CCCD mặt sau" onOpen={(url, label) => setIdentityPreview({ url, label })} />
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
            {tenant.phone ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                <a href={`tel:${tenant.phone}`} onClick={keepCardClosed} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 text-[#80634a] transition hover:bg-[#f4e4cf] hover:text-[#5f391f]" aria-label={`Gọi ${tenant.phone}`}>
                  <Phone size={14} /> {tenant.phone}
                </a>
                <a href={`https://zalo.me/${phoneDigits}`} target="_blank" rel="noreferrer" onClick={keepCardClosed} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#9b7655]/35 px-2.5 font-semibold text-[#744722] transition hover:bg-[#f4e4cf]" aria-label={`Liên hệ Zalo ${tenant.phone}`}>
                  <MessageCircle size={14} /> Zalo
                </a>
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#80634a]"><Phone size={14} /> Chưa có SĐT</p>
            )}
          </div>
          <UserRound size={20} className="shrink-0 text-[#9b7655]" />
        </div>

        {contract ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-3 text-sm text-[#74583e] sm:grid-cols-2">
            <div className="min-w-0">
              <span className="text-xs text-[#8a6b50]">Tòa nhà</span>
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
            <div>
              {contract.id ? (
                <Link
                  href={`/owner/contracts/${contract.id}`}
                  onClick={keepCardClosed}
                  className="inline-flex min-h-8 items-center gap-1.5 font-bold text-[#4d3422] underline decoration-[#9b7655]/45 underline-offset-2 transition hover:text-[#744722] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#744722]"
                  aria-label="Xem chi tiết hợp đồng"
                >
                  <KeyRound size={16} className="shrink-0" />
                  Xem chi tiết Hợp đồng
                </Link>
              ) : (
                <strong className="mt-0.5 block text-[#4d3422]">-</strong>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-[#f8ead7] p-3 text-sm text-[#80634a]">Chưa có hợp đồng đang hiệu lực.</p>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#8a6547] opacity-80 transition group-hover:text-[#684324] group-hover:opacity-100">
          <Building2 size={14} /> Bấm vào card để xem hồ sơ khách thuê
        </p>
      </div>
      {identityPreview && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`Xem ${identityPreview.label}`} onClick={(event) => { event.stopPropagation(); setIdentityPreview(null); }}>
          <img src={identityPreview.url} alt={identityPreview.label} className="h-full w-full object-contain" onClick={(event) => event.stopPropagation()} />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent p-4 text-white sm:p-6">
            <strong className="text-sm sm:text-base">{identityPreview.label}</strong>
            <button type="button" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/45 transition hover:bg-black/70" onClick={(event) => { event.stopPropagation(); setIdentityPreview(null); }} aria-label="Đóng ảnh CCCD"><X size={23} /></button>
          </div>
        </div>,
        document.body,
      ) : null}
    </article>
  );
}

function IdentityImage({ url, label, onOpen }: { url?: string | null; label: string; onOpen: (url: string, label: string) => void }) {
  return (
    <div className="relative aspect-[1.58/1] min-w-0 overflow-hidden bg-[#eadbc8]">
      {url ? (
        <button type="button" className="h-full w-full cursor-zoom-in" onClick={(event) => { event.stopPropagation(); onOpen(url, label); }} aria-label={`Xem toàn màn hình ${label}`}>
          <img src={url} alt={label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
        </button>
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
