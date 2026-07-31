import crypto from "crypto";

export function getRegistrationClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function hashRegistrationIdentifier(value: string) {
  const secret =
    process.env.REGISTRATION_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "owner-registration-rate-limit";

  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function verifyTurnstileToken(token: string, ip: string) {
  const secret =
    process.env.TURNSTILE_SECRET_KEY ||
    (process.env.NODE_ENV !== "production"
      ? "1x0000000000000000000000000000000AA"
      : undefined);
  if (!secret || !token) return false;

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  });
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
