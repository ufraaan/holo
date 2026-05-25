import { useTranslations } from "next-intl";
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
  const t = useTranslations("TextInputArea");
  return (
    <div
      className={`mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 ${
        status !== "connected" ? "opacity-60" : ""
      }`}
    >
      <div className="mb-2">
        <input
          ref={textNameInputRef}
          type="text"
          placeholder={t("filenamePlaceholder")}
          className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          disabled={status !== "connected"}
        />
      </div>
      <textarea
        ref={textInputRef}
        onKeyDown={onKeyDown}
        placeholder={t("textPlaceholder")}
        className="min-h-[80px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-sm text-white placeholder:text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        disabled={status !== "connected"}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={status !== "connected"}
          className={`h-9 px-4 text-sm font-medium rounded-xl border transition ${
            status === "connected"
              ? "cursor-pointer border-white/10 bg-white/[0.02] text-white hover:bg-white/10"
              : "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/45"
          }`}
        >
          {t("shareText")}
        </button>
      </div>
    </div>
  );
}
