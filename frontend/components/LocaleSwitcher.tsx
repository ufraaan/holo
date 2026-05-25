"use client";

import { useLocale } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { useOnClickOutside } from "../hooks/useOnClickOutside";
import { routing } from "../i18n/routing";

const localeLabels: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch",
  hi: "हिन्दी",
};

export default function LocaleSwitcher() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  const switchLocale = useCallback((next: string) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);
    window.location.reload();
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1 text-xs font-medium tracking-wider uppercase text-white/60 transition hover:text-white"
      >
        {locale}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[130px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-md shadow-xl shadow-black/30">
          {routing.locales.map((loc) => {
            const isActive = loc === locale;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => switchLocale(loc)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-6 font-semibold uppercase tracking-wider">
                  {loc}
                </span>
                <span className="text-white/50">{localeLabels[loc]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
