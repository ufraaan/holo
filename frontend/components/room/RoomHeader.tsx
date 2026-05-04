import { RoomStatus } from "./useRoomWebSocket";

interface RoomHeaderProps {
  roomId: string;
  status: RoomStatus;
  onRetry: () => void;
}

export default function RoomHeader({ roomId, status, onRetry }: RoomHeaderProps) {
  return (
    <div className="grid gap-4 border-b border-white/25 pb-4 sm:pb-5 md:grid-cols-2 md:items-center">
      <div className="md:justify-self-start">
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className="text-xs sm:text-sm text-white/70">Share this code:</span>
          <div className="inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-3 py-1 font-mono text-xs sm:text-sm text-white/95 break-all">
            {roomId}
          </div>
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
            ? "Connected"
            : status === "connecting"
              ? "Connecting…"
              : "Disconnected"}
        </span>
        {status === "closed" && (
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-lg border border-white/35 bg-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
