"use client";
import { useState } from "react";
import BackgroundImage from "../../../components/BackgroundImage";
import Link from "next/link";

export default function TermsPage() {
  const [bgLoaded, setBgLoaded] = useState(false);

  return (
    <section className="fixed inset-0 z-50 overflow-hidden">
      <BackgroundImage src="/landing-backdrop.webp" onLoad={() => setBgLoaded(true)} />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/20 to-black/45" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/75 via-black/52 to-transparent backdrop-blur-[3px]" />

      <div className="relative z-10 flex h-full min-h-screen flex-col px-6 pb-10 pt-8 text-white md:px-10">
        <div className={`flex w-full items-center justify-between transition-all duration-700 ${bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-20px]"}`}>
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90 [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
            HOLO
          </span>
          <div className="flex items-center gap-4">
            <a
              href="/privacy"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              Terms
            </a>
            <a
              href="https://github.com/ufraaan/holo"
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
            >
              GitHub
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
            Terms of Service
          </h1>
          <p
            className={`mt-4 text-sm text-white/85 transition-all duration-700 ${
              bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "150ms" : "0ms" }}
          >
            Last updated: May 1, 2026
          </p>

          <div
            className={`mt-10 w-full max-w-4xl text-left text-white/85 space-y-8 transition-all duration-700 ${
              bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "200ms" : "0ms" }}
          >
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Holo, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">2. Description of Service</h2>
              <p>
                Holo is a peer-to-peer file and text sharing tool that uses WebSocket connections to transfer data directly between devices. The service is provided &quot;as is&quot; and is designed for ephemeral, temporary transfers with no data storage.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">3. No Storage Policy</h2>
              <p>
                Holo does not store, log, or retain any files, text, or transfer data. All data exists only in memory during an active session and is permanently discarded when the room is closed or all participants disconnect.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">4. User Responsibilities</h2>
              <p>
                You are solely responsible for the content you share through Holo. You agree not to use Holo to share illegal, harmful, or infringing content. You are responsible for ensuring you have the right to share any files or text you transmit.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">5. No Accounts or Authentication</h2>
              <p>
                Holo does not require accounts, passwords, or authentication. Room IDs function as temporary access codes. Anyone with a room ID can join that room while it is active. Do not share room IDs with unauthorized parties.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">6. Disclaimer of Warranties</h2>
              <p>
                Holo is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We make no warranties, expressed or implied, regarding the reliability, availability, or security of the service. We do not guarantee that transfers will be successful, error-free, or uninterrupted.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">7. Limitation of Liability</h2>
              <p>
                In no event shall Holo, its developers, or contributors be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">8. Open Source</h2>
              <p>
                Holo is open-source software available on{" "}
                <a href="https://github.com/ufraaan/holo" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 transition hover:text-white/80">
                  GitHub
                </a>{" "}
                under its license terms. You are free to self-host, modify, and distribute the software in accordance with the license.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">9. Changes to Service or Terms</h2>
              <p>
                We reserve the right to modify or discontinue Holo at any time without notice. These terms may be updated occasionally, with the updated version posted on this page.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-white">10. Contact</h2>
              <p>
                For questions about these Terms of Service, please visit our{" "}
                <a href="https://github.com/ufraaan/holo" target="_blank" rel="noreferrer" className="text-white underline underline-offset-4 transition hover:text-white/80">
                  GitHub repository
                </a>.
              </p>
            </section>

            <div className="pt-6 border-t border-white/30">
              <Link href="/" className="text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline">
                ← Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
