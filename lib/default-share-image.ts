export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.canhodichvu.pro");
if (siteUrl.hostname === "canhodichvu.pro") siteUrl.hostname = "www.canhodichvu.pro";

export const defaultShareImage = {
  url: new URL("/the-room-og.jpg?v=2", "https://www.canhodichvu.pro").href,
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "THE ROOM SG",
};

export const homeOpenGraph = {
  type: "website" as const,
  locale: "vi_VN",
  url: new URL("/", "https://www.canhodichvu.pro").href,
  siteName: "The Room SG",
  title: "THE ROOM SG",
  description: "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",
  images: [defaultShareImage],
};
