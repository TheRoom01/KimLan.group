"use client";

import Link from "next/link";
import { ArrowRight, ImageIcon, KeyRound, Users } from "lucide-react";
import { useState } from "react";
import {
  normalizeRoomStatus,
  type OwnerPropertyReference,
  type OwnerTenantReference,
} from "@/lib/owner/types";
import TenantIdentityModal from "@/components/owner/TenantIdentityModal";

type RoomMediaReference = {
  id?: string;
  type?: "image" | "video" | string | null;
  url?: string | null;
  is_cover?: boolean | null;
  sort_order?: number | null;
};

type RoomCardData = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  status?: string | null;
  displayStatus?: string | null;
  daysRemaining?: number | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  tenants?: OwnerTenantReference[] | null;
  media?: RoomMediaReference[] | null;
  coverImage?: string | null;
  property?: OwnerPropertyReference | null;
};

function propertyLabel(property?: OwnerPropertyReference | null) {
  if (!property) return null;

  return (
    property.name ||
    [property.house_number, property.address, property.district]
      .filter(Boolean)
      .join(" ") ||
    null
  );
}

function coverUrl(room: RoomCardData) {
  if (room.coverImage) return room.coverImage;

  return [...(room.media ?? [])]
    .sort(
      (left, right) =>
        Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
    )
    .find((item) => item.type === "image" && item.is_cover)?.url ??
    room.media?.find((item) => item.type === "image")?.url ??
    null;
}

export default function RoomCard({ room }: { room: RoomCardData }) {
  const [selectedTenant, setSelectedTenant] =
    useState<OwnerTenantReference | null>(null);
  const status =
    normalizeRoomStatus(room.displayStatus) ??
    normalizeRoomStatus(room.status) ??
    "Đang trống";
  const statusStyle =
    status === "Đã thuê"
      ? "bg-[#dcefdc] text-[#2d6a3d]"
      : status === "Sắp trống"
        ? "bg-[#f8e6c5] text-[#8a5b1f]"
        : "bg-[#eadbc8] text-[#684324]";
  const tenants = Array.from(
    new Map(
      [
        ...(room.tenants ?? []),
        ...(Array.isArray(room.tenant) ? room.tenant : room.tenant ? [room.tenant] : []),
      ].map((tenant) => [tenant.id, tenant]),
    ).values(),
  );
  const representative =
    tenants.find((tenant) => tenant.role === "Chủ hợp đồng") ?? tenants[0];
  const buildingName = propertyLabel(room.property);
  const imageUrl = coverUrl(room);

  return (
    <>
      <article className="group overflow-hidden rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] shadow-[0_14px_35px_rgba(92,61,34,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(92,61,34,0.14)]">
        <div className="relative aspect-[16/9] overflow-hidden bg-[#eadbc8]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Ảnh cover phòng ${room.room_code || ""}`}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[#98785b]">
              <ImageIcon size={26} />
              <span className="text-xs">Chưa có ảnh cover</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[#2b1a10]/70 to-transparent p-4 pt-10">
            <div className="min-w-0 text-[#fff8eb]">
              <p className="truncate text-lg font-bold">
                Phòng {room.room_code || "-"}
              </p>
              {buildingName ? (
                <p className="mt-0.5 truncate text-xs text-[#f4dcc0]">
                  {buildingName}
                </p>
              ) : null}
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusStyle}`}>
              {status}
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#5a3b25]">
                {room.room_type || "Chưa phân loại"}
              </p>
              <p className="mt-1 text-sm text-[#80634a]">
                Giá:{" "}
                <strong className="text-[#684324]">
                  {room.price === null || room.price === undefined
                    ? "-"
                    : `${Number(room.price).toLocaleString("vi-VN")}đ`}
                </strong>
              </p>
            </div>
            <KeyRound size={18} className="shrink-0 text-[#9b7655]" />
          </div>

          {room.daysRemaining !== null &&
          room.daysRemaining !== undefined &&
          room.daysRemaining >= 0 ? (
            <p className="rounded-xl bg-[#f8e6c5] px-3 py-2 text-xs font-semibold text-[#8a5b1f]">
              Hợp đồng còn {room.daysRemaining} ngày
            </p>
          ) : null}

          <div className="rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users size={17} className="text-[#744722]" />
                <p className="text-xs font-bold uppercase tracking-wide text-[#5a3b25]">
                  Người ở cùng phòng
                </p>
              </div>
              <span className="rounded-full bg-[#ead3b3] px-2 py-0.5 text-[10px] font-bold text-[#684324]">
                {tenants.length}
              </span>
            </div>

            {tenants.length === 0 ? (
              <p className="mt-3 text-sm text-[#80634a]">Chưa có khách thuê.</p>
            ) : (
              <div className="mt-3 divide-y divide-[#b58f69]/20">
                {tenants.map((tenant) => {
                  const isRepresentative =
                    tenant.id === representative?.id ||
                    tenant.role === "Chủ hợp đồng";

                  return (
                    <button
                      type="button"
                      key={tenant.id}
                      onClick={() => setSelectedTenant(tenant)}
                      className="flex w-full min-w-0 items-center justify-between gap-3 py-2 text-left transition first:pt-0 last:pb-0 hover:text-[#744722]"
                    >
                      <span className="min-w-0">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#4d3422]">
                            {tenant.full_name}
                          </span>
                          {isRepresentative ? (
                            <span className="rounded-full bg-[#744722] px-2 py-0.5 text-[10px] font-bold text-[#fff8eb]">
                              Đại diện
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#80634a]">
                          {tenant.phone || "Chưa có SĐT"}
                        </span>
                      </span>
                      <ArrowRight size={15} className="shrink-0 text-[#9b7655]" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href={`/owner/rooms/${room.id}`}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-3 text-sm font-semibold text-[#fff8eb] transition hover:bg-[#623817]"
          >
            Quản lý phòng
            <ArrowRight size={16} />
          </Link>
        </div>
      </article>

      {selectedTenant ? (
        <TenantIdentityModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      ) : null}
    </>
  );
}
