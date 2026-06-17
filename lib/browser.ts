// app/lib/browser.ts

export function getBrowserContext() {
  if (typeof navigator === "undefined") return null;

  const ua = navigator.userAgent.toLowerCase();

  return {
    isAndroid: /android/.test(ua),
    isIOS: /iphone|ipad|ipod/.test(ua),

    isZalo: ua.includes("zalo"),
    isMessenger: ua.includes("fbav") || ua.includes("messenger"),
    isFacebook: ua.includes("fban") || ua.includes("fbios"),

    isInApp:
      ua.includes("zalo") ||
      ua.includes("fbav") ||
      ua.includes("messenger") ||
      ua.includes("fban"),
  };
}

export function openExternalBrowser(url: string) {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent.toLowerCase();

  const isAndroid = /android/.test(ua);
  const isIOS = /iphone|ipad|ipod/.test(ua);

  // Android → thử intent mở Chrome
  if (isAndroid) {
    const cleanUrl = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${cleanUrl}#Intent;scheme=https;end`;
    return;
  }

  // iOS → không ép được → copy link
  if (isIOS) {
    navigator.clipboard.writeText(url);
    alert("Đã copy link. Hãy mở Safari và dán link.");
    return;
  }

  // desktop fallback
  window.open(url, "_blank");
}