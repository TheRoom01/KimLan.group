import { NextRequest } from "next/server";

export const runtime = "nodejs";

function isAllowedR2Url(url: URL) {
  const host = url.hostname.toLowerCase();

  // Chỉ cho phép R2 public URL của bạn
  return (
    host.endsWith(".r2.dev") ||
    host === "r2.dev"
  );
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url")?.trim();

  if (!target) {
    return new Response("Missing url", { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!isAllowedR2Url(url)) {
    return new Response("Forbidden url", { status: 403 });
  }

  const upstream = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}