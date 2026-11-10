export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.pro");

export const defaultShareImage = {
  url: new URL("/the-room-og.jpg", siteUrl).href,
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "THE ROOM SG",
};
