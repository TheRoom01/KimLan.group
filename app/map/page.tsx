import type { Metadata } from "next";
import MapSearchClient from "@/components/map/MapSearchClient";

export const metadata: Metadata = {
  title: "Tìm phòng trên bản đồ",
  description: "Tìm căn hộ dịch vụ và phòng cho thuê theo khu vực, địa điểm hoặc vị trí hiện tại.",
};

export default function MapPage() {
  return (
    <>
      {process.env.NODE_ENV !== "production" ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              const key = "kimlan-map-dev-cache-reset-v2";
              if (sessionStorage.getItem(key)) return;
              Promise.all([
                "serviceWorker" in navigator
                  ? navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister())))
                  : Promise.resolve([]),
                "caches" in window
                  ? caches.keys().then((items) => Promise.all(items.filter((item) => item.startsWith("kimlan-pwa-")).map((item) => caches.delete(item))))
                  : Promise.resolve([]),
              ]).then((results) => {
                sessionStorage.setItem(key, "1");
                if (results.some((items) => items.length > 0)) location.reload();
              });
            })();`,
          }}
        />
      ) : null}
      <MapSearchClient />
    </>
  );
}
