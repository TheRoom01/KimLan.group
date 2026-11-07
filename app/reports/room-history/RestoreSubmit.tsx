"use client";

import { useFormStatus } from "react-dom";

export default function RestoreSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-[#744722] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Đang khôi phục…" : "Xác nhận khôi phục"}
    </button>
  );
}
