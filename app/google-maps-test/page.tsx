import type { Metadata } from "next";

import GoogleMapsTestClient from "./GoogleMapsTestClient";

export const metadata: Metadata = {
  title: "Google Maps Platform Test",
  robots: { index: false, follow: false },
};

export default function GoogleMapsTestPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return <GoogleMapsTestClient apiKey={apiKey} />;
}
