"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";
import BackgroundVideo from "../../components/BackgroundVideo";

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function HomePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [bgLoaded, setBgLoaded] = useState(false);
  const handleBgLoaded = useCallback(() => setBgLoaded(true), []);

  const handleCreate = useCallback(() => {
    const id = generateRoomId();
    router.push(`/room/${id}`);
  }, [router]);

  const handleJoin = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = roomId.trim();
      if (!trimmed) return;
      router.push(`/room/${trimmed}`);
    },
    [roomId, router],
  );

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto">
      <BackgroundVideo onLoad={handleBgLoaded} />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/20 to-black/45" />
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/75 via-black/52 to-transparent backdrop-blur-[3px]" />

      <style>{`
        .glass-btn {
          position: relative;
          overflow: hidden;
        }
        .glass-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
        }
        .glass-btn::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 1px;
          height: 100%;
          background: linear-gradient(180deg, rgba(255,255,255,0.25), transparent, rgba(255,255,255,0.1));
        }
      `}</style>
      <div className="relative z-10 flex h-full flex-col px-6 pb-10 pt-8 text-white md:px-10">
        <div
          className={`flex w-full items-center justify-between transition-all duration-700 ${
            bgLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[-20px]"
          }`}
        >
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

        <div className="mx-auto mt-12 flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center">
          <h1
            className={`text-5xl font-semibold tracking-tight text-white transition-all duration-700 md:text-6xl ${
              bgLoaded
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "100ms" : "0ms" }}
          >
            Share a file in <em className="not-italic">seconds</em>
          </h1>
          <p
            className={`mt-4 max-w-2xl text-lg text-white/85 transition-all duration-700 ${
              bgLoaded
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-[30px]"
            }`}
            style={{ transitionDelay: bgLoaded ? "200ms" : "0ms" }}
          >
            Create a room, share the code, and transfer instantly between devices.
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
              className="glass-btn h-12 cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{
                boxShadow:
                  "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              Create room
            </button>

            <div className="flex items-center gap-3 text-sm text-white/80 before:h-px before:flex-1 before:bg-white/35 after:h-px after:flex-1 after:bg-white/35">
              or
            </div>

            <form onSubmit={handleJoin} className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto] gap-3">
              <label className="sr-only" htmlFor="join-room-id">
                Enter room ID
              </label>
              <input
                id="join-room-id"
                type="text"
                placeholder="Enter room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-white placeholder:text-white/70 backdrop-blur-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{
                  boxShadow:
                    "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              />
              <button
                type="submit"
                className="glass-btn h-12 cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{
                  boxShadow:
                    "0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                Join
              </button>
            </form>
          </div>
        </div>

        <div
          className={`pb-2 text-center text-xs font-medium uppercase tracking-[0.14em] text-white/75 transition-all duration-700 ${
            bgLoaded
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-[30px]"
          }`}
          style={{ transitionDelay: bgLoaded ? "400ms" : "0ms" }}
        >
          no storage · no accounts · just a room
        </div>
      </div>
    </section>
  );
}
