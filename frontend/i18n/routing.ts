import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "pt", "de"],
  defaultLocale: "en",
  localePrefix: "never",
});
