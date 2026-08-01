export type GoogleMapsAddress = {
  house_number?: unknown;
  address?: unknown;
  ward?: unknown;
  district?: unknown;
  city?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function buildGoogleMapsSearchUrl(address: GoogleMapsAddress) {
  const street = [text(address.house_number), text(address.address)]
    .filter(Boolean)
    .join(" ");
  const query = [
    street,
    text(address.ward),
    text(address.district),
    text(address.city),
  ]
    .filter(Boolean)
    .join(", ");

  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}
