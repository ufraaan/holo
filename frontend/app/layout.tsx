import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { PrivacyScreen } from "../components/PrivacyScreen";
import "./globals.css";
import "../components/glass-controls.css";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const rawUrl = headersList.get("x-url") || "https://holo.ufraan.dev";
  const canonicalUrl = new URL(rawUrl);
  canonicalUrl.search = "";
  const t = await getTranslations("Metadata");

  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: "/favicon.ico",
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: "https://holo.ufraan.dev",
      siteName: t("siteName"),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    alternates: {
      canonical: canonicalUrl.toString().replace(/\/$/, ""),
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("Metadata");

  return (
    <html lang={locale}>
      <head>
        <Script src="/analytics-privacy.js" strategy="beforeInteractive" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: t("siteName"),
              url: "https://holo.ufraan.dev",
              description: t("description"),
              applicationCategory: t("appCategory"),
              operatingSystem: t("os"),
            }),
          }}
        />
      </head>
      <body>
      {process.env.NEXT_PUBLIC_UMAMI_URL &&
        process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            defer
            data-before-send="holoBeforeSend"
            src={process.env.NEXT_PUBLIC_UMAMI_URL}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}

        <NextIntlClientProvider messages={messages}>
          {children}
          <PrivacyScreen />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
