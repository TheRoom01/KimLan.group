import { createHash, randomBytes } from "node:crypto";

export function createSalesPortalToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSalesPortalToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isSalesPortalToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,80}$/.test(value);
}
