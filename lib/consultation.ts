export const REFERRAL_SOURCES = ["Facebook", "TikTok", "Threads", "Người quen giới thiệu", "Khác"] as const;
export type ConsultationKind = "room_consultation" | "general_consultation";

export function vietnamesePhone(value: string): string | null {
  if (!/^\+?[\d().\s-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("84")) digits = `0${digits.slice(2)}`;
  return /^(?:0[35789]\d{8}|02\d{9})$/.test(digits) ? digits : null;
}
