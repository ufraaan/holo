import { useTranslations } from "next-intl";
import { RoomStatus } from "./useRoomWebSocket";

interface FileDropZoneProps {
  status: RoomStatus;
  errorMessage: string | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
}

export default function FileDropZone({
  status,
  errorMessage,
  onInputChange,
  onDrop,
  onDragOver,
}: FileDropZoneProps) {
  const t = useTranslations("FileDropZone");
  return (
    <div className="grid gap-4 md:pr-2">
      {status === "connecting" && !errorMessage && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-100">
          {t("connectingBanner")}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-300/40 bg-red-400/15 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </div>
      )}

      <div
        className={`flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center ${
          status !== "connected" ? "opacity-60" : ""
        }`}
        onDrop={status === "connected" ? onDrop : undefined}
        onDragOver={status === "connected" ? onDragOver : undefined}
        tabIndex={0}
      >
        <p className="text-base font-medium text-white">{t("dropPrompt")}</p>
        <p className="text-xs text-white/75">{t("choosePrompt")}</p>
        <label
          className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
            status === "connected"
              ? "cursor-pointer border-white/10 bg-white/[0.02] text-white hover:bg-white/10"
              : "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/45"
          }`}
        >
          <input
            type="file"
            className="sr-only"
            onChange={status === "connected" ? onInputChange : undefined}
            disabled={status !== "connected"}
          />
          {t("chooseFile")}
        </label>
      </div>
    </div>
  );
}
