"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackHomePageView } from "@/lib/analytics/client";

export default function VisitorTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/") void trackHomePageView();
  }, [pathname]);
  return null;
}
