import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as never)) {
    try {
      const cookieStore = await cookies();
      const nextLocale = cookieStore.get("NEXT_LOCALE")?.value;
      if (nextLocale && routing.locales.includes(nextLocale as never)) {
        locale = nextLocale;
      }
    } catch {
      locale = routing.defaultLocale;
    }
  }

  if (!locale || !routing.locales.includes(locale as never)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
