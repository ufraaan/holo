"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import BackgroundImage from "../../../components/BackgroundImage";

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

interface TextShare {
  id: string;
  text: string;
  timestamp: number;
  direction: TransferDirection;
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
    return "c_fallback";
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

  const [bgLoaded, setBgLoaded] = useState(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "closed">(
    "connecting",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [textShares, setTextShares] = useState<Record<string, TextShare>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
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
      setErrorMessage(
        "A WebSocket error occurred. Check the browser console and that the Go relay is reachable.",
      );
      console.error("WebSocket error", ev);
    };
    ws.onmessage = async (ev) => {
      const text = await decodeWsData(ev.data);
      if (!text) {
        return;
      }
      try {
        const msg = JSON.parse(text) as {
          type?: string;
          payload?: unknown;
        };
        if (msg.type === "room-state") {
          // Keep consuming room-state control messages even if not displayed.
          return;
        } else if (msg.type === "file-meta") {
          const payload = msg.payload as {
            fileId: string;
            name: string;
            size: number;
            mime: string;
          };
          const { fileId, name, size, mime } = payload;
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
        } else if (msg.type === "text-share") {
          const payload = msg.payload as {
            id?: unknown;
            text?: unknown;
            timestamp?: unknown;
          };
          const id = payload.id;
          const text = payload.text;
          const timestamp = payload.timestamp;
          if (
            typeof id === "string" &&
            typeof text === "string" &&
            typeof timestamp === "number"
          ) {
            setTextShares((prev) => ({
              ...prev,
              [id]: {
                id,
                text,
                timestamp,
                direction: "incoming",
              },
            }));
          }
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

  const handleSendText = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const rawText = textInputRef.current?.value ?? "";
    const text = rawText.trim();
    if (!text) return;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Date.now();

    setTextShares((prev) => ({
      ...prev,
      [id]: { id, text: rawText, timestamp, direction: "outgoing" },
    }));

    sendJson({
      type: "text-share",
      payload: { id, text: rawText, timestamp },
    });

    if (textInputRef.current) {
      textInputRef.current.value = "";
    }
  };

  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onTextInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendText();
    }
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

  const sortedTextShares = useMemo(
    () =>
      Object.values(textShares).sort((a, b) => b.timestamp - a.timestamp),
    [textShares],
  );

  const handleCopyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }
    setCopiedId(id);
    copiedTimerRef.current = setTimeout(() => {
      setCopiedId(null);
      copiedTimerRef.current = null;
    }, 2000);
  };

