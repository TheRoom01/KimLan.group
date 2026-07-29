export type PropertyAddressLike = {
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
  full_address?: string | null;
  display_address?: string | null;
  code?: string | null;
  name?: string | null;
};

export function propertyDisplayAddress(property?: PropertyAddressLike | null) {
  if (!property) return "Chưa có địa chỉ";
  const composed = [property.house_number, property.address, property.ward, property.district, property.city]
    .map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
  return composed || String(property.full_address ?? property.display_address ?? property.name ?? property.code ?? "Chưa có địa chỉ").trim();
}
