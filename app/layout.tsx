import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";
import "./public-theme.css";
import { PUBLIC_THEME_BOOTSTRAP } from "@/lib/publicTheme";
import "./room-share-visual-sync.css";
import LazyAuthControls from "@/components/LazyAuthControls";
import ClientErrorOverlay from './_debug/ClientErrorOverlay';
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PwaRegister from "@/components/pwa/PwaRegister";
import { defaultShareImage, siteUrl } from "@/lib/default-share-image";

export const metadata: Metadata = {
  metadataBase: siteUrl,

  title: {
    default: "The Room SG | Căn hộ dịch vụ - Kim Lân Group",
    template: "%s | The Room SG",
  },

  description:
    "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",

  applicationName: "The Room SG",

  keywords: [
    "căn hộ dịch vụ",
    "phòng trọ",
    "thuê phòng",
    "chung cư",
    "kim lân group",
    "the room",
    "the room SG",
    "căn hộ dịch vụ tphcm",
    "phòng trọ tphcm",
    "thuê căn hộ",
  ],

  authors: [
    {
      name: "Kim Lân Group",
    },
  ],

  creator: "Kim Lân Group",

  publisher: "Kim Lân Group",

  verification: {
    google: "OrAwsK9qi6-RNSZjZG8GfaIrYIy5xZcirO19CdFIdbM",
  },

  alternates: {
    canonical: "/",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName: "The Room SG",

    title: "THE ROOM SG",

    description:
      "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",

    images: [defaultShareImage],
  },

  twitter: {
    card: "summary_large_image",
    title: "The Room SG | Căn hộ dịch vụ",

    description:
      "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư tại TP.HCM.",

    images: [defaultShareImage],
  },

  icons: {
    icon: { url: "/favicon.ico?v=3", sizes: "16x16 32x32 48x48", type: "image/x-icon" },

    apple: "/the-room-apple-touch.png",
  },

  manifest: "/manifest.webmanifest",

  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },

  category: "Real Estate",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KimLan",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#744722",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PUBLIC_THEME_BOOTSTRAP }} />
        <Script
          id="gtm-head"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];
              w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
              var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
              j.async=true;
              j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
              f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-KXSD23BK');
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Kim Lân Group",
              alternateName: "The Room SG",
              url: "https://canhodichvu.pro",
              logo: "https://canhodichvu.pro/the-room-icon-192.png",
            }),
          }}
        />
      </head>

      <body className="antialiased">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KXSD23BK"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        <LazyAuthControls />
        <PwaRegister />
        <InstallPrompt />
        {children}
        {modal}
        <ClientErrorOverlay />
      </body>
    </html>
  );
}
