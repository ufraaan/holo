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
  url?: string;
}

interface RoomStateMessage {
  type: "room-state";
  payload: {
    clientCount: number;
  };
}

const CHUNK_SIZE = 64 * 1024; // 64KiB

// Reuse a single encoder/decoder across all messages to avoid per-call allocation.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

async function decodeWsData(data: MessageEvent["data"]): Promise<string | null> {
  if (data instanceof ArrayBuffer) {
    return textDecoder.decode(data);
  }
  if (typeof data === "string") {
    return data;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const buf = await data.arrayBuffer();
    return textDecoder.decode(buf);
  }
  return null;
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
  const [clientCount, setClientCount] = useState<number>(1);
  const [reconnectKey, setReconnectKey] = useState(0);
  // Accumulate incoming file chunks in a ref so that each new chunk is an O(1)
  // push rather than an O(n) array spread inside React state.
  const incomingBlobPartsRef = useRef<Record<string, BlobPart[]>>({});

  useEffect(() => {
    if (!roomId) return;
    setErrorMessage(null);
    // Discard any partially-accumulated chunks from the previous connection.
    incomingBlobPartsRef.current = {};

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
    ws.onmessage = async (ev) => {
      const text = await decodeWsData(ev.data);
      if (!text) {
        return;
      }
      try {
        const msg = JSON.parse(text) as any;
        if (msg.type === "room-state") {
          const state = msg as RoomStateMessage;
          setClientCount(state.payload.clientCount);
        } else if (msg.type === "file-meta") {
          const { fileId, name, size, mime } = msg.payload;
          incomingBlobPartsRef.current[fileId] = [];
          setTransfers((prev) => ({
            ...prev,
            [fileId]: {
              id: fileId,
              name,
              size,
              mime,
              progress: 0,
              direction: "incoming",
            },
          }));
        } else if (msg.type === "file-chunk") {
          const { fileId, chunk, offset, final } = msg.payload as {
            fileId: string;
            chunk: string;
            offset: number;
            final: boolean;
          };
          const bytes = Uint8Array.from(atob(chunk), (c) =>
            c.charCodeAt(0),
          );
          // O(1) push — avoids the O(n) spread that storing parts in React
          // state would require on every chunk.
          (incomingBlobPartsRef.current[fileId] ??= []).push(bytes);
          setTransfers((prev) => {
            const current = prev[fileId];
            if (!current || current.direction !== "incoming") return prev;
            const received = offset + bytes.byteLength;
            const progress =
              current.size > 0
                ? Math.min(100, Math.round((received / current.size) * 100))
                : 0;
            if (final) {
              const parts = incomingBlobPartsRef.current[fileId] ?? [];
              delete incomingBlobPartsRef.current[fileId];
              const blob = new Blob(parts, { type: current.mime });
              return {
                ...prev,
                [fileId]: {
                  ...current,
                  progress: 100,
                  url: URL.createObjectURL(blob),
                },
              };
            }
            return { ...prev, [fileId]: { ...current, progress } };
          });
        }
      } catch {
        // ignore malformed
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      incomingBlobPartsRef.current = {};
    };
  }, [roomId, clientId, reconnectKey]);

  const sendJson = (msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage(
        "Unable to send data because the room connection is not open.",
      );
      return;
    }
    const text = JSON.stringify(msg);
    ws.send(textEncoder.encode(text));
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
        // Build the binary string in 8 KiB batches using spread-into-
        // String.fromCharCode, which is far faster than the naïve
        // character-by-character concatenation loop (O(n) vs O(n²)).
        let binary = "";
        const CHAR_BATCH_SIZE = 8192;
        for (let i = 0; i < buf.byteLength; i += CHAR_BATCH_SIZE) {
          binary += String.fromCharCode(
            ...buf.subarray(i, Math.min(i + CHAR_BATCH_SIZE, buf.byteLength)),
          );
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
    setReconnectKey((key) => key + 1);
  };

  // Sort is memoised so it doesn't re-run on every render while chunks are
  // arriving; it only recomputes when the transfers map itself changes.
  const sortedTransfers = useMemo(
    () =>
      Object.values(transfers).sort((a, b) => a.name.localeCompare(b.name)),
    [transfers],
  );

  return (
    <section>
      <div className="grid gap-4 border-b border-neutral-300 pb-5 md:grid-cols-2 md:items-center">
        <div className="md:justify-self-start">
          <div className="inline-flex items-center border border-neutral-300 px-3 py-1 font-mono text-sm text-neutral-800">
            {roomId}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm md:justify-self-end">
          <span
            className={`inline-flex items-center gap-2 font-medium ${
              status === "connected"
                ? "text-emerald-700"
                : status === "connecting"
                  ? "text-amber-700"
                  : "text-red-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === "connected"
                  ? "bg-emerald-500"
                  : status === "connecting"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
            />
            {status === "connected"
              ? "Connected"
              : status === "connecting"
              ? "Connecting…"
              : "Disconnected"}
          </span>
          <span className="text-neutral-500">{clientCount} in room</span>
          {status === "closed" && (
            <button
              type="button"
              onClick={handleRetry}
              className="h-9 border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-10 md:items-start">
        <div className="grid gap-5 md:pr-2">
          {status === "connecting" && !errorMessage && (
            <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Connecting to relay… this can take up to a minute. You can leave this
              tab open.
            </div>
          )}

          {errorMessage && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>
          )}

          <div
            className={`flex min-h-[260px] flex-col items-center justify-center gap-4 border border-neutral-300 px-6 py-12 text-center ${
              status !== "connected" ? "opacity-60" : ""
            }`}
            onDrop={status === "connected" ? onDrop : undefined}
            onDragOver={status === "connected" ? onDragOver : undefined}
            tabIndex={0}
          >
            <p className="text-lg font-medium text-neutral-900">Drop a file here</p>
            <p className="text-sm text-neutral-500">or choose one from your device</p>
            <label
              className={`inline-flex h-10 items-center justify-center border px-4 text-sm font-medium tracking-tight transition ${
                status === "connected"
                  ? "cursor-pointer border-neutral-300 bg-white text-neutral-900 hover:border-neutral-500 hover:bg-neutral-50"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
            >
              <input
                type="file"
                className="sr-only"
                onChange={status === "connected" ? onInputChange : undefined}
                disabled={status !== "connected"}
              />
              Choose file
            </label>
            {status !== "connected" && (
              <p className="text-sm text-neutral-500">Upload is available after connection.</p>
            )}
          </div>
        </div>

        <div className="md:pl-2">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-500">Transfers</p>
          {Object.keys(transfers).length === 0 ? (
            <p className="text-sm text-neutral-500">No transfers yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-300 border-y border-neutral-300">
              {sortedTransfers.map((t) => (
                <li key={t.id} className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{t.name}</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {formatSize(t.size)} ·{" "}
                        {getTransferState(t)} ·{" "}
                        {t.progress}%
                      </p>
                    </div>
                    {t.url && (
                      <a
                        href={t.url}
                        download={t.name}
                        className="h-9 border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-900"
                      >
                        Save file
                      </a>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden bg-neutral-200">
                    <div
                      className="h-full bg-neutral-900 transition-[width] duration-150"
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

function getTransferState(transfer: Transfer): string {
  if (transfer.progress >= 100) {
    return transfer.direction === "outgoing" ? "Sent" : "Received";
  }
  return transfer.direction === "outgoing" ? "Sending" : "Receiving";
}

