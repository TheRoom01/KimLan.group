"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const VIP_ACCESS_KEY = "VIP_ACCESS_V1";
const VIP_PARAM_KEY = "vip";
const ANONYMOUS_VIEW_TIME_MS = 60_000;
const ANONYMOUS_VIEW_DEADLINE_KEY = "MAP_ANONYMOUS_VIEW_DEADLINE_V1";

type StoredVipAccess = {
  expiresAt?: number;
  creatorAdminPhone?: string | null;
  creatorAdminName?: string | null;
  tokenHash?: string | null;
};

export function useAnonymousListingGate() {
  const pathname = usePathname();
  const lockTimerRef = useRef<number | null>(null);
  const vipTimerRef = useRef<number | null>(null);
  const [anonymousDeadline, setAnonymousDeadline] = useState<number | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [vipResolved, setVipResolved] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasVipAccess, setHasVipAccess] = useState(false);
  const [isAnonLocked, setIsAnonLocked] = useState(false);

  useEffect(() => {
    try {
      const storedDeadline = Number(localStorage.getItem(ANONYMOUS_VIEW_DEADLINE_KEY) ?? 0);
      if (Number.isFinite(storedDeadline) && storedDeadline > 0) {
        setAnonymousDeadline(storedDeadline);
        return;
      }

      const nextDeadline = Date.now() + ANONYMOUS_VIEW_TIME_MS;
      localStorage.setItem(ANONYMOUS_VIEW_DEADLINE_KEY, String(nextDeadline));
      setAnonymousDeadline(nextDeadline);
    } catch {
      setAnonymousDeadline(Date.now() + ANONYMOUS_VIEW_TIME_MS);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(data.user?.id));
      setAuthResolved(true);
    }).catch(() => {
      if (!mounted) return;
      setIsLoggedIn(false);
      setAuthResolved(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(session?.user?.id));
      setAuthResolved(true);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const clearVipTimer = () => {
      if (vipTimerRef.current !== null) {
        window.clearTimeout(vipTimerRef.current);
        vipTimerRef.current = null;
      }
    };

    const clearVipAccess = () => {
      if (!cancelled) setHasVipAccess(false);
    };

    const applyStoredVip = () => {
      try {
        const raw = localStorage.getItem(VIP_ACCESS_KEY);
        if (!raw) {
          clearVipAccess();
          return;
        }

        const parsed = JSON.parse(raw) as StoredVipAccess;
        const expiresAt = Number(parsed.expiresAt ?? 0);
        if (!expiresAt || Date.now() >= expiresAt) {
          localStorage.removeItem(VIP_ACCESS_KEY);
          clearVipAccess();
          return;
        }

        if (cancelled) return;
        setHasVipAccess(true);
        clearVipTimer();
        vipTimerRef.current = window.setTimeout(() => {
          localStorage.removeItem(VIP_ACCESS_KEY);
          clearVipAccess();
        }, Math.min(expiresAt - Date.now(), 2_147_000_000));
      } catch {
        localStorage.removeItem(VIP_ACCESS_KEY);
        clearVipAccess();
      }
    };

    const validateVipAccess = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get(VIP_PARAM_KEY)?.trim();
      applyStoredVip();

      if (!token) {
        if (!cancelled) setVipResolved(true);
        return;
      }

      try {
        const response = await fetch("/api/vip/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await response.json().catch(() => null);

        if (!response.ok || !body?.valid || !body?.expiresAt) {
          localStorage.removeItem(VIP_ACCESS_KEY);
          clearVipAccess();
          return;
        }

        const expiresAt = new Date(body.expiresAt).getTime();
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          localStorage.removeItem(VIP_ACCESS_KEY);
          clearVipAccess();
          return;
        }

        localStorage.setItem(VIP_ACCESS_KEY, JSON.stringify({
          expiresAt,
          savedAt: Date.now(),
          creatorAdminPhone: String(body.creatorAdminPhone ?? "").trim() || null,
          creatorAdminName: String(body.creatorAdminName ?? "").trim() || null,
          tokenHash: String(body.tokenHash ?? "").trim() || null,
        }));

        if (cancelled) return;
        setHasVipAccess(true);
        clearVipTimer();
        vipTimerRef.current = window.setTimeout(() => {
          localStorage.removeItem(VIP_ACCESS_KEY);
          clearVipAccess();
        }, Math.min(expiresAt - Date.now(), 2_147_000_000));
      } catch {
        applyStoredVip();
      } finally {
        const next = new URLSearchParams(window.location.search);
        next.delete(VIP_PARAM_KEY);
        const query = next.toString();
        window.history.replaceState(window.history.state, "", query ? `${pathname}?${query}` : pathname);
        if (!cancelled) setVipResolved(true);
      }
    };

    void validateVipAccess();

    return () => {
      cancelled = true;
      clearVipTimer();
    };
  }, [pathname]);

  useEffect(() => {
    if (isLoggedIn || hasVipAccess) {
      setIsAnonLocked(false);
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      return;
    }

    if (!authResolved || !vipResolved || anonymousDeadline === null) return;

    if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    const remainingTime = anonymousDeadline - Date.now();
    if (remainingTime <= 0) {
      setIsAnonLocked(true);
      return;
    }

    setIsAnonLocked(false);
    lockTimerRef.current = window.setTimeout(() => setIsAnonLocked(true), remainingTime);

    return () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    };
  }, [anonymousDeadline, authResolved, hasVipAccess, isLoggedIn, vipResolved]);

  const isAccessPending = !authResolved || !vipResolved || anonymousDeadline === null;
  const persistedLockApplies = !isLoggedIn
    && !hasVipAccess
    && !isAccessPending
    && Date.now() >= anonymousDeadline;

  return {
    hasVipAccess,
    isAccessPending,
    isAnonLocked: isAnonLocked || persistedLockApplies,
  };
}
