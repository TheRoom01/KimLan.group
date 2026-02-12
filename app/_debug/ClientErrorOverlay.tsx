'use client';

import React, { useEffect, useMemo, useState } from 'react';

type ErrPayload = {
  kind: 'error' | 'unhandledrejection';
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  time: string;
  href: string;
  ua: string;
};

const KEY = '__client_err__';

function safeStringify(x: any) {
  try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); }
}

function readLast(): ErrPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ErrPayload) : null;
  } catch {
    return null;
  }
}

function writeLast(p: ErrPayload) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export default function ClientErrorOverlay() {
  const enabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      return false;
    }
  }, []);

  const [payload, setPayload] = useState<ErrPayload | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // show previous crash (if any)
    const prev = readLast();
    if (prev) setPayload(prev);

    const onError = (event: ErrorEvent) => {
      const p: ErrPayload = {
        kind: 'error',
        message: event.message || 'Unknown error',
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: (event.error && (event.error.stack || String(event.error))) || undefined,
        time: new Date().toISOString(),
        href: window.location.href,
        ua: navigator.userAgent,
      };
      writeLast(p);
      setPayload(p);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      const p: ErrPayload = {
        kind: 'unhandledrejection',
        message: safeStringify(reason?.message ?? reason ?? 'Unhandled rejection'),
        stack: safeStringify(reason?.stack ?? reason ?? ''),
        time: new Date().toISOString(),
        href: window.location.href,
        ua: navigator.userAgent,
      };
      writeLast(p);
      setPayload(p);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [enabled]);

  if (!enabled || !payload) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2147483647,
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      padding: 12,
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.35,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Client Error Captured</div>
        <button
          onClick={() => { try { sessionStorage.removeItem(KEY); } catch {} setPayload(null); }}
          style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8 }}
        >
          Clear
        </button>
      </div>

      <div><b>kind:</b> {payload.kind}</div>
      <div><b>time:</b> {payload.time}</div>
      <div><b>message:</b> {payload.message}</div>
      {payload.source ? <div><b>source:</b> {payload.source}:{payload.lineno}:{payload.colno}</div> : null}
      <div style={{ marginTop: 8 }}><b>href:</b> {payload.href}</div>
      <div style={{ marginTop: 8 }}><b>ua:</b> {payload.ua}</div>

      {payload.stack ? (
        <>
          <div style={{ marginTop: 10, fontWeight: 700 }}>stack</div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>
            {payload.stack}
          </pre>
        </>
      ) : null}

      <div style={{ marginTop: 10, opacity: 0.85 }}>
        Tip: mở đúng link có <b>?debug=1</b>, thao tác nhanh để tái hiện lỗi, chụp màn hình overlay này gửi lại.
      </div>
    </div>
  );
}
