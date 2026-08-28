import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";
import "./room-share-visual-sync.css";
import LazyAuthControls from "@/components/LazyAuthControls";
import ClientErrorOverlay from './_debug/ClientErrorOverlay';
import InstallPrompt from "@/components/pwa/InstallPrompt";
import PwaRegister from "@/components/pwa/PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.pro"
  ),

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

    title: "The Room SG | Căn hộ dịch vụ - Kim Lân Group",

    description:
      "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",

    images: [
      {
        url: "/og-logo.jpg",
        width: 1200,
        height: 630,
        alt: "The Room SG - Kim Lân Group",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "The Room SG | Căn hộ dịch vụ",

    description:
      "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư tại TP.HCM.",

    images: ["/og-logo.jpg"],
  },

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],

    apple: "/apple-touch-icon.png",
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
              logo: "https://canhodichvu.pro/og-logo.jpg",
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
