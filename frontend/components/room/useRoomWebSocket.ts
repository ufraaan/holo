import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PeerTransferManager } from "./p2p/PeerTransferManager";
import { supportsDiskSaving, type PeerTransfer } from "./p2p/types";
import {
  decodeWsData,
  generateChatId,
  generateTextId,
  getChatName,
  getWsUrl,
  textEncoder,
  type ChatMessage,
  type TextShare,
  type Transfer,
} from "./room-utils";

export type RoomStatus = "connecting" | "connected" | "closed";
export type { Transfer, TextShare } from "./room-utils";

export interface ConnectionToast {
  id: string;
  type: "joined" | "left";
}

export interface Peer {
  id: string;
  name: string;
}

interface UseRoomWebSocketOptions {
  roomId: string;
  clientId: string;
  /** Per-tab secret; a reconnect without it cannot reclaim the id. */
  token: string;
}

interface UseRoomWebSocketReturn {
  status: RoomStatus;
  errorMessage: string | null;
  clientCount: number;
  toasts: ConnectionToast[];
  transfers: Record<string, Transfer>;
  textShares: Record<string, TextShare>;
  chatMessages: ChatMessage[];
  currentSenderId: string;
  currentSenderName: string;
  sendJson: (msg: unknown) => void;
  handleFiles: (files: FileList | null, peerIds?: string[]) => Promise<void>;
  handleSendText: (text: string, customName: string) => { id: string; timestamp: number };
  sendChatMessage: (text: string) => void;
  handleRetry: () => void;
  // P2P (webrtc transfer mode) only.
  p2pEnabled: boolean;
  peers: Peer[];
  p2pError: string | null;
  canReceiveToDisk: boolean;
  acceptTransfer: (id: string) => void;
  pauseTransfer: (id: string) => void;
  resumeTransfer: (id: string) => void;
  cancelTransfer: (id: string) => void;
  retryTransfer: (id: string) => void;
}

const ICE_REQUEST_TIMEOUT_MS = 10_000;
const ICE_CACHE_MARGIN_MS = 30_000;
// The engine refreshes every four minutes. Reusing a nearly expired ten-minute
// credential at that tick could otherwise leave a gap before the next refresh.
const ICE_CACHE_MAX_AGE_MS = 2 * 60_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;

function getIceCacheExpiry(expiresAt: number): number {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return Date.now() + 5 * 60_000;
  }
  // Tolerate seconds vs milliseconds from older signaling workers.
  const ms = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Math.max(Date.now() + 1_000, Math.min(ms - ICE_CACHE_MARGIN_MS, Date.now() + ICE_CACHE_MAX_AGE_MS));
}

function toTransfer(transfer: PeerTransfer): Transfer {
  const bytes = transfer.bytesTransferred;
  const progress =
    transfer.status === "completed"
      ? 100
      : transfer.size > 0
        ? Math.min(99, Math.floor((bytes / transfer.size) * 100))
        : 0;
  return {
    id: transfer.id,
    name: transfer.name,
    size: transfer.size,
    mime: transfer.mime,
    progress,
    direction: transfer.direction,
    url: transfer.url,
    peerId: transfer.peerId,
    peerName: transfer.peerName,
    connectionType: transfer.connectionType,
    status: transfer.status,
    bytesTransferred: bytes,
    bytesPerSecond: transfer.bytesPerSecond,
    etaSeconds: transfer.etaSeconds,
    error: transfer.error,
    errorCode: transfer.errorCode,
    retryable: transfer.retryable,
    savedToDisk: transfer.savedToDisk,
  };
}

