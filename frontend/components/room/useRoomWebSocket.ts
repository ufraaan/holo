import { useTranslations } from "next-intl";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeWsData,
  encodeFileToChunks,
  generateChatId,
  generateFileId,
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

interface UseRoomWebSocketOptions {
  roomId: string;
  clientId: string;
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
  handleFiles: (files: FileList | null) => Promise<void>;
  handleSendText: (text: string, customName: string) => { id: string; timestamp: number };
  sendChatMessage: (text: string) => void;
  handleRetry: () => void;
}

export function useRoomWebSocket({
  roomId,
  clientId,
}: UseRoomWebSocketOptions): UseRoomWebSocketReturn {
  const t = useTranslations("WebSocketErrors");
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [textShares, setTextShares] = useState<Record<string, TextShare>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [toasts, setToasts] = useState<ConnectionToast[]>([]);
  const [reconnectKey, setReconnectKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const incomingBlobPartsRef = useRef<Record<string, BlobPart[]>>({});
  const prevClientCountRef = useRef(0);
  const hasReceivedInitialCount = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendJson = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage(t("sendFailed"));
      return;
    }
    const text = JSON.stringify(msg);
    ws.send(textEncoder.encode(text));
  }, [t]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      for (const file of Array.from(files)) {
        const fileId = generateFileId();

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

        await encodeFileToChunks(
          file,
          (chunk, offset, isFinal) => {
            sendJson({
              type: "file-chunk",
              payload: { fileId, chunk, offset, final: isFinal },
            });
          },
          (progress) => {
            setTransfers((prev) => ({
              ...prev,
              [fileId]: { ...prev[fileId], progress },
            }));
          },
        );
      }
    },
    [sendJson],
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

  useEffect(() => {
    if (!roomId) return;
    incomingBlobPartsRef.current = {};

    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsUrl(roomId, clientId));
    } catch (err) {
      console.error("WebSocket construction failed", err);
      startTransition(() => {
        setStatus("closed");
        setErrorMessage(t("connectionFailed"));
      });
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
      const reason = ev.reason || t("connectionClosed");
      setErrorMessage(reason);
      console.warn("WebSocket closed", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      });
    };
    ws.onerror = (ev) => {
      setStatus("closed");
      setErrorMessage(t("wsError"));
      console.error("WebSocket error", ev);
    };
    ws.onmessage = async (ev) => {
      const text = await decodeWsData(ev.data);
      if (!text) return;
      try {
        const msg = JSON.parse(text) as {
          type?: string;
          payload?: unknown;
        };
        if (msg.type === "room-state") {
          const payload = msg.payload as { clientCount?: number } | undefined;
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
          const bytes = Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0));
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

    return () => {
      ws.close();
      wsRef.current = null;
      incomingBlobPartsRef.current = {};
    };
  }, [roomId, clientId, reconnectKey, t]);

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
    }),
    [status, errorMessage, clientCount, toasts, transfers, textShares, chatMessages, sendJson, handleFiles, handleSendText, sendChatMessage, handleRetry, clientId],
  );
}
