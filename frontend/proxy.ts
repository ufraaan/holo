import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const HEADER_LOCALE_NAME = "X-NEXT-INTL-LOCALE";

function detectLocale(cookieValue: string | undefined, acceptLanguage: string | undefined): string {
  if (cookieValue && routing.locales.includes(cookieValue as never)) {
    return cookieValue;
  }

  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(",")
      .map((lang) => {
        const [locale, q = "1"] = lang.trim().split(";q=");
        return { locale: locale.split("-")[0].trim(), q: parseFloat(q) || 1 };
      })
      .sort((a, b) => b.q - a.q);
    for (const lang of preferred) {
      if (routing.locales.includes(lang.locale as never)) {
        return lang.locale;
      }
    }
  }

  return routing.defaultLocale;
}

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-url", request.url);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const acceptLanguage = request.headers.get("accept-language") || undefined;
  const locale = detectLocale(cookieLocale, acceptLanguage);
  requestHeaders.set(HEADER_LOCALE_NAME, locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (!cookieLocale) {
    response.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