export function useRoomWebSocket({
  roomId,
  clientId,
  token,
}: UseRoomWebSocketOptions): UseRoomWebSocketReturn {
  const t = useTranslations("WebSocketErrors");
  const tp = useTranslations("P2P");
  const p2pEnabled = true;
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [p2pError, setP2pError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [textShares, setTextShares] = useState<Record<string, TextShare>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [canReceiveToDisk, setCanReceiveToDisk] = useState(false);
  const [toasts, setToasts] = useState<ConnectionToast[]>([]);
  const [reconnectKey, setReconnectKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<PeerTransferManager | null>(null);
  const peersRef = useRef<Peer[]>([]);
  const pendingSignalsRef = useRef(new Map<string, unknown[]>());
  const prevClientCountRef = useRef(0);
  const hasReceivedInitialCount = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceCacheRef = useRef<{ servers: RTCIceServer[]; expiresAt: number } | null>(null);
  const icePendingRef = useRef<{
    promise: Promise<RTCIceServer[]>;
    settle: (servers: RTCIceServer[], expiresAt: number) => void;
    cancel: () => void;
  } | null>(null);

  const sendRaw = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(textEncoder.encode(JSON.stringify(msg)));
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendJson = useCallback((msg: unknown) => {
    if (!sendRaw(msg)) {
      setErrorMessage(t("sendFailed"));
    }
  }, [sendRaw, t]);

  // A peer can renegotiate while the room socket reconnects. Retain that offer
  // and its candidates until room membership is confirmed on the new socket.
  const sendSignal = useCallback((to: string, signal: unknown) => {
    if (sendRaw({ type: "signal", payload: { to, signal } })) return;
    const pending = pendingSignalsRef.current;
    const description = typeof signal === "object" && signal !== null && "description" in signal;
    const queue = description ? [] : pending.get(to) ?? [];
    if (pending.size >= 10 && !pending.has(to)) return;
    if (queue.length < 65) queue.push(signal);
    pending.set(to, queue);
  }, [sendRaw]);

  const getIceServers = useCallback((): Promise<RTCIceServer[]> => {
    const cached = iceCacheRef.current;
    if (cached && Date.now() < cached.expiresAt) {
      return Promise.resolve(cached.servers);
    }
    const pending = icePendingRef.current;
    if (pending) return pending.promise;

    if (!sendRaw({ type: "ice-request", payload: {} })) {
      return Promise.reject(new Error(tp("iceUnavailable")));
    }

    let resolveFn: (servers: RTCIceServer[]) => void = () => {};
    let rejectFn: (error: Error) => void = () => {};
    const promise = new Promise<RTCIceServer[]>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    const timer = setTimeout(() => {
      icePendingRef.current = null;
      rejectFn(new Error(tp("iceTimeout")));
    }, ICE_REQUEST_TIMEOUT_MS);

    icePendingRef.current = {
      promise,
      cancel: () => {
        clearTimeout(timer);
        icePendingRef.current = null;
        rejectFn(new Error(tp("iceUnavailable")));
      },
      settle: (servers, expiresAt) => {
        if (icePendingRef.current === null) return;
        clearTimeout(timer);
        icePendingRef.current = null;
        iceCacheRef.current = {
          servers,
          expiresAt: getIceCacheExpiry(expiresAt),
        };
        resolveFn(servers);
      },
    };

    return promise;
  }, [sendRaw, tp]);

  useEffect(() => {
    if (!p2pEnabled || !roomId) return;
    const pendingSignals = pendingSignalsRef.current;
    if (typeof RTCPeerConnection === "undefined") {
      startTransition(() => setP2pError(tp("webrtcUnsupported")));
      return;
    }

    const engine = new PeerTransferManager({
      clientId,
      autoReceive: true,
      sendSignal: (to, signal) => sendSignal(to, signal),
      getIceServers,
      onTransfer: (transfer) => {
        // Engine ids already carry the peer and direction: out:<peer>:<fileId>.
        setTransfers((prev) => ({
          ...prev,
          [transfer.id]: toTransfer(transfer),
        }));
      },
      onError: (message) => setP2pError(message || tp("transferFailed")),
    });
    engineRef.current = engine;
    engine.setPeers(peersRef.current.map((peer) => peer.id));

    return () => {
      icePendingRef.current?.cancel();
      iceCacheRef.current = null;
      pendingSignals.clear();
      engine.destroy();
      engineRef.current = null;
    };
  }, [p2pEnabled, roomId, clientId, sendSignal, getIceServers, tp]);

  useEffect(() => {
    peersRef.current = peers;
    engineRef.current?.setPeers(peers.map((peer) => peer.id));
  }, [peers]);

  useEffect(() => {
    startTransition(() => setCanReceiveToDisk(supportsDiskSaving()));
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null, peerIds?: string[]) => {
      if (!files || !files.length) return;

      const engine = engineRef.current;
      if (!engine) {
        setP2pError(tp("webrtcUnsupported"));
        return;
      }
      if (!peersRef.current.length) {
        setP2pError(tp("noPeers"));
        return;
      }
      if (peerIds?.some((id) => !peersRef.current.some((peer) => peer.id === id))) {
        setP2pError(tp("recipientUnavailable"));
        return;
      }
      setP2pError(null);
      try {
        const targets = peerIds && peerIds.length ? peerIds : undefined;
        await engine.sendFiles(Array.from(files), targets);
      } catch {
        setP2pError(tp("sendFailed"));
      }

    },
    [tp],
  );

  const handleSendText = useCallback(
    (text: string, customName: string) => {
      const id = generateTextId();
      const timestamp = Date.now();

      setTextShares((prev) => ({
        ...prev,
        [id]: { id, text, timestamp, customName, direction: "outgoing" },
      }));

      sendJson({
        type: "text-share",
        payload: { id, text, customName, timestamp },
      });

      return { id, timestamp };
    },
    [sendJson],
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const id = generateChatId();
      const timestamp = Date.now();
      const senderName = getChatName(clientId);

      setChatMessages((prev) => [
        ...prev,
        { id, text, senderId: clientId, senderName, timestamp },
      ]);

      sendJson({
        type: "chat-message",
        payload: { id, text, senderId: clientId, senderName, timestamp },
      });
    },
    [clientId, sendJson],
  );

  const handleRetry = useCallback(() => {
    if (!roomId) return;
    setStatus("connecting");
    setErrorMessage(null);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setReconnectKey((key) => key + 1);
  }, [roomId]);

  const acceptTransfer = useCallback(
    (id: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      // Called straight from the click handler so the file picker keeps its user gesture.
      engine.acceptTransfer(id).catch(() => setP2pError(tp("acceptFailed")));
    },
    [tp],
  );

  const pauseTransfer = useCallback((id: string) => {
    engineRef.current?.pauseTransfer(id);
  }, []);

  const resumeTransfer = useCallback((id: string) => {
    engineRef.current?.resumeTransfer(id);
  }, []);

  const retryTransfer = useCallback((id: string) => {
    engineRef.current?.retryTransfer(id);
  }, []);

  const cancelTransfer = useCallback((id: string) => {
    engineRef.current?.cancelTransfer(id);
    setTransfers((previous) => {
      const transfer = previous[id];
      if (!transfer || !["completed", "cancelled", "error"].includes(transfer.status ?? "")) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!roomId) return;

    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let ws: WebSocket | null = null;

    const scheduleReconnect = () => {
      // Room coordination reconnects without discarding peer transfer state.
      if (closedByCleanup || !p2pEnabled) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closedByCleanup) openSocket();
      }, delay);
    };

    const openSocket = () => {
      try {
        ws = new WebSocket(getWsUrl(roomId, clientId, token));
      } catch (err) {
        console.error("WebSocket construction failed", err);
        startTransition(() => {
          setStatus("closed");
          setErrorMessage(t("connectionFailed"));
        });
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;
      ws.binaryType = "arraybuffer";
      // Capture this socket: `ws` changes when auto-reconnect opens its replacement.
      const socket = ws;

      ws.onopen = () => {
        if (wsRef.current !== socket) return;
        attempts = 0;
        setStatus("connected");
        setErrorMessage(null);
      };
      ws.onclose = (ev) => {
        if (wsRef.current !== socket) return;
        icePendingRef.current?.cancel();
        setStatus("closed");
        setErrorMessage(ev.reason || t("connectionClosed"));
        console.warn("WebSocket closed", {
          code: ev.code,
          reason: ev.reason,
          wasClean: ev.wasClean,
        });
        scheduleReconnect();
      };
      ws.onerror = (ev) => {
        if (wsRef.current !== socket) return;
        setStatus("closed");
        setErrorMessage(t("wsError"));
        console.error("WebSocket error", ev);
      };
      ws.onmessage = async (ev) => {
        const text = await decodeWsData(ev.data);
        // A replaced socket may resolve after the room switched; ignore it.
        if (wsRef.current !== socket || !text) return;
        try {
          const msg = JSON.parse(text) as {
            type?: string;
            payload?: unknown;
          };
          if (msg.type === "room-state") {
            const payload = msg.payload as {
              clientCount?: number;
              peerIds?: unknown;
              clientId?: unknown;
            } | undefined;
            if (payload && typeof payload.clientCount === "number") {
              const current = payload.clientCount;
              const prev = prevClientCountRef.current;
              prevClientCountRef.current = current;
              setClientCount(current);

              if (hasReceivedInitialCount.current && current !== prev) {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                const capturedPrev = prev;
                const capturedCurrent = current;
                toastTimerRef.current = setTimeout(() => {
                  if (prevClientCountRef.current !== capturedCurrent) return;
                  const toast: ConnectionToast = {
                    id: crypto.randomUUID(),
                    type: capturedCurrent > capturedPrev ? "joined" : "left",
                  };
                  setToasts((t) => [...t, toast]);
                  setTimeout(() => {
                    setToasts((t) => t.filter((x) => x.id !== toast.id));
                  }, 3000);
                }, 1000);
              } else {
                hasReceivedInitialCount.current = true;
              }
            }
            if (payload && Array.isArray(payload.peerIds) && p2pEnabled) {
              const selfId = typeof payload.clientId === "string" ? payload.clientId : clientId;
              const nextPeers = payload.peerIds
                  .filter((id): id is string => typeof id === "string" && id !== selfId)
                  .map((id) => ({ id, name: getChatName(id) }));
              // Apply membership before the next socket event can deliver an
              // offer. Waiting for a React effect can leave the peer removed.
              peersRef.current = nextPeers;
              engineRef.current?.setPeers(nextPeers.map((peer) => peer.id));
              setPeers(nextPeers);
              for (const [to, signals] of pendingSignalsRef.current) {
                if (!payload.peerIds.includes(to)) continue;
                while (signals.length && sendRaw({ type: "signal", payload: { to, signal: signals[0] } })) {
                  signals.shift();
                }
                if (!signals.length) pendingSignalsRef.current.delete(to);
              }
            }
            return;
          } else if (msg.type === "signal") {
            const payload = msg.payload as { from?: unknown; signal?: unknown };
            if (typeof payload?.from !== "string" || payload.from === clientId) return;
            const engine = engineRef.current;
            if (!engine) return;
            void engine.handleSignal(payload.from, payload.signal).catch((err) => {
              console.error("Signal handling failed", err);
            });
            return;
          } else if (msg.type === "ice-config") {
            const payload = msg.payload as {
              iceServers?: unknown;
              expiresAt?: unknown;
            };
            const pending = icePendingRef.current;
            if (pending && Array.isArray(payload?.iceServers)) {
              pending.settle(
                payload.iceServers as RTCIceServer[],
                typeof payload.expiresAt === "number" ? payload.expiresAt : 0,
              );
            }
            return;
          } else if (msg.type === "text-share") {
            const payload = msg.payload as {
              id?: unknown;
              text?: unknown;
              customName?: unknown;
              timestamp?: unknown;
            };
            const id = payload.id;
            const text = payload.text;
            const customName = payload.customName;
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
                  customName: typeof customName === "string" ? customName : undefined,
                  timestamp,
                  direction: "incoming",
                },
              }));
            }
          } else if (msg.type === "chat-message") {
            const payload = msg.payload as {
              id?: unknown;
              text?: unknown;
              senderId?: unknown;
              senderName?: unknown;
              timestamp?: unknown;
            };
            const id = payload.id;
            const text = payload.text;
            const senderId = payload.senderId;
            const senderName = payload.senderName;
            const timestamp = payload.timestamp;
            if (
              typeof id === "string" &&
              typeof text === "string" &&
              typeof senderId === "string" &&
              typeof senderName === "string" &&
              typeof timestamp === "number"
            ) {
              setChatMessages((prev) => [
                ...prev,
                { id, text, senderId, senderName, timestamp },
              ]);
            }
          }
        } catch {
          // ignore malformed
        }
      };
    };

    openSocket();

    return () => {
      closedByCleanup = true;
      icePendingRef.current?.cancel();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        // Closing a connecting socket can emit error/close after React replaces it.
        // Obsolete connections must not update the current room or log errors.
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
      if (wsRef.current === ws) wsRef.current = null;
      };
  }, [roomId, clientId, token, reconnectKey, p2pEnabled, t, sendRaw]);

  return useMemo(
    () => ({
      status,
      errorMessage,
      clientCount,
      toasts,
      transfers,
      textShares,
      chatMessages,
      currentSenderId: clientId,
      currentSenderName: getChatName(clientId),
      sendJson,
      handleFiles,
      handleSendText,
      sendChatMessage,
      handleRetry,
      p2pEnabled,
      peers,
      p2pError,
      canReceiveToDisk,
      acceptTransfer,
      pauseTransfer,
      resumeTransfer,
      cancelTransfer,
      retryTransfer,
    }),
    [status, errorMessage, clientCount, toasts, transfers, textShares, chatMessages, sendJson, handleFiles, handleSendText, sendChatMessage, handleRetry, p2pEnabled, peers, p2pError, canReceiveToDisk, acceptTransfer, pauseTransfer, resumeTransfer, cancelTransfer, retryTransfer, clientId],
  );
}
