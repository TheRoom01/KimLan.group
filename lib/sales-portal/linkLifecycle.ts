export const REVOKED_LINK_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export function revokedLinkCutoff(now = Date.now()) {
  return new Date(now - REVOKED_LINK_RETENTION_MS).toISOString();
}

export function isSalesLinkVisible(link: { revoked_at: string | null }, now = Date.now()) {
  return !link.revoked_at || Date.parse(link.revoked_at) > now - REVOKED_LINK_RETENTION_MS;
}
