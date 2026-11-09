const COOKIE_NAME = "trsg_anon_home";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const ANONYMOUS_HOME_COOKIE = COOKIE_NAME;
export const ANONYMOUS_HOME_COOKIE_MAX_AGE = COOKIE_MAX_AGE_SECONDS;
export const ANONYMOUS_HOME_LIMIT_MS = 60_000;

type SessionToken = {
  id: string;
  startedAt: number;
};

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signingSecret() {
  const secret = process.env.ANON_HOME_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error("Missing ANON_HOME_SESSION_SECRET");
  return secret;
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

export async function createAnonymousHomeSessionToken(now = Date.now()) {
  const payload = `${crypto.randomUUID()}.${Math.floor(now)}`;
  return `${payload}.${await signature(payload)}`;
}

export async function verifyAnonymousHomeSessionToken(value: string | null | undefined): Promise<SessionToken | null> {
  const parts = String(value ?? "").split(".");
  if (parts.length !== 3) return null;
  const [id, startedAtRaw, suppliedSignature] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const startedAt = Number(startedAtRaw);
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > Date.now() + 5 * 60_000) return null;
  if (Date.now() - startedAt > (COOKIE_MAX_AGE_SECONDS + 300) * 1000) return null;
  const payload = `${id}.${startedAtRaw}`;
  const expected = await signature(payload);
  if (expected.length !== suppliedSignature.length) return null;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ suppliedSignature.charCodeAt(index);
  }
  return difference === 0 ? { id, startedAt } : null;
}
