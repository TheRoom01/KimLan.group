"use client";

import Link from "next/link";
import { ArrowRight, ImageIcon, Phone, UserRound } from "lucide-react";
import { useState } from "react";
import TenantIdentityModal from "@/components/owner/TenantIdentityModal";

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
    tenant_role?: string | null;
    monthly_price?: number | null;
    room?: {
      room_code?: string | null;
      cover_image?: string | null;
    } | null;
    property?: {
      name?: string | null;
      address?: string | null;
    } | null;
  } | null;
  contracts_count?: number;
};

export default function TenantCard({ item }: { item: TenantCardData }) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const tenant = item.tenant;
  const contract = item.active_contract;
  const cover = contract?.room?.cover_image;
  const isRepresentative =
    contract?.tenant_role === "Chủ hợp đồng" ||
    contract?.tenant_role === "representative";

  return (
    <>
      <article className="overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)]">
        <div className="flex min-w-0 flex-col sm:flex-row">
          <button
            type="button"
            onClick={() => setIdentityOpen(true)}
            className="group relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-[#eadbc8] text-left sm:aspect-square sm:w-44"
            aria-label={`Xem CCCD của ${tenant.full_name}`}
          >
            {cover ? (
              <img
                src={cover}
                alt={`Ảnh phòng của ${tenant.full_name}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[#98785b]">
                <ImageIcon size={25} />
                <span className="text-xs">Chưa có ảnh phòng</span>
              </div>
            )}
            <span className="absolute bottom-3 left-3 rounded-full bg-[#fff9ef]/90 px-2.5 py-1 text-[10px] font-bold text-[#684324] shadow-sm backdrop-blur">
              Bấm để xem CCCD
            </span>
          </button>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-[#432918]">
                    {tenant.full_name}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      isRepresentative
                        ? "bg-[#744722] text-[#fff8eb]"
                        : "bg-[#eadbc8] text-[#76573e]"
                    }`}
                  >
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
              <div className="mt-4 grid gap-2 rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-3 text-sm text-[#74583e] sm:grid-cols-2">
                <p>
                  <span className="text-xs text-[#8a6b50]">Tòa nhà</span>
                  <strong className="mt-0.5 block text-[#4d3422]">
                    {contract.property?.name ?? contract.property?.address ?? "-"}
                  </strong>
                </p>
                <p>
                  <span className="text-xs text-[#8a6b50]">Phòng</span>
                  <strong className="mt-0.5 block text-[#4d3422]">
                    {contract.room?.room_code ?? "-"}
                  </strong>
                </p>
                <p>
                  <span className="text-xs text-[#8a6b50]">Giá thuê</span>
                  <strong className="mt-0.5 block text-[#4d3422]">
                    {contract.monthly_price
                      ? `${Number(contract.monthly_price).toLocaleString("vi-VN")}đ`
                      : "-"}
                  </strong>
                </p>
                <p>
                  <span className="text-xs text-[#8a6b50]">Số hợp đồng</span>
                  <strong className="mt-0.5 block text-[#4d3422]">
                    {item.contracts_count ?? 0}
                  </strong>
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-[#f8ead7] p-3 text-sm text-[#80634a]">
                Chưa có hợp đồng đang hiệu lực.
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIdentityOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#9a704b]/30 bg-[#fffdf8] px-3 text-sm font-semibold text-[#684324] transition hover:bg-[#f3e1c9]"
              >
                Xem CCCD
              </button>
              <Link
                href={`/owner/tenants/${tenant.id}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#744722] px-3 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817]"
              >
                Xem chi tiết
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </article>

      {identityOpen ? (
        <TenantIdentityModal
          tenant={tenant}
          onClose={() => setIdentityOpen(false)}
        />
      ) : null}
    </>
  );
}
