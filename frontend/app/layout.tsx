import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "holo – ephemeral file sharing",
  description: "Minimal peer-to-peer–style file sharing over WebSockets. No storage, no accounts, just a room and a file.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "holo – ephemeral file sharing",
    description: "Create a room, share the link, drop a file. The relay forwards bytes between browsers — nothing is stored.",
    url: "https://holo.dev",
    siteName: "holo",
    images: [
      {
        url: "/holo.png",
        width: 1200,
        height: 630,
        alt: "holo – ephemeral file sharing",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "holo – ephemeral file sharing",
    description: "Create a room, share the link, drop a file. Nothing is stored.",
    images: ["/holo.png"],
  },
  metadataBase: new URL("https://holo.dev"),
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
      <body className="min-h-screen bg-sand text-ink">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 sm:px-6 sm:py-12">
          <header className="mb-8 sm:mb-12">
            <Link
              href="/"
              className="inline-block text-xs font-medium tracking-[0.2em] text-muted uppercase hover:text-ink transition-colors"
            >
              holo
            </Link>
          </header>
          <main className="flex flex-1 items-center justify-center">
            <div className="w-full">{children}</div>
          </main>
          <footer className="mt-auto pt-12 text-[11px] text-muted">
            no storage · no accounts · just a room
          </footer>
        </div>
      </body>
    </html>
  );
}

