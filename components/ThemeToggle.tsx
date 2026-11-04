"use client";

import { useSyncExternalStore } from "react";
import { PUBLIC_THEME_KEY } from "@/lib/publicTheme";

const eventName = "room-theme-change";
function subscribe(update: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== PUBLIC_THEME_KEY && event.key !== null) return;
    document.documentElement.dataset.roomTheme = event.newValue === "light" ? "light" : "dark";
    update();
  };
  window.addEventListener(eventName, update);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(eventName, update);
    window.removeEventListener("storage", sync);
  };
}

export default function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, () => document.documentElement.dataset.roomTheme === "light", () => false);
  return (
    <button type="button" role="switch" aria-label="Giao diện sáng" aria-checked={light} className="room-theme-toggle"
      onClick={() => {
        const theme = document.documentElement.dataset.roomTheme === "light" ? "dark" : "light";
        document.documentElement.dataset.roomTheme = theme;
        try { localStorage.setItem(PUBLIC_THEME_KEY, theme); } catch { /* Theme still works without storage. */ }
        window.dispatchEvent(new Event(eventName));
      }}>
      <span className="room-theme-track" aria-hidden="true"><span className="room-theme-sun">☀</span><span className="room-theme-moon">☾</span></span>
    </button>
  );
}
