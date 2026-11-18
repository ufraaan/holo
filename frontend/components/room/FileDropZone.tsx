import { useTranslations } from "next-intl";
import { RoomStatus } from "./useRoomWebSocket";
import type { Peer } from "./useRoomWebSocket";

interface FileDropZoneProps {
  status: RoomStatus;
  errorMessage: string | null;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  p2pEnabled?: boolean;
  peers?: Peer[];
  p2pError?: string | null;
}

export default function FileDropZone({
  status,
  errorMessage,
  onInputChange,
  onDrop,
  onDragOver,
  p2pEnabled = false,
  peers = [],
  p2pError = null,
}: FileDropZoneProps) {
  const t = useTranslations("FileDropZone");
  const banner = p2pError ?? errorMessage;

  return (
    <div className="grid gap-4 md:pr-2">
      {status === "connecting" && !banner && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-100">
          {p2pEnabled ? t("p2pConnectingBanner") : t("connectingBanner")}
        </div>
      )}

      {banner && (
        <div className="rounded-xl border border-red-300/40 bg-red-400/15 px-4 py-3 text-sm text-red-100">
          {banner}
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

        {p2pEnabled && peers.length === 0 && status === "connected" && (
          <p className="text-[11px] text-white/60">{t("waitingForPeers")}</p>
        )}
      </div>
    </div>
  );
}
