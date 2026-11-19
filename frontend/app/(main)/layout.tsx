import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Background from "../../components/Background";
import PageOverlay from "../../components/PageOverlay";
import LocaleSwitcher from "../../components/LocaleSwitcher";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("LegalNav");
  return (
    // Normal document flow, not `fixed inset-0`: iOS overscrolls a fixed
    // full-height scroller when the keyboard opens and exposes the page
    // underneath.
    <div className="relative min-h-dvh bg-black text-white">
      <Background />
      <PageOverlay />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <header className="relative z-20 flex flex-wrap items-center justify-between gap-4 text-sm font-normal">
          <Link href="/" className="intro-left text-white/85">HOLO</Link>
          <nav aria-label="Main navigation" className="intro-right flex flex-wrap items-center gap-4 text-white/70">
            <LocaleSwitcher />
            <Link href="/privacy" className="transition hover:text-white">{t("privacy")}</Link>
            <Link href="/terms" className="transition hover:text-white">{t("terms")}</Link>
            <a
              href="https://github.com/ufraaan/holo"
              target="_blank"
              rel="noreferrer"
              aria-label={t("gitHub")}
              className="inline-flex items-center text-white/70 transition hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </a>
          </nav>
        </header>
        <main className="flex flex-1 flex-col pt-8">{children}</main>
      </div>
    </div>
  );
}
