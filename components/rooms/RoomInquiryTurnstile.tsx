"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type RoomInquiryTurnstileHandle = {
  execute: () => Promise<string>;
  reset: () => void;
};

const TOKEN_TIMEOUT_MS = 90_000;
const SCRIPT_TIMEOUT_MS = 15_000;
const ACTION = "room_consult_request";

const RoomInquiryTurnstile = forwardRef<RoomInquiryTurnstileHandle>(function RoomInquiryTurnstile(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    onAbort: () => void;
  } | null>(null);

  const settlePending = useCallback((error?: Error, token?: string) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    pending.signal.removeEventListener("abort", pending.onAbort);
    if (error) pending.reject(error);
    else if (token) pending.resolve(token);
    else pending.reject(new Error("Cloudflare không trả về mã xác minh. Vui lòng thử lại."));
  }, []);

  const reset = useCallback(() => {
    settlePending(new Error("Yêu cầu xác minh đã được làm mới."));
    const widgetId = widgetIdRef.current;
    if (widgetId && window.turnstile) {
      try {
        window.turnstile.reset(widgetId);
      } catch {}
    }
  }, [settlePending]);

  const execute = useCallback(() => {
    const widgetId = widgetIdRef.current;
    const turnstile = window.turnstile;
    if (!widgetId || !turnstile) {
      return Promise.reject(new Error("Xác minh bảo mật chưa sẵn sàng. Vui lòng thử lại."));
    }
    if (pendingRef.current) {
      return Promise.reject(new Error("Đang xác minh yêu cầu. Vui lòng chờ."));
    }

    turnstile.reset(widgetId);
    return new Promise<string>((resolve, reject) => {
      const signal = AbortSignal.timeout(TOKEN_TIMEOUT_MS);
      const onAbort = () => settlePending(new Error("Xác minh mất quá nhiều thời gian. Vui lòng thử lại."));
      pendingRef.current = { resolve, reject, signal, onAbort };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        turnstile.execute(widgetId);
      } catch {
        settlePending(new Error("Không thể bắt đầu xác minh. Vui lòng thử lại."));
      }
    });
  }, [settlePending]);

  useImperativeHandle(ref, () => ({ execute, reset }), [execute, reset]);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
      (process.env.NODE_ENV !== "production" ? "1x00000000000000000000AA" : undefined);
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    let script: HTMLScriptElement | null = null;
    let scriptTimeout: AbortSignal | null = null;
    let onScriptTimeout: (() => void) | null = null;

    const cleanupScriptWait = () => {
      if (scriptTimeout && onScriptTimeout) {
        scriptTimeout.removeEventListener("abort", onScriptTimeout);
      }
      scriptTimeout = null;
      onScriptTimeout = null;
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanupScriptWait();
      if (cancelled) return;
      const api = window.turnstile;
      const container = containerRef.current;
      if (!api || !container) {
        settlePending(new Error("Không khởi tạo được dịch vụ xác minh. Vui lòng thử lại."));
        return;
      }
      if (widgetIdRef.current) return;
      try {
        widgetIdRef.current = api.render(container, {
          sitekey: siteKey,
          action: ACTION,
          execution: "execute",
          appearance: "interaction-only",
          retry: "never",
          theme: "dark",
          callback: (token) => settlePending(undefined, token),
          "expired-callback": () => settlePending(new Error("Mã xác minh đã hết hạn. Vui lòng thử lại.")),
          "error-callback": () => settlePending(new Error("Cloudflare không thể xác minh lúc này. Vui lòng thử lại.")),
          "timeout-callback": () => settlePending(new Error("Xác minh đã hết thời gian. Vui lòng thử lại.")),
        });
      } catch {
        settlePending(new Error("Không thể khởi tạo xác minh bảo mật."));
      }
    };

    const onError = () => {
      cleanupScriptWait();
      if (!cancelled) settlePending(new Error("Không tải được dịch vụ xác minh. Vui lòng kiểm tra kết nối và thử lại."));
    };

    const existingApi = window.turnstile;
    if (existingApi) {
      onLoad();
    } else {
      script = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      );
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.roomInquiryTurnstile = "true";
      }
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      scriptTimeout = AbortSignal.timeout(SCRIPT_TIMEOUT_MS);
      onScriptTimeout = onError;
      scriptTimeout.addEventListener("abort", onScriptTimeout, { once: true });
      if (!script.isConnected) document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      cleanupScriptWait();
      settlePending(new Error("Form đã đóng."));
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [settlePending]);

  return <div ref={containerRef} aria-live="polite" />;
});

export default RoomInquiryTurnstile;
