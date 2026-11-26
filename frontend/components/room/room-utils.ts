import { containsProfanity } from "../../lib/profanity";

export type TransferDirection = "incoming" | "outgoing";

export type TransferStatus =
  | "queued"
  | "offered"
  | "connecting"
  | "transferring"
  | "paused"
  | "reconnecting"
  | "completed"
  | "cancelled"
  | "error";

export type ConnectionType = "direct" | "relay" | "unknown";

export type TransferErrorCode =
  | "checksum"
  | "write"
  | "disk"
  | "size"
  | "protocol"
  | "connection"
  | "source"
  | "cancelled"
  | "unknown";

export interface Transfer {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number;
  direction: TransferDirection;
  url?: string;
  // Peer-transfer details; text-only and older UI fixtures may omit them.
  peerId?: string;
  peerName?: string;
  connectionType?: ConnectionType;
  status?: TransferStatus;
  bytesTransferred?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  error?: string;
  errorCode?: TransferErrorCode;
  retryable?: boolean;
  savedToDisk?: boolean;
}

export interface TextShare {
  id: string;
  text: string;
  timestamp: number;
  customName?: string;
  direction: TransferDirection;
}

// chat message sent between peers in a room
export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function getWsUrl(roomId: string, clientId: string, token: string): string {
  let base = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (!base) {
    const local = typeof window === "undefined" || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (!local) throw new Error("NEXT_PUBLIC_SIGNALING_URL is not configured");
    base = "ws://localhost:8788/ws";
  }
  const url = new URL(base);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Signaling requires a WebSocket URL");
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function decodeWsData(data: MessageEvent["data"]): Promise<string | null> {
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

export function formatSize(size: number): string {
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

export function generateFileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateChatId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export { textEncoder, textDecoder };

const CHAT_NAMES = [
  "Aki", "Ken", "Yuki", "Ryo", "Mai", "Jun", "Sho", "Taro", "Rei", "Miki",
  "Riku", "Hina", "Momo", "Sora", "Kaito", "Haru", "Nao", "Yuto", "Rin", "Aoi",
  "Ren", "Eri", "Taku", "Risa", "Mari",
];

export function getChatName(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  }
  return CHAT_NAMES[Math.abs(hash) % CHAT_NAMES.length];
}

export function generateRoomId(): string {
  let id: string;
  do {
    id = Math.random().toString(36).slice(2, 8);
  } while (containsProfanity(id));
  return id;
}
