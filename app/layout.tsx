import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import "./room-share-visual-sync.css";
import AuthControls from "@/components/AuthControls";
import ClientErrorOverlay from './_debug/ClientErrorOverlay';


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.pro"
  ),

  title: {
    default: "The Room | Căn hộ dịch vụ - Kim Lân Group",
    template: "%s | The Room",
  },

  description:
    "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",

  applicationName: "The Room",

  keywords: [
    "căn hộ dịch vụ",
    "phòng trọ",
    "thuê phòng",
    "chung cư",
    "kim lân group",
    "the room",
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
    siteName: "The Room",

    title: "The Room | Căn hộ dịch vụ - Kim Lân Group",

    description:
      "Hệ thống tìm kiếm căn hộ dịch vụ, phòng trọ, chung cư và nhà cho thuê tại TP.HCM.",

    images: [
      {
        url: "/og-logo.jpg",
        width: 1200,
        height: 630,
        alt: "The Room - Kim Lân Group",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "The Room | Căn hộ dịch vụ",

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
              alternateName: "The Room",
              url: "https://canhodichvu.pro",
              logo: "https://canhodichvu.pro/og-logo.jpg",
            }),
          }}
        />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KXSD23BK"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>

        <AuthControls />
        {children}
        {modal}
        <ClientErrorOverlay />
      </body>
    </html>
  );
}
