"use client";

import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { registerPwaWorker } from "./PwaRegister";
import "./pushPreferences.css";

const SETTINGS_EVENT = "the-room:push-settings";
export function openPushPreferences() {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

type Config = { publicKey: string | null; testEnabled: boolean; accountId: string };
const LATER = 7 * 86400_000;
const unavailable = "Thông báo chưa được cấu hình trên website này.";

function environment() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (appleMobile && !matchMedia("(display-mode: standalone)").matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone) return "install";
  return isSecureContext && "serviceWorker" in navigator && "Notification" in window &&
    "PushManager" in window ? "supported" : "unsupported";
}

async function request(action: string, accountId: string, subscription?: PushSubscription, signal?: AbortSignal) {
  return fetch("/api/push", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, accountId, subscription }), signal,
  });
}

async function activeWorker() {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await registerPwaWorker();
        const ready = await navigator.serviceWorker.ready;
        controller.signal.throwIfAborted();
        const active = ready.active;
        if (active && active.state !== "activated") {
          await new Promise<void>((resolve, reject) => {
            const checkState = () => {
              if (active.state === "activated") resolve();
              else if (active.state === "redundant") reject(new Error("Service worker đã được thay thế."));
            };
            active.addEventListener("statechange", checkState, { signal: controller.signal });
            checkState();
          });
        }
        return ready;
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Service worker chưa sẵn sàng.")), 8000); }),
    ]);
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

async function sync(publicKey: string, accountId: string, signal?: AbortSignal) {
  const worker = await activeWorker();
  signal?.throwIfAborted();
  let current = await worker.pushManager.getSubscription();
  const applicationKey = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), value => value.charCodeAt(0));
  const boundKey = current?.options.applicationServerKey;
  if (current && (current.expirationTime !== null && current.expirationTime <= Date.now() ||
      boundKey && (boundKey.byteLength !== applicationKey.length ||
        new Uint8Array(boundKey).some((value, i) => value !== applicationKey[i])))) {
    await current.unsubscribe();
    current = null;
  }
  signal?.throwIfAborted();
  const subscription = current ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey });
  const response = await request("sync", accountId, subscription, signal);
  if (!response.ok) throw new Error("Chưa đồng bộ được thông báo. Vui lòng thử lại.");
  return subscription;
}

export default function PushPreferences({ userId }: { userId: string }) {
  const storageKey = `the-room:push:${userId}`;
  const [view, setView] = useState<"invite" | "settings" | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<ReturnType<typeof environment>>("unsupported");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const pending = useRef<Promise<PushSubscription> | null>(null);

  function syncOnce(key: string, signal?: AbortSignal) {
    return pending.current ??= sync(key, userId, signal).finally(() => { pending.current = null; });
  }

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const kind = environment();
    setSupport(kind);
    let configRequest: Promise<Config | null> | undefined;
    const load = () => configRequest ??= request("config", userId, undefined, signal).then(async response => {
      const next = response.ok ? await response.json() as Config : null;
      if (!next || next.accountId !== userId || signal.aborted) return null;
      setConfig(next);
      return next;
    }).catch(() => null).then(next => {
      if (!next) configRequest = undefined;
      return next;
    });
    const inspect = async (invite: boolean) => {
      if (kind !== "supported") return;
      const value = Notification.permission;
      setPermission(value);
      const preference = localStorage.getItem(storageKey);
      if (preference === "off" || value === "denied") return;
      if (value === "default" && (!invite || Number(preference) > Date.now())) return;
      const next = await load();
      if (!next?.publicKey || signal.aborted) return;
      if (value === "default") {
        setView(current => current ?? "invite");
        return;
      }
      try {
        await syncOnce(next.publicKey, signal);
        if (!signal.aborted) setEnabled(true);
      } catch {
        if (!signal.aborted) setMessage("Chưa đồng bộ được thông báo. Mở cài đặt thông báo để thử lại.");
      }
    };
    const settings = () => {
      setView("settings");
      if (kind === "supported") {
        setPermission(Notification.permission);
        void load();
      }
    };
    const interact = () => {
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
      if (kind === "supported" && Notification.permission === "default") void inspect(true);
    };
    window.addEventListener(SETTINGS_EVENT, settings);
    document.addEventListener("pointerdown", interact);
    document.addEventListener("keydown", interact);
    void inspect(false);
    return () => {
      controller.abort();
      window.removeEventListener(SETTINGS_EVENT, settings);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
    };
  }, [storageKey, userId]);

  async function enable() {
    if (!config?.publicKey || busy || support !== "supported") return;
    setBusy(true);
    setMessage("");
    try {
      const value = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      setPermission(value);
      if (value === "granted") {
        await syncOnce(config.publicKey);
        localStorage.removeItem(storageKey);
        setEnabled(true);
        if (view === "invite") setView(null);
      }
    } catch {
      setMessage("Chưa bật được thông báo trên thiết bị này. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const current = await (await activeWorker()).pushManager.getSubscription();
      if (current) {
        const response = await request("disable", userId, current).catch(() => null);
        const removed = await current.unsubscribe();
        if (!response?.ok && !removed) throw new Error("disable");
      }
      localStorage.setItem(storageKey, "off");
      setEnabled(false);
    } catch {
      setMessage("Chưa tắt được thông báo. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    try {
      const current = await (await activeWorker()).pushManager.getSubscription();
      const response = current && await request("test", userId, current);
      setMessage(response && response.ok ? "Dịch vụ Push đã nhận yêu cầu thử. Hãy kiểm tra thông báo hệ thống."
        : response && response.status === 429 ? "Bạn có thể gửi một lần mỗi phút."
        : "Chưa gửi được thông báo thử. Hãy thử tắt rồi bật lại thông báo.");
    } catch {
      setMessage("Chưa gửi được thông báo thử.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  const invite = view === "invite";
  const guidance = support === "install"
    ? "Trên iPhone hoặc iPad, mở Safari, chọn Chia sẻ → Thêm vào MH chính, rồi mở The Room từ biểu tượng vừa cài."
    : support === "unsupported" ? "Trình duyệt này chưa hỗ trợ Web Push trên trang hiện tại."
    : permission === "denied" ? "Mở cài đặt trang web trong Chrome hoặc Safari, cho phép thông báo rồi tải lại trang."
    : !config?.publicKey ? unavailable : null;

  return (
    <section className="push-preferences" aria-labelledby="push-preferences-title">
      <span className="push-preferences-icon" aria-hidden="true"><Bell size={21} /></span>
      <div className="push-preferences-content">
        <h2 id="push-preferences-title">{invite ? "Bật thông báo The Room" : "Thông báo trên thiết bị này"}</h2>
        <p>{guidance ?? "Nhận thông báo khi có khách hàng cần tư vấn phòng hoặc có thông tin quan trọng về tài khoản."}</p>
        {message && <p role="status">{message}</p>}
        <div className="push-preferences-actions">
          <button type="button" disabled={busy} onClick={() => {
            if (invite) localStorage.setItem(storageKey, String(Date.now() + LATER));
            setView(null);
          }}>{invite ? "Để sau" : "Đóng"}</button>
          {!guidance && <button className="push-preferences-primary" type="button" disabled={busy}
            onClick={() => void (enabled ? disable() : enable())}>{enabled ? "Tắt thông báo" : "Bật thông báo"}</button>}
          {enabled && config?.testEnabled && <button type="button" disabled={busy} onClick={() => void test()}>Gửi thử</button>}
        </div>
      </div>
    </section>
  );
}
