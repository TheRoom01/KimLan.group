"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import TenantCard, { type TenantCardData } from "@/components/owner/TenantCard";

export default function TenantSearchList({ tenants }: { tenants: TenantCardData[] }) {
  const [query, setQuery] = useState("");
  const filteredTenants = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const queryDigits = normalizePhoneSearch(query);
    if (!normalizedQuery && !queryDigits) return tenants;

    return tenants.filter((item) => {
      const name = normalizeSearchText(item.tenant?.full_name);
      const phone = normalizePhoneSearch(item.tenant?.phone);
      return Boolean(normalizedQuery && name.includes(normalizedQuery)) || Boolean(queryDigits && phone.includes(queryDigits));
    });
  }, [query, tenants]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#956b45]/25 bg-[#fff9ef] p-3 shadow-[0_10px_28px_rgba(92,61,34,0.06)] sm:p-4">
        <label className="relative block">
          <span className="sr-only">Tìm khách thuê theo họ tên hoặc số điện thoại</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b6b50]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo họ tên hoặc số điện thoại..."
            className="h-12 w-full rounded-xl !border !border-[#9a704b]/40 !bg-white pl-11 pr-14 text-sm text-[#4d3422] outline-none placeholder:text-[#a28368] focus:!border-[#744722] focus:!ring-2 focus:!ring-[#aa825d]/20 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm kiếm" title="Xóa tìm kiếm" className="absolute right-1 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-[#744722] transition hover:bg-[#f4e4cf] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#744722]">
              <X size={19} strokeWidth={2.4} />
            </button>
          ) : null}
        </label>
        {query ? <p className="mt-2 px-1 text-xs text-[#80634a]">Tìm thấy {filteredTenants.length} khách thuê</p> : null}
      </div>

      {filteredTenants.length ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {filteredTenants.map((item) => item.tenant ? <TenantCard key={item.tenant.id} item={item} /> : null)}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-[#a9825f]/35 bg-[#fff9ef] p-8 text-center text-sm text-[#80634a]">
          Không tìm thấy khách thuê phù hợp.
        </div>
      )}
    </div>
  );
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhoneSearch(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
}
