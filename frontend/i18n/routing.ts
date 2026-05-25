import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "pt", "de", "hi"],
  defaultLocale: "en",
  localePrefix: "never",
});
