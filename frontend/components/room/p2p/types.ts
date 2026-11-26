import type { Transfer } from "../room-utils";

// Small files stay in memory. Anything larger must be streamed to disk when the
// browser supports it; the cap is aggregate across all retained blobs.
export const MEMORY_LIMIT_BYTES = 100 * 1024 * 1024;

// Hard ceiling for a single file, independent of what the browser can save.
export const MAX_FILE_BYTES = 3 * 1024 * 1024 * 1024;

export type PeerTransferStatus =
  | "queued"
  | "offered"
  | "connecting"
  | "transferring"
  | "paused"
  | "reconnecting"
  | "completed"
  | "cancelled"
  | "error";

export type PeerConnectionType = "direct" | "relay" | "unknown";

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

export interface PeerTransfer extends Transfer {
  peerId: string;
  peerName: string;
  status: PeerTransferStatus;
  connectionType: PeerConnectionType;
  bytesTransferred: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  error?: string;
  errorCode?: TransferErrorCode;
  retryable?: boolean;
  savedToDisk?: boolean;
}

// Signaling rides on the room WebSocket: { to, signal } one way, { from, signal }
// the other. Only these two shapes are accepted.
export type PeerSignal =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit | null };

export interface PeerTransferManagerOptions {
  clientId: string;
  autoReceive?: boolean;
  sendSignal: (to: string, signal: PeerSignal) => void;
  getIceServers: () => Promise<RTCIceServer[]>;
  onTransfer: (transfer: PeerTransfer) => void;
  onError: (error: string) => void;
  // Test-only knobs. The app never sets these.
  internal?: {
    memoryLimitBytes?: number;
    iceRefreshMs?: number;
  };
}

export function supportsDiskSaving(): boolean {
  const scope = globalThis as {
    showSaveFilePicker?: unknown;
    isSecureContext?: boolean;
  };
  return (
    typeof scope.showSaveFilePicker === "function" &&
    scope.isSecureContext !== false
  );
}
