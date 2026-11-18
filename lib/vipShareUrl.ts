export function buildVipShareUrl(origin: string, token: string): string {
  const url = new URL("/", origin);
  // Share the final production host directly, without the apex redirect.
  if (url.hostname === "canhodichvu.pro") {
    url.hostname = "www.canhodichvu.pro";
    url.protocol = "https:";
  }
  url.searchParams.set("vip", token);
  // Stable version lets existing links retry previews cached before the OG fix.
  url.searchParams.set("preview", "2");
  return url.href;
}
