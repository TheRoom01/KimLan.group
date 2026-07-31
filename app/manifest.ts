import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KimLan Group - The Room",
    short_name: "KimLan",
    description:
      "Tìm kiếm và quản lý tòa nhà, phòng, khách thuê và hợp đồng.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fff9ef",
    theme_color: "#744722",
    categories: ["business", "finance", "lifestyle"],
    lang: "vi",
    dir: "ltr",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Tòa nhà",
        short_name: "Tòa nhà",
        url: "/owner/properties",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Phòng",
        short_name: "Phòng",
        url: "/owner/rooms",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Hợp đồng",
        short_name: "Hợp đồng",
        url: "/owner/contracts",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
