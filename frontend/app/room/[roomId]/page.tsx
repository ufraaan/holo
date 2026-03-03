"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type TransferDirection = "incoming" | "outgoing";

interface Transfer {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number;
  direction: TransferDirection;
  blobParts?: BlobPart[];
  url?: string;
}

const CHUNK_SIZE = 64 * 1024; // 64KiB

function useClientId() {
  return useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `c_${Math.random().toString(36).slice(2, 10)}`;
  }, []);
}

function getWsUrl(roomId: string, clientId: string) {
  const base =
    process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
  const url = new URL(base);
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const clientId = useClientId();

  const [status, setStatus] = useState<"connecting" | "connected" | "closed">(
    "connecting",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    setErrorMessage(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsUrl(roomId, clientId));
    } catch (err) {
      console.error("WebSocket construction failed", err);
      setStatus("closed");
      setErrorMessage(
        "Could not open a WebSocket connection. Check that the relay server is running and NEXT_PUBLIC_WS_URL is correct.",
      );
      return;
    }

    wsRef.current = ws;

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setStatus("connected");
      setErrorMessage(null);
    };
    ws.onclose = (ev) => {
      setStatus("closed");
      const reason =
        ev.reason ||
        "Connection closed. The relay may be offline, unreachable, or refused the handshake.";
      setErrorMessage(reason);
      console.warn("WebSocket closed", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      });
    };
    ws.onerror = (ev) => {
      setStatus("closed");
      if (!errorMessage) {
        setErrorMessage(
          "A WebSocket error occurred. Check the browser console and that the Go relay is reachable.",
        );
      }
      console.error("WebSocket error", ev);
    };
    ws.onmessage = (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) {
        return;
      }
      const text = new TextDecoder().decode(ev.data);
      try {
        const msg = JSON.parse(text) as any;
        if (msg.type === "file-meta") {
          const { fileId, name, size, mime } = msg.payload;
          setTransfers((prev) => ({
            ...prev,
            [fileId]: {
              id: fileId,
              name,
              size,
              mime,
              progress: 0,
              direction: "incoming",
              blobParts: [],
            },
          }));
        } else if (msg.type === "file-chunk") {
          const { fileId, chunk, offset, final } = msg.payload as {
            fileId: string;
            chunk: string;
            offset: number;
            final: boolean;
          };
          setTransfers((prev) => {
            const current = prev[fileId];
            if (!current || current.direction !== "incoming") return prev;
            const bytes = Uint8Array.from(atob(chunk), (c) =>
              c.charCodeAt(0),
            );
            const parts = [...(current.blobParts ?? []), bytes];
            const received = offset + bytes.byteLength;
            const progress =
              current.size > 0
                ? Math.min(100, Math.round((received / current.size) * 100))
                : 0;
            const next: Transfer = {
              ...current,
              blobParts: parts,
              progress,
            };
            if (final) {
              const blob = new Blob(parts, { type: current.mime });
              next.url = URL.createObjectURL(blob);
              next.progress = 100;
            }
            return {
              ...prev,
              [fileId]: next,
            };
          });
        }
      } catch {
        // ignore malformed
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomId, clientId]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const sendJson = (msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage(
        "Unable to send data because the room connection is not open.",
      );
      return;
    }
    const text = JSON.stringify(msg);
    ws.send(new TextEncoder().encode(text));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    for (const file of Array.from(files)) {
      const fileId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setTransfers((prev) => ({
        ...prev,
        [fileId]: {
          id: fileId,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
          progress: 0,
          direction: "outgoing",
        },
      }));

      sendJson({
        type: "file-meta",
        payload: {
          fileId,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
        },
      });

      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buf = new Uint8Array(await slice.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buf.byteLength; i++) {
          binary += String.fromCharCode(buf[i]);
        }
        const b64 = btoa(binary);
        const final = offset + CHUNK_SIZE >= file.size;

        sendJson({
          type: "file-chunk",
          payload: {
            fileId,
            chunk: b64,
            offset,
            final,
          },
        });

        offset += CHUNK_SIZE;
        const progress =
          file.size > 0
            ? Math.min(100, Math.round((offset / file.size) * 100))
            : 0;
        setTransfers((prev) => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            progress,
          },
        }));
      }
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRetry = () => {
    if (!roomId) return;
    setStatus("connecting");
    setErrorMessage(null);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-medium text-ink">
            Room{" "}
            <span className="inline-flex items-center rounded-md border border-divider-soft bg-soft px-2 py-0.5 font-mono text-xs text-ink">
              {roomId}
            </span>
          </h1>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center rounded-md border border-divider-soft bg-soft px-2 py-0.5 text-[11px] text-muted hover:border-ink hover:text-ink transition"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              status === "connected"
                ? "text-green-ink"
                : status === "connecting"
                ? "text-amber-ink"
                : "text-red-ink"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "connected"
                  ? "bg-green-ink"
                  : status === "connecting"
                  ? "bg-amber-ink"
                  : "bg-red-ink"
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
              onClick={handleRetry}
              className="inline-flex items-center rounded-md border border-divider-soft bg-soft px-2 py-1 text-[11px] font-medium text-ink hover:border-ink transition"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
        {status === "connecting" && !errorMessage && (
          <div className="rounded-lg bg-amber-soft px-4 py-3 text-xs text-amber-ink">
            Connecting to relay… this can take up to a minute. You can leave this
            tab open.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg bg-red-soft px-4 py-3 text-xs text-red-ink">
            {errorMessage}
          </div>
        )}

        <div
          className={`flex flex-col items-center rounded-lg border border-dashed border-divider px-6 py-10 text-center sm:px-8 sm:py-12 ${
            status !== "connected" ? "opacity-60" : ""
          }`}
          onDrop={status === "connected" ? onDrop : undefined}
          onDragOver={status === "connected" ? onDragOver : undefined}
        >
          <p className="text-sm text-subtle">
            Drop a file here or choose one
          </p>
          <label
            className={`mt-4 rounded-lg border border-divider bg-surface px-5 py-2.5 text-sm font-medium transition ${
              status === "connected"
                ? "cursor-pointer text-ink hover:border-ink"
                : "cursor-not-allowed text-muted"
            }`}
          >
            <input
              type="file"
              className="hidden"
              onChange={status === "connected" ? onInputChange : undefined}
              disabled={status !== "connected"}
            />
            Choose file
          </label>
          {status !== "connected" && (
            <p className="mt-3 text-xs text-muted">
              You can upload once the room is connected.
            </p>
          )}
        </div>

        <div>
          <div className="mb-3 text-xs font-medium text-muted uppercase tracking-wider">
            Transfers
          </div>
          {Object.keys(transfers).length === 0 ? (
            <p className="text-sm text-subtle">
              No transfers yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {Object.values(transfers)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <li
                    key={t.id}
                    className="rounded-lg border border-divider-soft bg-soft px-4 py-4 sm:px-5 sm:py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink">
                          {t.name}
                        </span>
                        <span className="text-xs text-muted">
                          {formatSize(t.size)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {t.direction === "outgoing" ? "Sending" : "Receiving"} · {t.progress}%
                      </div>
                    </div>
                      {t.url && (
                        <a
                          href={t.url}
                          download={t.name}
                          className="shrink-0 rounded-lg border border-divider bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink"
                        >
                          Save
                        </a>
                      )}
                    </div>
                    <div className="mt-4 h-1 w-full rounded-full bg-divider-soft">
                      <div
                        className="h-1 rounded-full bg-ink transition-[width]"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function formatSize(size: number): string {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let s = size;
  while (s >= 1024 && idx < units.length - 1) {
    s /= 1024;
    idx++;
  }
  return `${s.toFixed(s >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

