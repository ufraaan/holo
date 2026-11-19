"use client";
import { useRouter } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { generateRoomId } from "../../components/room/room-utils";
import { containsProfanity } from "../../lib/profanity";

const titleFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600"] });

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations("HomePage");
  const [roomId, setRoomId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [bgLoaded, setBgLoaded] = useState(false);

  // Flip after the first frame so the hero's transition classes actually run
  // on mount instead of arriving already settled.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBgLoaded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleCreate = useCallback(() => {
    const id = generateRoomId();
    router.push(`/room/${id}`);
  }, [router]);

  const handleJoin = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = roomId.trim().toLowerCase();
      if (!trimmed) return;
      if (containsProfanity(trimmed)) {
        setJoinError(t("profanityError"));
        return;
      }
      setJoinError("");
      router.push(`/room/${trimmed}`);
    },
    [roomId, router, t],
  );

  return (
    <section className="relative flex min-h-[80dvh] flex-1 flex-col pb-6">
      <div className="flex flex-1 flex-col">
        <div className="mx-auto mt-12 flex w-full max-w-3xl flex-1 flex-col items-center justify-center pb-[20vh] text-center">
          <h1
            className={`${titleFont.className} text-5xl font-medium tracking-tight [word-spacing:0.12em] text-white/95 transition-all duration-700 md:text-6xl ${
              bgLoaded
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "100ms" : "0ms" }}
          >
            {t("hero")}
          </h1>
          <p
            className={`mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/70 transition-all duration-700 ${
              bgLoaded
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "200ms" : "0ms" }}
          >
            {t("subtitle")}
          </p>

          <div
            className={`mt-10 grid w-full max-w-md gap-3 transition-all duration-700 ${
              bgLoaded
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "300ms" : "0ms" }}
          >
            <button
              type="button"
              onClick={handleCreate}
              className="glass-button glass-control-large"
            >
              {t("createRoom")}
            </button>

            <div className="flex items-center gap-3 text-sm text-white/80 before:h-px before:flex-1 before:bg-white/35 after:h-px after:flex-1 after:bg-white/35">
              {t("or")}
            </div>

            <form onSubmit={handleJoin} className="mx-auto grid w-full max-w-md grid-cols-[minmax(0,1fr)_auto] gap-3">
              <label className="sr-only" htmlFor="join-room-id">
                {t("enterRoomId")}
              </label>
              <input
                id="join-room-id"
                type="text"
                placeholder={t("enterRoomId")}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase())}
                className="glass-field glass-control-large"
              />
              <button
                type="submit"
                className="glass-button glass-control-large"
              >
                {t("join")}
              </button>
            </form>
            {joinError && (
              <p className="mt-2 text-center text-sm text-red-300">
                {joinError}
              </p>
            )}
          </div>
        </div>

        <div
          className={`pb-3 text-center text-xs text-white/40 transition-all duration-700 ${
            bgLoaded
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-[30px]"
          }`}
          style={{ transitionDelay: bgLoaded ? "400ms" : "0ms" }}
        >
          <div className="mx-auto mb-3 h-px w-48 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          {t("footer")}
        </div>
      </div>
    </section>
  );
}
