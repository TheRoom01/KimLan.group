export function formatVietnameseWard(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Chỉ bỏ P khi đó thực sự là tiền tố. Giữ nguyên chữ P trong các tên
  // như "Phú Nhuận" hoặc "Phước Long".
  const ward = raw
    .replace(/^P\.\s*/i, "")
    .replace(/^P\s+(?=\S)/i, "")
    .replace(/^P(?=\d)/i, "")
    .trim();

  if (!ward) return null;
  return /^\d/.test(ward) ? `P.${ward}` : `P. ${ward}`;
}