  const handleDownloadText = (text: string, id: string, timestamp: number) => {
    const shortId = id.slice(0, 8);
    const ts = new Date(timestamp).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `text-${roomId}-${ts}-${shortId}.txt`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="fixed inset-0 z-40 overflow-y-auto">
      <BackgroundImage src="/landing-backdrop.webp" onLoad={() => setBgLoaded(true)} />
      <div className="fixed inset-0 bg-black/45" />
      <div className="fixed inset-0 bg-gradient-to-b from-black/30 via-black/35 to-black/55" />
      <div className="fixed inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/78 via-black/56 to-transparent backdrop-blur-[3px]" />

      <div
        className={`relative z-10 min-h-screen px-4 py-6 text-white sm:px-6 md:px-10 md:py-8 transition-opacity duration-700 ${
          bgLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-white/90 [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
            HOLO
          </span>
          <a
            href="https://github.com/ufraaan/holo"
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer text-sm font-medium text-white/80 underline-offset-4 transition hover:text-white hover:underline"
          >
            GitHub
          </a>
        </div>

        <div className="mx-auto mt-6 sm:mt-8 max-w-6xl">
          <Link
            href="/"
            className="inline-flex cursor-pointer items-center text-sm font-medium text-white/80 transition hover:text-white"
          >
            ← Go back
          </Link>
        </div>

        <div className="mx-auto mt-4 w-full max-w-6xl rounded-2xl border border-white/20 bg-black/25 p-4 sm:p-6 backdrop-blur-md md:p-8">
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
                  onClick={handleRetry}
                  className="h-9 rounded-lg border border-white/35 bg-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
          <div className="mt-6 sm:mt-10 grid gap-6 sm:gap-8 md:grid-cols-2 md:gap-10 md:items-start">
            <div className="grid gap-4 sm:gap-5 md:pr-2">
              {status === "connecting" && !errorMessage && (
                <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-100">
                  Connecting to relay… this can take up to a minute. You can
                  leave this tab open.
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl border border-red-300/40 bg-red-400/15 px-4 py-3 text-sm text-red-100">
                  {errorMessage}
                </div>
              )}

              <div
                className={`flex min-h-[220px] sm:min-h-[260px] flex-col items-center justify-center gap-3 sm:gap-4 rounded-xl border border-white/25 bg-white/8 px-4 sm:px-6 py-8 sm:py-12 text-center ${
                  status !== "connected" ? "opacity-60" : ""
                }`}
                onDrop={status === "connected" ? onDrop : undefined}
                onDragOver={status === "connected" ? onDragOver : undefined}
                tabIndex={0}
              >
                <p className="text-base sm:text-lg font-medium text-white">
                  Drop a file here
                </p>
                <p className="text-xs sm:text-sm text-white/75">
                  or choose one from your device
                </p>
                <label
                  className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium tracking-tight transition ${
                    status === "connected"
                      ? "cursor-pointer border-white/30 bg-white/25 text-white backdrop-blur-sm hover:bg-white/30"
                      : "cursor-not-allowed border-white/20 bg-white/10 text-white/45"
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
                  <p className="text-xs sm:text-sm text-white/70">
                    Upload is available after connection.
                  </p>
                )}
              </div>

              <div
                className={`mt-4 sm:mt-5 flex flex-col gap-3 rounded-xl border border-white/25 bg-white/8 px-4 sm:px-5 py-4 ${
                  status !== "connected" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm font-medium text-white/90">
                    Share text
                  </p>
                  <p className="text-xs text-white/60">
                    Ctrl+Enter to send
                  </p>
                </div>
                <textarea
                  ref={textInputRef}
                  onKeyDown={onTextInputKeyDown}
                  placeholder="Paste or type text to share…"
                  className="min-h-[100px] w-full resize-y rounded-lg border border-white/25 bg-white/[0.06] px-3 py-2.5 font-mono text-sm text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none focus:ring-1 focus:ring-white/25"
                  disabled={status !== "connected"}
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleSendText}
                    disabled={status !== "connected"}
                    className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm font-medium tracking-tight transition ${
                      status === "connected"
                        ? "cursor-pointer border-white/30 bg-white/25 text-white backdrop-blur-sm hover:bg-white/35"
                        : "cursor-not-allowed border-white/20 bg-white/10 text-white/45"
                    }`}
                  >
                    Share text
                  </button>
                </div>
              </div>
            </div>

            <div className="md:pl-2">
              {Object.keys(transfers).length === 0 && Object.keys(textShares).length === 0 ? (
                <p className="text-sm text-white/75">No transfers yet.</p>
              ) : (
                <>
                  {sortedTextShares.length > 0 && (
                    <>
                      <p className="mb-2 sm:mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                        Text Snippets
                      </p>
                      <div className="grid gap-2 sm:gap-3">
                        {sortedTextShares.map((ts) => (
                          <div
                            key={ts.id}
                            className="overflow-hidden rounded-lg border border-white/20 bg-white/[0.06] p-3 sm:p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="font-mono text-xs text-white/90 truncate">
                                  {ts.text.slice(0, 60)}
                                  {ts.text.length > 60 ? "…" : ""}
                                </p>
                                <p className="mt-1 text-xs text-white/50">
                                  {ts.text.length} chars · {ts.direction === "outgoing" ? "Sent" : "Received"}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(ts.text, ts.id)}
                                  className="h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
                                >
                                  {copiedId === ts.id ? "Copied!" : "Copy"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadText(ts.text, ts.id, ts.timestamp)}
                                  className="h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {sortedTransfers.length > 0 && (
                    <>
                      <p className="mb-2 sm:mb-3 mt-4 sm:mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                        Files
                      </p>
                      <div className="grid gap-2 sm:gap-3">
                        {sortedTransfers.map((t) => (
                          <div
                            key={t.id}
                            className="overflow-hidden rounded-lg border border-white/20 bg-white/[0.06] p-3 sm:p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="truncate font-medium text-white text-sm">
                                  {t.name}
                                </p>
                                <p className="mt-0.5 text-xs text-white/50">
                                  {formatSize(t.size)} · {getTransferState(t)} · {t.progress}%
                                </p>
                              </div>
                              {t.url && (
                                <a
                                  href={t.url}
                                  download={t.name}
                                  className="shrink-0 h-8 flex cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/10 px-2.5 text-xs font-medium text-white/80 transition hover:bg-white/20"
                                >
                                  Save
                                </a>
                              )}
                            </div>
                            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                              <div
                                className="h-full bg-white/60 transition-[width] duration-150"
                                style={{ width: `${t.progress}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
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

