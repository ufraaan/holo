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
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col bg-neutral-100 px-6 py-10 text-neutral-900 antialiased md:px-10">
          <header className="mb-12 flex items-center justify-between">
            <Link
              href="/"
              className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500 transition hover:text-neutral-900"
            >
              holo
            </Link>
          </header>
          <main className="flex flex-1 items-start">
            <div className="mx-auto w-full max-w-4xl">{children}</div>
          </main>
          <footer className="mt-16 text-center text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
            no storage · no accounts · just a room
          </footer>
        </div>
      </body>
    </html>
  );
}

