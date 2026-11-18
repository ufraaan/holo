import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import BackgroundVideo from "../../components/BackgroundVideo";
import LocaleSwitcher from "../../components/LocaleSwitcher";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("LegalNav");
  return (
    // Normal document flow, not `fixed inset-0`: iOS overscrolls a fixed
    // full-height scroller when the keyboard opens and exposes the page
    // underneath.
    <div className="relative min-h-dvh bg-black text-white">
      <BackgroundVideo />
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 text-sm font-normal">
          <Link href="/" className="text-white/85">HOLO</Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 text-white/70">
            <LocaleSwitcher />
            <Link href="/privacy" className="transition hover:text-white">{t("privacy")}</Link>
            <Link href="/terms" className="transition hover:text-white">{t("terms")}</Link>
            <a href="https://github.com/ufraaan/holo" target="_blank" rel="noreferrer" className="transition hover:text-white">{t("gitHub")}</a>
          </nav>
        </header>
        <main className="flex flex-1 flex-col pt-8">{children}</main>
      </div>
    </div>
  );
}
