"use client";

import { useEffect } from "react";

let registration: Promise<ServiceWorkerRegistration> | undefined;
export function registerPwaWorker() {
  const script = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?push-only=1";
  return registration ??= navigator.serviceWorker.register(script, {
    scope: "/", updateViaCache: "none",
  }).catch(error => {
    registration = undefined;
    throw error;
  });
}

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) ||
        (process.env.NODE_ENV !== "production" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))) return;

    const register = () => { void registerPwaWorker().catch(() => {}); };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
