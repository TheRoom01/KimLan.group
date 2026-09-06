"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackVisitorEvent } from "@/lib/analytics/client";

export default function VisitorTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/" || pathname === "/map" || pathname?.startsWith("/rooms/")) {
      trackVisitorEvent("page_view");
    }
  }, [pathname]);
  return null;
}
