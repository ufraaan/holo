import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LocaleSwitcher from "../../components/LocaleSwitcher";
import "../globals.css";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Brand");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col bg-neutral-100 px-6 py-10 text-neutral-900 antialiased md:px-10">
      <header className="mb-12 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-medium uppercase tracking-[0.24em] text-neutral-500 transition hover:text-neutral-900"
        >
          {t("headerLabel")}
        </Link>
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-start">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>
      <footer className="mt-16 text-center text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
        {t("footer")}
      </footer>
    </div>
  );
}
