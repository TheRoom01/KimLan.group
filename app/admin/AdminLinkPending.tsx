"use client";

import { useLinkStatus } from "next/link";

export default function AdminLinkPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-[#704522]/90">
      <span aria-hidden="true" className="h-2 w-1/2 animate-pulse rounded-full bg-[#f3d8b4]" />
      <span className="sr-only">Đang tải trang…</span>
    </span>
  ) : null;
}
