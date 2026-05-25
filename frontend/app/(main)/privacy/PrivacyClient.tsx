"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import BackgroundImage from "../../../components/BackgroundImage";
import LocaleSwitcher from "../../../components/LocaleSwitcher";
import Link from "next/link";

export default function PrivacyClient() {
  const t = useTranslations("LegalNav");
  const lp = useTranslations("LegalPages");
  const [bgLoaded, setBgLoaded] = useState(false);

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto">
      <BackgroundImage src="/landing-backdrop.webp" onLoad={() => setBgLoaded(true)} />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/20 to-black/45" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/75 via-black/52 to-transparent backdrop-blur-[3px]" />

      <div className="relative z-10 flex h-full flex-col px-6 pb-10 pt-8 text-white md:px-10">
        <div className={`flex w-full items-center justify-between transition-all duration-700 ${bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-20px]"}`}>
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90 [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
            HOLO
          </span>
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <a
              href="/privacy"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              {t("privacy")}
            </a>
            <a
              href="/terms"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              {t("terms")}
            </a>
            <a
              href="https://github.com/ufraaan/holo"
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              {t("gitHub")}
            </a>
          </div>
        </div>

        <div className="mx-auto mt-12 flex w-full max-w-5xl flex-1 flex-col items-center justify-start overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <h1
            className={`text-5xl font-semibold tracking-tight text-white transition-all duration-700 md:text-6xl ${
              bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "100ms" : "0ms" }}
          >
            {lp("privacyHeading")}
          </h1>
          <p
            className={`mt-4 text-sm text-white/85 transition-all duration-700 ${
              bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "150ms" : "0ms" }}
          >
            {lp("lastUpdated")}
          </p>

          <div
            className={`mt-10 w-full max-w-4xl text-left text-white/85 space-y-8 transition-all duration-700 ${
              bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "200ms" : "0ms" }}
          >
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">1. No Data Storage</h2>
              <p>
                Holo is built on a simple principle: <strong>we don&apos;t store your data</strong>. Files and text shared through Holo are transferred directly between devices via WebSocket connections. Once a file is transferred or a room is closed, all data is permanently discarded from memory.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">2. No Accounts Required</h2>
              <p>
                Holo does not require registration, accounts, or any personal information. You can create a room and start sharing immediately without providing any identifying details.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">3. Room IDs and Ephemeral Sessions</h2>
              <p>
                Room IDs are randomly generated strings (6 characters) created client-side. Rooms exist only in memory on the relay server and are automatically removed when all participants disconnect. We do not track or log room IDs.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">4. WebSocket Connections</h2>
              <p>
                Holo uses WebSocket connections to relay data between devices in real-time. The relay server acts as a temporary bridge and does not inspect, store, or log the contents of your transfers. Connection metadata (such as IP addresses) may be processed temporarily for the duration of the connection to facilitate the transfer.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">5. No Cookies or Tracking</h2>
              <p>
                Holo does not use cookies, local storage, or session storage to track users. If analytics are enabled (via Umami), they are configured to respect privacy and do not collect personally identifiable information.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">6. Third-Party Services</h2>
              <p>
                The self-hosted version of Holo does not rely on third-party services. If you are using a hosted instance, that instance may have its own privacy practices. The open-source code is available on{" "}
                 <a href="https://github.com/ufraaan/holo" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 transition hover:text-white/80">
                    GitHub
                  </a>{" "}
                for transparency.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">7. Children&apos;s Privacy</h2>
              <p>
                Holo does not knowingly collect any personal information from children under the age of 13. Since we don&apos;t collect data in the first place, this is inherently respected.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">8. Changes to This Policy</h2>
              <p>
                This privacy policy may be updated occasionally. Any changes will be reflected on this page with an updated revision date.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">9. Contact</h2>
              <p>
                For questions about this privacy policy or Holo in general, please visit our{" "}
                 <a href="https://github.com/ufraaan/holo" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 transition hover:text-white/80">
                    GitHub repository
                  </a>.
              </p>
            </section>

             <div className="pt-6 border-t border-white/30">
              <Link href="/" className="text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline">
                  {t("backToHome")}
                </Link>
             </div>
           </div>
         </div>
       </div>
     </section>
   );
}
