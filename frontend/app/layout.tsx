import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const rawUrl = headersList.get("x-url") || "https://holo.ufraan.dev";
  const canonicalUrl = new URL(rawUrl);
  canonicalUrl.search = "";

  return {
    title: "Holo | Simple File & Text Sharing",
    description: "Share files and text instantly between devices. No accounts, no storage - just a room.",
    icons: {
      icon: "/favicon.ico",
    },
    openGraph: {
      title: "Holo | Simple File & Text Sharing",
      description: "Share files and text instantly between devices. No accounts, no storage - just a room.",
      url: "https://holo.ufraan.dev",
      siteName: "Holo",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Holo | Simple File & Text Sharing",
      description: "Share files and text instantly between devices. No accounts, no storage - just a room.",
    },
    alternates: {
      canonical: canonicalUrl.toString().replace(/\/$/, ""),
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Holo",
              url: "https://holo.ufraan.dev",
              description:
                "Share files and text instantly between devices. No accounts, no storage - just a room.",
              applicationCategory: "Communication",
              operatingSystem: "All",
            }),
          }}
        />
      </head>
      {process.env.NEXT_PUBLIC_UMAMI_URL &&
        process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            defer
            src={process.env.NEXT_PUBLIC_UMAMI_URL}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}
      <body>{children}</body>
    </html>
  );
}
