"use client";

import {
  CalendarDays,
  Edit3,
  ExternalLink,
  GripVertical,
  Phone,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  normalizeRoomStatus,
  type OwnerTenantReference,
} from "@/lib/owner/types";

type RoomCardData = {
  id: string;
  room_code?: string | null;
  room_type?: string | null;
  price?: number | null;
  status?: string | null;
  displayStatus?: string | null;
  contract?: {
    id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  tenant?: OwnerTenantReference[] | OwnerTenantReference | null;
  tenants?: OwnerTenantReference[] | null;
};

type Props = {
  room: RoomCardData;
  expanded: boolean;
  resizeMode: boolean;
  width: number;
  height: number;
  onToggle: () => void;
  onResize: (axis: "width" | "height", amount: number) => void;
  onResizeDone: () => void;
  onDragHandlePointerDown: (
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
};

type ModalPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function displayDate(value?: string | null) {
  if (!value) return "Chưa cập nhật";

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? "Chưa cập nhật"
    : date.toLocaleDateString("vi-VN");
}

export default function RoomCard({
  room,
  expanded,
  resizeMode,
  width,
  height,
  onToggle,
  onResize,
  onResizeDone,
  onDragHandlePointerDown,
}: Props) {
  const cardRef = useRef<HTMLElement | null>(null);

  const [modalPosition, setModalPosition] = useState<ModalPosition>({
    top: 0,
    left: 12,
    width: 310,
    maxHeight: 420,
  });

  const status =
    normalizeRoomStatus(room.displayStatus) ??
    normalizeRoomStatus(room.status) ??
    "Đang trống";

  const tenants = Array.from(
    new Map(
      [
        ...(room.tenants ?? []),
        ...(Array.isArray(room.tenant)
          ? room.tenant
          : room.tenant
            ? [room.tenant]
            : []),
      ].map((tenant) => [tenant.id, tenant])
    ).values()
  );

  const representative =
    tenants.find((tenant) => tenant.role === "Chủ hợp đồng") ??
    tenants[0] ??
    null;

  const palette =
    status === "Đã thuê"
      ? "border-red-200 bg-red-50 text-red-950 hover:border-red-300"
      : status === "Sắp trống"
        ? "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300";

  const badge =
    status === "Đã thuê"
      ? "border-red-200/60 bg-red-100/90 text-red-800"
      : status === "Sắp trống"
        ? "border-amber-200/60 bg-amber-100/90 text-amber-800"
        : "border-emerald-200/60 bg-emerald-100/90 text-emerald-800";

  useLayoutEffect(() => {
    if (!expanded) return;

    const updateModalPosition = () => {
      const cardElement = cardRef.current;
      if (!cardElement) return;

      const cardRect = cardElement.getBoundingClientRect();

      const viewportPadding = 12;
      const modalGap = 8;

      const modalWidth = Math.min(
        310,
        window.innerWidth - viewportPadding * 2
      );

      let left = cardRect.left;

      // Nếu modal tràn mép phải thì tự dịch sang trái.
      if (left + modalWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - modalWidth - viewportPadding;
      }

      // Không để modal tràn mép trái.
      left = Math.max(viewportPadding, left);

      // Modal luôn bắt đầu ngay bên dưới thẻ đang mở.
      const top = cardRect.bottom + modalGap;

      // Giới hạn chiều cao để modal luôn nằm trong màn hình.
      const availableHeight = Math.max(
        80,
        window.innerHeight - top - viewportPadding
      );

      setModalPosition({
        top,
        left,
        width: modalWidth,
        maxHeight: availableHeight,
      });
    };

    updateModalPosition();

    const animationFrame =
      window.requestAnimationFrame(updateModalPosition);

    window.addEventListener("resize", updateModalPosition);
    window.addEventListener("scroll", updateModalPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateModalPosition);
      window.removeEventListener("scroll", updateModalPosition, true);
    };
  }, [expanded]);

  const detailModal =
    expanded && typeof document !== "undefined"
      ? createPortal(
          <section
            data-owner-floating="true"
            style={{
              top: modalPosition.top,
              left: modalPosition.left,
              width: modalPosition.width,
              maxHeight: modalPosition.maxHeight,
            }}
            className="
              fixed z-[100]
              overflow-x-hidden overflow-y-auto
              overscroll-contain
              rounded-[20px]
              border border-white/30
              bg-[linear-gradient(145deg,rgba(102,79,66,0.62),rgba(58,39,30,0.7)_48%,rgba(40,25,19,0.76))]
              p-4
              text-[#fffaf4]
              shadow-[0_18px_55px_rgba(28,15,9,0.38),inset_0_1px_0_rgba(255,255,255,0.26),inset_0_-1px_0_rgba(255,255,255,0.07)]
              backdrop-blur-[26px]
              backdrop-saturate-[1.55]
              before:pointer-events-none
              before:absolute
              before:inset-[1px]
              before:rounded-[19px]
              before:bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.035)_44%,rgba(255,255,255,0.075))]
              before:content-['']
              after:pointer-events-none
              after:absolute
              after:left-5
              after:right-5
              after:top-0
              after:h-px
              after:bg-gradient-to-r
              after:from-transparent
              after:via-white/70
              after:to-transparent
              after:content-['']
            "
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết nhanh phòng ${room.room_code || ""}`}
          >
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    P. {room.room_code || "-"}
                  </p>

                  <p className="mt-1 text-xs font-medium text-white/60">
                    {room.room_type || "Chưa phân loại"}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black shadow-sm ${badge}`}
                >
                  {status}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-[98px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                <QuickRow
                  label="Giá phòng"
                  value={
                    room.price == null
                      ? "Chưa cập nhật"
                      : `${Number(room.price).toLocaleString("vi-VN")}đ`
                  }
                />

                <dt className="font-semibold text-white/55">
                  Hợp đồng thuê
                </dt>

                <dd className="min-w-0 break-words font-bold text-white">
                  {room.contract?.id ? (
                    <Link
                      data-interactive="true"
                      href={`/owner/contracts/${room.contract.id}`}
                      className="inline-flex items-center gap-1 text-[#f2bd88] underline decoration-white/25 underline-offset-2 transition hover:text-[#ffd8b1] hover:decoration-[#ffd8b1]"
                    >
                      {representative?.full_name || "Xem hợp đồng"}
                      <ExternalLink size={11} />
                    </Link>
                  ) : (
                    <span className="font-semibold text-white/45">
                      Chưa có hợp đồng thuê
                    </span>
                  )}
                </dd>

                <QuickRow
                  label="Số điện thoại"
                  value={representative?.phone || "Chưa cập nhật"}
                  icon={<Phone size={12} />}
                />

                <QuickRow
                  label="Ngày check-in"
                  value={displayDate(room.contract?.start_date)}
                  icon={<CalendarDays size={12} />}
                />

                <QuickRow
                  label="Ngày check-out"
                  value={displayDate(room.contract?.end_date)}
                  icon={<CalendarDays size={12} />}
                />
              </dl>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-3">
                <Link
                  data-interactive="true"
                  href={`/owner/rooms/${room.id}`}
                  className="
                    inline-flex min-h-10 items-center justify-center gap-1
                    rounded-xl
                    border border-white/20
                    bg-white/10
                    px-2
                    text-[10px] font-bold text-white
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]
                    backdrop-blur-lg
                    transition
                    hover:bg-white/20
                    active:scale-[0.98]
                  "
                >
                  <ExternalLink size={13} />
                  Chi tiết
                </Link>

                <Link
                  data-interactive="true"
                  href={`/owner/rooms/${room.id}/edit`}
                  className="
                    inline-flex min-h-10 items-center justify-center gap-1
                    rounded-xl
                    border border-[#ffc28a]/30
                    bg-[#b67845]/70
                    px-2
                    text-[10px] font-bold text-white
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]
                    backdrop-blur-lg
                    transition
                    hover:bg-[#c88954]/85
                    active:scale-[0.98]
                  "
                >
                  <Edit3 size={13} />
                  Chỉnh sửa
                </Link>
              </div>
            </div>
          </section>,
          document.body
        )
      : null;

  return (
    <div className="relative min-w-0">
      <article
        ref={cardRef}
        style={{ minHeight: height }}
        className={`relative rounded-xl border shadow-sm transition ${
          palette
        } ${resizeMode ? "ring-2 ring-[#744722]/35" : ""}`}
      >
        <button
          type="button"
          onClick={() => {
            if (!resizeMode) onToggle();
          }}
          aria-expanded={expanded}
          className="flex h-full w-full min-w-0 flex-col items-start justify-center px-3 py-3 pr-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#744722] focus-visible:ring-offset-2"
        >
          <strong className="block max-w-full truncate text-sm font-black">
            P. {room.room_code || "-"}
          </strong>

          <span className="mt-1 block max-w-full truncate text-[11px] font-semibold opacity-70">
            {room.room_type || "Chưa phân loại"}
          </span>
        </button>

        {resizeMode ? (
          <div
            data-owner-floating="true"
            className="
              absolute left-0 top-[calc(100%+6px)] z-30
              w-[min(230px,calc(100vw-40px))]
              rounded-xl
              border border-white/20
              bg-[linear-gradient(145deg,rgba(91,66,52,0.68),rgba(45,29,21,0.78))]
              p-2
              text-[10px] text-[#fff8ef]
              shadow-[0_18px_45px_rgba(37,20,10,0.42),inset_0_1px_0_rgba(255,255,255,0.18)]
              backdrop-blur-[22px]
              backdrop-saturate-150
            "
          >
            <div className="grid grid-cols-[42px_1fr_1fr] items-center gap-1.5">
              <span className="font-bold text-white/75">Ngang</span>

              <ResizeButton
                label="Giảm chiều ngang"
                onClick={() => onResize("width", -20)}
              >
                −
              </ResizeButton>

              <ResizeButton
                label="Tăng chiều ngang"
                onClick={() => onResize("width", 20)}
              >
                +
              </ResizeButton>

              <span className="font-bold text-white/75">Dọc</span>

              <ResizeButton
                label="Giảm chiều dọc"
                onClick={() => onResize("height", -16)}
              >
                −
              </ResizeButton>

              <ResizeButton
                label="Tăng chiều dọc"
                onClick={() => onResize("height", 16)}
              >
                +
              </ResizeButton>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
              <span className="tabular-nums text-white/60">
                {width} × {height}px
              </span>

              <button
                type="button"
                onClick={onResizeDone}
                className="h-8 rounded-lg border border-white/15 bg-[#b67845]/80 px-3 font-bold text-white shadow-sm backdrop-blur-lg transition hover:bg-[#c88954] active:scale-95"
              >
                Xong
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          data-interactive="true"
          aria-label={`Kéo để đổi vị trí phòng ${room.room_code || ""}`}
          title="Kéo để đổi vị trí"
          disabled={resizeMode}
          onPointerDown={onDragHandlePointerDown}
          className="absolute right-1.5 top-1.5 grid h-8 w-8 touch-none place-items-center rounded-lg text-current opacity-55 transition hover:bg-white/60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[#744722] disabled:cursor-not-allowed disabled:opacity-25"
        >
          <GripVertical size={16} />
        </button>
      </article>

      {detailModal}
    </div>
  );
}

function ResizeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-8 rounded-lg border border-white/15 bg-white/10 font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-lg transition hover:bg-white/20 active:scale-95"
    >
      {children}
    </button>
  );
}

function QuickRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-semibold text-white/55">{label}</dt>

      <dd className="flex min-w-0 items-center gap-1.5 break-words font-bold text-white">
        {icon ? (
          <span className="shrink-0 text-[#e8ad76]">{icon}</span>
        ) : null}

        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </>
  );
}
