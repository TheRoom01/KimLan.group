import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.vercel.app"),
  title: "The Room",
  description: "Kim Lân Group",
  openGraph: {
    type: "website",
    url: "/",
    title: "The Room",
    description: "Kim Lân Group",
    images: [
      {
        url: "/hero.jpg",
        width: 1200,
        height: 630,
        alt: "Căn hộ dịch vụ - KimLanGroup",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Room",
    description: "Kim Lân Group",
    images: ["/hero.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
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
        <ClientErrorOverlay />
      </body>
    </html>
  );
}
