import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "Holo | Simple File & Text Sharing",
  description: "Share files and text instantly between devices. No accounts, no storage - just a room.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {process.env.NEXT_PUBLIC_UMAMI_URL && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
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
