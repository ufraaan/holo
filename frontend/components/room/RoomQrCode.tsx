import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";

export function RoomQrCode({ roomId }: { roomId: string }) {
  const t = useTranslations("RoomHeader");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [url, setUrl] = useState("");
  const [localOnly, setLocalOnly] = useState(false);

  const open = () => {
    setUrl(new URL(`/room/${encodeURIComponent(roomId)}`, window.location.origin).href);
    setLocalOnly(["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
    dialogRef.current?.showModal();
  };

  return (
    <>
      <button type="button" className="glass-button room-expand" onClick={open} aria-label={t("showQr")} title={t("showQr")} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="15" y="3" width="6" height="6" rx="1" />
          <rect x="3" y="15" width="6" height="6" rx="1" />
          <path d="M15 12v4h6M12 3v9H3m9 3v6m3-2v2h6v-2m0-7v1" />
        </svg>
      </button>
      <dialog ref={dialogRef} className="room-qr-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="room-qr-heading">
          <h2 id={titleId}>{t("qrTitle")}</h2>
          <form method="dialog"><button autoFocus type="submit" className="glass-button glass-button-small" aria-label={t("closeQr")}>×</button></form>
        </div>
        <p id={descriptionId} className="room-qr-description">{t("qrDescription")}</p>
        {url && <div className="room-qr-image"><QRCodeSVG value={url} size={224} level="M" marginSize={4} title={t("qrTitle")} /></div>}
        {url && <p className="room-qr-code">{roomId}</p>}
        <p className="room-qr-url">{url}</p>
        {localOnly && <p className="room-qr-notice">{t("qrLocalNotice")}</p>}
      </dialog>
    </>
  );
}
