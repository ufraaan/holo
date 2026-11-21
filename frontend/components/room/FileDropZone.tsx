import { useTranslations } from "next-intl";
import { UploadIcon } from "@radix-ui/react-icons";
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
    <div className="grid min-w-0 gap-3">
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
        className={`room-panel room-drop-zone flex flex-col items-center justify-center gap-3 text-center ${
          status !== "connected" ? "opacity-60" : ""
        }`}
        onDrop={status === "connected" ? onDrop : undefined}
        onDragOver={status === "connected" ? onDragOver : undefined}
        tabIndex={0}
      >
        <p className="text-sm font-normal text-white/90">{t("dropPrompt")}</p>
        <p className="text-sm text-white/60">{t("choosePrompt")}</p>
        <label
          data-action="choose"
          className={`glass-button room-action relative inline-flex items-center justify-center ${
            status === "connected"
              ? "cursor-pointer"
              : "cursor-not-allowed opacity-45"
          }`}
        >
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={status === "connected" ? onInputChange : undefined}
            disabled={status !== "connected"}
          />
          <UploadIcon aria-hidden="true" />
          {t("chooseFile")}
        </label>

        {p2pEnabled && peers.length === 0 && status === "connected" && (
          <p className="text-[11px] text-white/60">{t("waitingForPeers")}</p>
        )}
      </div>
    </div>
  );
}
