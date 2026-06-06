export async function geocodeAddress(fullAddress: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    console.error("Missing Google Maps API key");
    return null;
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=` +
    encodeURIComponent(fullAddress) +
    `&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    return null;
  }

  const result = data.results[0];
  const components = result.address_components;

  const ward =
    components.find((c: any) =>
      c.types.includes("administrative_area_level_3")
    )?.long_name || "";

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    ward,
  };
}