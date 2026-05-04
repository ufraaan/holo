import { ForwardedRef, forwardRef } from "react";
import { RoomStatus } from "./useRoomWebSocket";

interface TextInputAreaProps {
  status: RoomStatus;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textNameInputRef: React.RefObject<HTMLInputElement | null>;
  textInputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export default function TextInputArea({
  status,
  onSend,
  onKeyDown,
  textNameInputRef,
  textInputRef,
}: TextInputAreaProps) {
  return (
    <div
      className={`mt-4 rounded-xl border border-white/25 bg-white/8 px-4 py-4 ${
        status !== "connected" ? "opacity-60" : ""
      }`}
    >
      <div className="mb-2">
        <input
          ref={textNameInputRef}
          type="text"
          placeholder="Filename (optional)"
          className="w-full rounded-lg border border-white/25 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
          disabled={status !== "connected"}
        />
      </div>
      <textarea
        ref={textInputRef}
        onKeyDown={onKeyDown}
        placeholder="Paste or type text to share…"
        className="min-h-[80px] w-full resize-y rounded-lg border border-white/25 bg-white/[0.06] px-2.5 py-2 font-mono text-xs text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
        disabled={status !== "connected"}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={status !== "connected"}
          className={`h-9 px-4 text-sm font-medium rounded-lg border transition ${
            status === "connected"
              ? "cursor-pointer border-white/30 bg-white/25 text-white hover:bg-white/35"
              : "cursor-not-allowed border-white/20 bg-white/10 text-white/45"
          }`}
        >
          Share text
        </button>
      </div>
    </div>
  );
}
