export type TransferDirection = "incoming" | "outgoing";

export interface Transfer {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number;
  direction: TransferDirection;
  url?: string;
}

export interface TextShare {
  id: string;
  text: string;
  timestamp: number;
  customName?: string;
  direction: TransferDirection;
}

const CHUNK_SIZE = 64 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getDefaultWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8080/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function getWsUrl(roomId: string, clientId: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? getDefaultWsUrl();
  const url = new URL(base);
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("clientId", clientId);
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

export function getTransferState(transfer: Transfer): string {
  if (transfer.progress >= 100) {
    return transfer.direction === "outgoing" ? "Sent" : "Received";
  }
  return transfer.direction === "outgoing" ? "Sending" : "Receiving";
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

const CHAR_BATCH_SIZE = 8192;

export async function encodeFileToChunks(
  file: File,
  onChunk: (chunk: string, offset: number, final: boolean) => void,
  onProgress: (progress: number) => void,
): Promise<void> {
  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buf = new Uint8Array(await slice.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.byteLength; i += CHAR_BATCH_SIZE) {
      binary += String.fromCharCode(
        ...buf.subarray(i, Math.min(i + CHAR_BATCH_SIZE, buf.byteLength)),
      );
    }
    const b64 = btoa(binary);
    const isFinal = offset + CHUNK_SIZE >= file.size;
    onChunk(b64, offset, isFinal);
    offset += CHUNK_SIZE;
    const progress = file.size > 0 ? Math.min(100, Math.round((offset / file.size) * 100)) : 0;
    onProgress(progress);
  }
}

export function encodeBinaryToString(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.byteLength; i += CHAR_BATCH_SIZE) {
    binary += String.fromCharCode(
      ...buf.subarray(i, Math.min(i + CHAR_BATCH_SIZE, buf.byteLength)),
    );
  }
  return btoa(binary);
}

export { textEncoder, textDecoder };
