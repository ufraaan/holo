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
      className={`room-text-compose room-panel ${
        status !== "connected" ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <input
          ref={textNameInputRef}
          type="text"
          placeholder={t("filenamePlaceholder")}
          aria-label={t("filenamePlaceholder")}
          className="glass-field"
          disabled={status !== "connected"}
        />
      </div>
      <textarea
        ref={textInputRef}
        onKeyDown={onKeyDown}
        placeholder={t("textPlaceholder")}
        aria-label={t("textPlaceholder")}
        className="glass-field room-textarea"
        disabled={status !== "connected"}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSend}
          disabled={status !== "connected"}
          className="glass-button room-action"
          data-action="share"
        >
          {t("shareText")}
        </button>
      </div>
    </div>
  );
}
