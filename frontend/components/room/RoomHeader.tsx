import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RoomStatus } from "./useRoomWebSocket";

interface RoomHeaderProps {
  roomId: string;
  status: RoomStatus;
  clientCount: number;
  onRetry: () => void;
}

export default function RoomHeader({ roomId, status, clientCount, onRetry }: RoomHeaderProps) {
  const t = useTranslations("RoomHeader");
  const [showDisplay, setShowDisplay] = useState(false);

  const close = useCallback(() => setShowDisplay(false), []);

  useEffect(() => {
    if (!showDisplay) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showDisplay, close]);

  return (
    <>
      <div className="grid gap-4 border-b border-white/25 pb-4 sm:pb-5 md:grid-cols-2 md:items-center">
        <div className="md:justify-self-start">
          <div className="inline-flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm text-white/70">{t("shareCode")}</span>
            <div className="inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-3 py-1 font-mono text-xs sm:text-sm text-white/95 break-all">
              {roomId}
            </div>
            <button
              type="button"
              onClick={() => setShowDisplay(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/25 bg-white/10 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              title={t("expandTitle")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-white/80"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm md:justify-self-end">
          <span
            className={`inline-flex items-center gap-2 font-medium ${
              status === "connected"
                ? "text-emerald-300"
                : status === "connecting"
                  ? "text-amber-300"
                  : "text-red-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === "connected"
                  ? "bg-emerald-300"
                  : status === "connecting"
                    ? "bg-amber-300"
                    : "bg-red-300"
              }`}
            />
            {status === "connected"
              ? t("connected")
              : status === "connecting"
                ? t("connecting")
                : t("disconnected")}
          </span>
          {status === "connected" && clientCount > 0 && (
            <span className="text-white/60">
              {t("countConnected", { count: clientCount })}
            </span>
          )}
          {status === "closed" && (
            <button
              type="button"
              onClick={onRetry}
              className="h-9 rounded-lg border border-white/35 bg-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t("retry")}
            </button>
          )}
        </div>
      </div>

      {showDisplay && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-pointer"
          onClick={close}
        >
          <div className="flex flex-col items-center gap-4 px-6">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {t("roomCode")}
            </span>
            <span className="select-all text-6xl sm:text-8xl md:text-9xl font-bold tracking-widest text-white">
              {roomId}
            </span>
          </div>
          <span className="absolute bottom-12 text-xs text-white/40">
            {t("overlayHint")}
          </span>
        </div>
      )}
    </>
  );
}
