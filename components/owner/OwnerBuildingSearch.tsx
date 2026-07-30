"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function OwnerBuildingSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("building_search") ?? "";
  const [value, setValue] = useState(current);

  function submit() {
    const params = new URLSearchParams(pathname === "/owner" ? searchParams : undefined);
    if (value.trim()) params.set("building_search", value.trim());
    else params.delete("building_search");
    router.push(`/owner${params.size ? `?${params.toString()}` : ""}`);
  }

  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="relative min-w-[220px] lg:min-w-[280px]">
    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#f0d5b2]" />
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Tìm tòa nhà theo địa chỉ..." aria-label="Tìm kiếm tòa nhà" className="h-10 w-full rounded-xl border border-[#f3d9b4]/25 bg-[#5d361c]/45 pl-10 pr-9 text-sm text-[#fff8eb] outline-none placeholder:text-[#d9bb98] focus:border-[#f2d2aa]/60 focus:bg-[#5d361c]/70" />
    {value ? <button type="button" onClick={() => { setValue(""); router.push("/owner"); }} aria-label="Xóa tìm kiếm" className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#f0d5b2] hover:bg-white/10"><X size={14} /></button> : null}
  </form>;
}
