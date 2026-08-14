const DEFAULT_OWNER_EMAIL_FROM = "KimLan Group <support@canhodichvu.pro>";

export function getOwnerEmailFrom() {
  const configured = process.env.OWNER_EMAIL_FROM?.trim();
  if (!configured) return DEFAULT_OWNER_EMAIL_FROM;

  // Tolerate values pasted into Vercel with surrounding quotes.
  return configured.replace(/^(["'])(.*)\1$/, "$2").trim() || DEFAULT_OWNER_EMAIL_FROM;
}
