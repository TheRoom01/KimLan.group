"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PageLoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import {
  ownerExperienceEvents,
  type OwnerBackgroundTask,
  type OwnerToastTone,
} from "@/lib/owner/clientExperience";

type ToastState = { message: string; tone: OwnerToastTone } | null;

export default function OwnerExperience() {
  const pathname = usePathname();
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | null>(null);
  const navigationTimer = useRef<number | null>(null);

  useEffect(() => {
    setNavigating(false);
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
  }, [pathname]);

  useEffect(() => {
    function showNavigation() {
      setNavigating(true);
      if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
      navigationTimer.current = window.setTimeout(() => setNavigating(false), 12000);
    }

    function hideNavigation() {
      setNavigating(false);
      if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    }

    function showToast(event: Event) {
      const detail = (event as CustomEvent<{ message: string; tone: OwnerToastTone }>).detail;
      setToast(detail);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), detail.tone === "error" ? 5200 : 3000);
    }

    function runTask(event: Event) {
      const detail = (event as CustomEvent<OwnerBackgroundTask>).detail;
      void detail.task().then(() => {
        router.refresh();
        showToast(new CustomEvent("task-success", { detail: { message: detail.successMessage, tone: "success" } }));
      }).catch((error: unknown) => {
        const fallback = detail.errorMessage || "Không thể lưu thay đổi";
        const message = error instanceof Error ? error.message : fallback;
        showToast(new CustomEvent("task-error", { detail: { message, tone: "error" } }));
      });
    }

    function interceptOwnerLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || !target.pathname.startsWith("/owner")) return;
      if (target.pathname === window.location.pathname) return;
      showNavigation();
    }

    window.addEventListener(ownerExperienceEvents.task, runTask);
    window.addEventListener(ownerExperienceEvents.toast, showToast);
    window.addEventListener(ownerExperienceEvents.navigationStart, showNavigation);
    window.addEventListener(ownerExperienceEvents.navigationCancel, hideNavigation);
    document.addEventListener("click", interceptOwnerLink, true);
    return () => {
      window.removeEventListener(ownerExperienceEvents.task, runTask);
      window.removeEventListener(ownerExperienceEvents.toast, showToast);
      window.removeEventListener(ownerExperienceEvents.navigationStart, showNavigation);
      window.removeEventListener(ownerExperienceEvents.navigationCancel, hideNavigation);
      document.removeEventListener("click", interceptOwnerLink, true);
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    };
  }, [router]);

  return <>
    {navigating ? <div className="fixed inset-0 z-[230] overflow-hidden bg-[#f4eadc]/95 pt-16 backdrop-blur-[2px]" aria-live="polite"><PageLoadingSkeleton compact /></div> : null}
    {toast ? <div role={toast.tone === "error" ? "alert" : "status"} aria-live="polite" className={`fixed left-1/2 top-1/2 z-[500] flex max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-2xl animate-[owner-toast-in_.2s_ease-out] ${toast.tone === "error" ? "bg-red-700" : "bg-emerald-700"}`}>
      {toast.tone === "error" ? <XCircle size={18} /> : <CheckCircle2 size={18} />}{toast.message}
    </div> : null}
  </>;
}
