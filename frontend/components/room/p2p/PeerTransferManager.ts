import { getChatName } from "../room-utils";
import { remainingSeconds, sampleSpeed } from "./transfer-metrics";
import type { SpeedSample } from "./transfer-metrics";
import { MAX_FILE_BYTES, MEMORY_LIMIT_BYTES, supportsDiskSaving } from "./types";
import type {
  PeerConnectionType,
  PeerSignal,
  PeerTransfer,
  PeerTransferManagerOptions,
  PeerTransferStatus,
} from "./types";

const DATA_CHANNEL_LABEL = "holo-file";
const CHUNK_BYTES = 32 * 1024;
const MAX_CHUNK_BYTES = 64 * 1024;
const MAX_FILE_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 255;
const MAX_MIME_LENGTH = 255;
const MAX_PEER_ID_LENGTH = 128;
const MAX_CONTROL_CHARS = 8192;
const MAX_SDP_LENGTH = 128 * 1024;
const MAX_CANDIDATE_LENGTH = 4096;
const MAX_INBOUND_QUEUE = 256;
// Unaccepted offers are the only records a peer can create without the
// receiver agreeing, so this bounds what a hostile peer can make us hold.
export const MAX_PENDING_INBOUND = 64;
const MAX_PENDING_CANDIDATES = 64;
const WINDOW_BYTES = 512 * 1024;
const BUFFER_LOW_BYTES = 128 * 1024;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;
const DISCONNECT_GRACE_MS = 3000;
const SETUP_TIMEOUT_MS = 10000;
// TURN credentials are handed out with a 600s TTL; refresh well before that.
const ICE_REFRESH_MS = 4 * 60 * 1000;
const EMIT_INTERVAL_MS = 100;
const METRICS_TICK_MS = 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type Direction = "incoming" | "outgoing";
type SinkKind = "memory" | "disk";

interface DiskWritable {
  write(input: {
    type: "write";
    position?: number;
    data: Uint8Array;
  }): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

interface DiskHandle {
  createWritable(): Promise<DiskWritable>;
}

type SaveFilePicker = (options: {
  suggestedName?: string;
}) => Promise<DiskHandle>;

interface Sink {
  readonly kind: SinkKind;
  readonly url?: string;
  write(offset: number, data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

class MemorySink implements Sink {
  readonly kind: SinkKind = "memory";
  private chunks: Uint8Array<ArrayBuffer>[] = [];
  private length = 0;
  private finalUrl: string | undefined;

  constructor(private readonly size: number) {}

  get url(): string | undefined {
    return this.finalUrl;
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    if (offset !== this.length) throw new Error("out-of-order write");
    if (data.byteLength > 0) this.chunks.push(new Uint8Array(data));
    this.length += data.byteLength;
  }

  async close(): Promise<void> {
    if (this.length !== this.size) throw new Error("size mismatch");
    this.finalUrl = URL.createObjectURL(new Blob(this.chunks));
    this.chunks = [];
  }

  async abort(): Promise<void> {
    this.chunks = [];
    if (this.finalUrl) URL.revokeObjectURL(this.finalUrl);
    this.finalUrl = undefined;
  }
}

class DiskSink implements Sink {
  readonly kind: SinkKind = "disk";
  readonly url = undefined;
  private closed = false;

  constructor(private readonly writable: DiskWritable) {}

  async write(offset: number, data: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("sink already closed");
    if (data.byteLength === 0) return;
    await this.writable.write({ type: "write", position: offset, data });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.writable.close();
  }

  async abort(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.writable.abort?.();
    } catch {
      // Already broken; nothing else to release.
    }
  }
}

interface TransferRecord {
  id: string;
  fileId: string;
  peerId: string;
  direction: Direction;
  name: string;
  size: number;
  mime: string;
  status: PeerTransferStatus;
  bytesTransferred: number;
  progress: number;
  connectionType: PeerConnectionType;
  url?: string;
  error?: string;
  savedToDisk?: boolean;
  // Sender side.
  file?: File;
  offset: number;
  ackedOffset: number;
  accepted: boolean;
  accepting?: boolean;
  pumping: boolean;
  pumpQueued: boolean;
  // Receiver side.
  sink?: Sink;
  finished: boolean;
  memoryHeld: number;
  // Bookkeeping.
  paused: boolean;
  localPaused?: boolean;
  remotePaused?: boolean;
  speed: SpeedSample | null;
  lastEmit: number;
  emitTimer: ReturnType<typeof setTimeout> | null;
  waiters: Array<() => void>;
}

interface PeerState {
  id: string;
  pc: RTCPeerConnection | null;
  pcInit: Promise<RTCPeerConnection | null> | null;
  channel: RTCDataChannel | null;
  candidates: RTCIceCandidateInit[];
  signalChain: Promise<void>;
  inboundChain: Promise<void>;
  queueLength: number;
  retries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  setupTimer: ReturnType<typeof setTimeout> | null;
  removed: boolean;
  connectionType: PeerConnectionType;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return (cleaned || "holo-file").slice(0, MAX_NAME_LENGTH);
}

function isSafeFileId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function progressOf(bytes: number, size: number): number {
  if (size <= 0) return 0;
  // 100% is only reported once the receiver confirmed completion.
  return Math.min(99, Math.floor((bytes / size) * 100));
}

function transferId(peerId: string, direction: Direction, fileId: string): string {
  return `${direction === "incoming" ? "in" : "out"}:${peerId}:${fileId}`;
}

function getSaveFilePicker(): SaveFilePicker | undefined {
  const scope = globalThis as { showSaveFilePicker?: unknown };
  return typeof scope.showSaveFilePicker === "function"
    ? (scope.showSaveFilePicker as SaveFilePicker)
    : undefined;
}

function parseCandidate(value: unknown): RTCIceCandidateInit | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  if (typeof value.candidate !== "string") return undefined;
  if (value.candidate.length > MAX_CANDIDATE_LENGTH) return undefined;
  return {
    candidate: value.candidate,
    sdpMid:
      typeof value.sdpMid === "string" ? value.sdpMid.slice(0, 256) : null,
    sdpMLineIndex:
      typeof value.sdpMLineIndex === "number" &&
      Number.isInteger(value.sdpMLineIndex)
        ? value.sdpMLineIndex
        : null,
    usernameFragment:
      typeof value.usernameFragment === "string"
        ? value.usernameFragment.slice(0, 256)
        : null,
  };
}

export class PeerTransferManager {
  private readonly options: PeerTransferManagerOptions;
  private readonly clientId: string;
  private readonly memoryLimit: number;
  private readonly iceRefreshMs: number;
  private readonly peers = new Map<string, PeerState>();
  private readonly records = new Map<string, TransferRecord>();
  private memoryUsed = 0;
  private iceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(options: PeerTransferManagerOptions) {
    if (!options || typeof options.clientId !== "string" || !options.clientId) {
      throw new Error("PeerTransferManager requires a clientId");
    }
    this.options = options;
    this.clientId = options.clientId;
    this.memoryLimit = Math.max(
      0,
      options.internal?.memoryLimitBytes ?? MEMORY_LIMIT_BYTES,
    );
    this.iceRefreshMs = Math.max(10, options.internal?.iceRefreshMs ?? ICE_REFRESH_MS);
  }

  setPeers(peerIds: string[]): void {
    if (this.destroyed || !Array.isArray(peerIds)) return;
    const next = new Set<string>();
    for (const id of peerIds) {
      if (typeof id !== "string" || !id || id.length > MAX_PEER_ID_LENGTH) continue;
      if (id !== this.clientId) next.add(id);
    }
    for (const peer of [...this.peers.values()]) {
      if (!next.has(peer.id)) this.removePeer(peer);
    }
    for (const id of next) {
      const existing = this.peers.get(id);
      if (existing) {
        if (existing.removed) {
          existing.removed = false;
          if (this.clientId < id) void this.enqueue(existing, () => this.connect(existing));
        } else if (
          this.clientId < id &&
          !existing.channel &&
          !existing.retryTimer &&
          !existing.pcInit &&
          !existing.setupTimer &&
          !existing.pc
        ) {
          // Room state came back after signaling was lost; restart setup.
          void this.enqueue(existing, () => this.connect(existing));
        }
        continue;
      }
      const peer = this.createPeer(id);
      // Lower id always initiates, so glare cannot happen.
      if (this.clientId < id) void this.enqueue(peer, () => this.connect(peer));
    }
  }

  sendFiles(files: File[], peerIds?: string[]): Promise<void> {
    if (this.destroyed || !Array.isArray(files) || files.length === 0) {
      return Promise.resolve();
    }
    const requested = Array.isArray(peerIds)
      ? peerIds.filter((id): id is string => typeof id === "string")
      : [...this.peers.keys()];
    const targets = [...new Set(requested)].filter(
      (id) => this.peers.has(id) && !this.peers.get(id)?.removed && id !== this.clientId,
    );
    if (targets.length === 0) {
      this.reportError("no peer is connected yet");
      return Promise.resolve();
    }
    for (const peerId of targets) {
      const peer = this.peers.get(peerId);
      if (!peer) continue;
      for (const file of files) {
        try {
          this.queueOutgoing(peer, file);
        } catch (error) {
          this.reportError(`${peerId}: ${errorMessage(error)}`);
        }
      }
    }
    return Promise.resolve();
  }

  handleSignal(from: string, signal: unknown): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (typeof from !== "string" || !from || from.length > MAX_PEER_ID_LENGTH) {
      return Promise.resolve();
    }
    if (from === this.clientId || !isObject(signal)) return Promise.resolve();
    const peer = this.peers.get(from) ?? this.createPeer(from);
    return this.enqueue(peer, () => this.applySignal(peer, signal));
  }

  pauseTransfer(id: string): void {
    const record = this.records.get(id);
    if (!record || record.paused || this.isTerminal(record)) return;
    record.localPaused = true;
    record.paused = true;
    record.status = "paused";
    this.wake(record);
    this.emit(record, true);
    const peer = this.peers.get(record.peerId);
    if (peer) this.sendControl(peer, { t: "pause", fileId: record.fileId });
  }

  resumeTransfer(id: string): void {
    const record = this.records.get(id);
    if (!record || (!record.paused && record.status !== "reconnecting") || this.isTerminal(record)) return;
    record.localPaused = false;
    record.remotePaused = false;
    record.paused = false;
    const peer = this.peers.get(record.peerId);
    const open = this.isChannelOpen(peer);
    record.status = open ? "transferring" : "reconnecting";
    this.wake(record);
    this.emit(record, true);
    if (!peer) return;
    if (!open && this.clientId < peer.id) {
      this.clearPeerTimers(peer);
      peer.retries = 0;
      this.scheduleReconnect(peer);
    }
    if (open) this.sendControl(peer, { t: "resume", fileId: record.fileId });
    if (record.direction === "outgoing" && record.accepted && open) {
      this.pump(peer, record);
    }
  }

  cancelTransfer(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    this.cancelRecord(record, true, "cancelled by user");
    // A cancelled offer frees its inbound slot, so a peer that was refused at
    // MAX_PENDING_INBOUND can be accepted again. Accepted records stay for the UI.
    if (record.direction === "incoming" && !record.accepted) {
      this.records.delete(record.id);
    }
  }

  acceptTransfer(id: string): Promise<void> {
    const record = this.records.get(id);
    if (
      this.destroyed ||
      !record ||
      record.direction !== "incoming" ||
      record.accepted ||
      record.accepting ||
      record.finished ||
      record.status === "cancelled" ||
      record.status === "error" ||
      record.status === "completed"
    ) {
      return Promise.resolve();
    }
    if (record.size > MAX_FILE_BYTES) {
      this.rejectIncoming(record, "file exceeds the maximum supported size");
      return Promise.resolve();
    }
    if (record.size <= this.memoryLimit - this.memoryUsed) {
      return this.acceptInMemory(record);
    }
    if (!supportsDiskSaving()) {
      this.rejectIncoming(
        record,
        "file is larger than the in-memory limit and this browser cannot save directly to disk",
      );
      return Promise.resolve();
    }
    record.accepting = true;
    record.status = "connecting";
    this.emit(record, true);
    return this.acceptOnDisk(record);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.iceRefreshTimer) {
      clearInterval(this.iceRefreshTimer);
      this.iceRefreshTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    for (const peer of this.peers.values()) {
      this.clearPeerTimers(peer);
      this.closePeerConnection(peer);
    }
    for (const record of this.records.values()) {
      this.releaseRecord(record);
    }
    this.peers.clear();
    this.records.clear();
  }

  // --- peer lifecycle -------------------------------------------------------

  private createPeer(id: string): PeerState {
    const peer: PeerState = {
      id,
      pc: null,
      pcInit: null,
      channel: null,
      candidates: [],
      signalChain: Promise.resolve(),
      inboundChain: Promise.resolve(),
      queueLength: 0,
      retries: 0,
      retryTimer: null,
      graceTimer: null,
      setupTimer: null,
      removed: false,
      connectionType: "unknown",
    };
    this.peers.set(id, peer);
    return peer;
  }

  private removePeer(peer: PeerState): void {
    if (peer.removed) return;
    peer.removed = true;
    this.clearPeerTimers(peer);
    this.closePeerConnection(peer);
    this.markPeerReconnecting(peer);
  }

  private clearPeerTimers(peer: PeerState): void {
    if (peer.retryTimer) {
      clearTimeout(peer.retryTimer);
      peer.retryTimer = null;
    }
    if (peer.graceTimer) {
      clearTimeout(peer.graceTimer);
      peer.graceTimer = null;
    }
    this.clearSetupTimer(peer);
  }

  private clearSetupTimer(peer: PeerState): void {
    if (!peer.setupTimer) return;
    clearTimeout(peer.setupTimer);
    peer.setupTimer = null;
  }

  private startSetupTimer(peer: PeerState, responder: boolean): void {
    this.clearSetupTimer(peer);
    peer.setupTimer = setTimeout(() => {
      peer.setupTimer = null;
      if (this.destroyed || peer.removed) return;
      if (peer.channel?.readyState === "open") return;
      if (responder) {
        // Drop the half-open attempt; the initiator will send a fresh offer.
        this.closePeerConnection(peer);
      } else {
        this.scheduleReconnect(peer);
      }
    }, SETUP_TIMEOUT_MS);
  }

  private async connect(peer: PeerState): Promise<void> {
    if (this.destroyed || peer.removed) return;
    if (this.clientId > peer.id) return; // responder waits for the offer
    const pc = await this.ensurePc(peer);
    if (!pc || this.destroyed || peer.removed) return;
    if (peer.channel) return;
    this.startSetupTimer(peer, false);
    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    this.bindChannel(peer, channel);
    try {
      const offer = await pc.createOffer();
      if (peer.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (peer.pc !== pc) return;
      const description = pc.localDescription ?? offer;
      this.signal(peer.id, {
        description: { type: "offer", sdp: description.sdp ?? "" },
      });
    } catch (error) {
      if (peer.pc === pc) {
        this.reportError(`${peer.id}: could not start connection (${errorMessage(error)})`);
        this.scheduleReconnect(peer);
      }
    }
  }

  private async ensurePc(peer: PeerState): Promise<RTCPeerConnection | null> {
    if (peer.pc) return peer.pc;
    if (peer.pcInit) return peer.pcInit;
    const init = this.createPc(peer);
    peer.pcInit = init;
    try {
      return await init;
    } finally {
      if (peer.pcInit === init) peer.pcInit = null;
    }
  }

  private async createPc(peer: PeerState): Promise<RTCPeerConnection | null> {
    if (this.destroyed || peer.removed) return null;
    this.closePeerConnection(peer);
    let iceServers: RTCIceServer[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const fallback = new Promise<RTCIceServer[]>((resolve) => {
        timer = setTimeout(() => resolve([]), SETUP_TIMEOUT_MS);
      });
      iceServers = await Promise.race([
        this.options.getIceServers(),
        fallback,
      ]);
    } catch (error) {
      this.reportError(`${peer.id}: could not load ICE servers (${errorMessage(error)})`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (this.destroyed || peer.removed) return null;
    const pc = new RTCPeerConnection({ iceServers });
    peer.pc = pc;
    peer.candidates = [];
    this.wirePc(peer, pc);
    this.startIceRefresh();
    return pc;
  }

  private wirePc(peer: PeerState, pc: RTCPeerConnection): void {
    pc.onicecandidate = (event) => {
      if (peer.pc !== pc) return;
      const candidate =
        event.candidate && typeof event.candidate.toJSON === "function"
          ? event.candidate.toJSON()
          : null;
      this.signal(peer.id, { candidate });
    };
    pc.onconnectionstatechange = () => {
      if (peer.pc === pc) this.handleConnectionState(peer, pc);
    };
    pc.oniceconnectionstatechange = () => {
      if (peer.pc === pc) this.handleIceState(peer, pc);
    };
    pc.ondatachannel = (event) => {
      if (peer.pc === pc) this.bindChannel(peer, event.channel);
    };
  }

  private closePeerConnection(peer: PeerState): void {
    const channel = peer.channel;
    peer.channel = null;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Already closed.
      }
    }
    const pc = peer.pc;
    peer.pc = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch {
        // Already closed.
      }
    }
    peer.candidates = [];
    this.clearSetupTimer(peer);
    this.wakePeer(peer);
  }

  private bindChannel(peer: PeerState, channel: RTCDataChannel): void {
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES;
    channel.onopen = () => {
      if (peer.channel !== channel || this.destroyed) return;
      peer.retries = 0;
      this.clearGrace(peer);
      this.clearSetupTimer(peer);
      void this.updateConnectionType(peer);
      this.onChannelOpen(peer, channel);
    };
    channel.onclose = () => {
      if (peer.channel !== channel || this.destroyed) return;
      peer.channel = null;
      this.wakePeer(peer);
      this.scheduleReconnect(peer);
    };
    channel.onerror = () => {
      // onclose follows; scheduling there keeps this path idempotent.
    };
    channel.onmessage = (event) => this.onChannelMessage(peer, channel, event.data);
  }

  private onChannelOpen(peer: PeerState, channel: RTCDataChannel): void {
    if (this.destroyed || peer.channel !== channel) return;
    this.wakePeer(peer);
    // Both sides may own outgoing files; the shared channel reoffers all of them.
    for (const record of this.records.values()) {
      if (record.peerId !== peer.id || record.direction !== "outgoing") continue;
      if (this.isTerminal(record) || record.status === "queued") continue;
      this.sendControl(peer, {
        t: "offer",
        fileId: record.fileId,
        name: record.name,
        size: record.size,
        mime: record.mime,
        paused: record.localPaused === true,
      });
      if (!record.accepted && record.status === "reconnecting") {
        record.status = "offered";
        this.emit(record, true);
      }
    }
    this.advanceQueue(peer);
  }

  private handleConnectionState(peer: PeerState, pc: RTCPeerConnection): void {
    const state = pc.connectionState;
    if (state === "connected") {
      peer.retries = 0;
      this.clearGrace(peer);
      void this.updateConnectionType(peer);
      return;
    }
    if (state === "failed") {
      this.scheduleReconnect(peer);
      return;
    }
    if (state === "disconnected") {
      this.scheduleGrace(peer);
    }
  }

  private handleIceState(peer: PeerState, pc: RTCPeerConnection): void {
    const state = pc.iceConnectionState;
    if (state === "connected" || state === "completed") {
      peer.retries = 0;
      this.clearGrace(peer);
      return;
    }
    if (state === "failed") {
      this.scheduleReconnect(peer);
      return;
    }
    if (state === "disconnected") {
      this.scheduleGrace(peer);
    }
  }

  private scheduleGrace(peer: PeerState): void {
    if (this.destroyed || peer.removed || peer.graceTimer) return;
    peer.graceTimer = setTimeout(() => {
      peer.graceTimer = null;
      if (this.destroyed || peer.removed) return;
      const pc = peer.pc;
      const state = pc?.connectionState ?? "failed";
      if (state !== "connected") this.scheduleReconnect(peer);
    }, DISCONNECT_GRACE_MS);
  }

  private clearGrace(peer: PeerState): void {
    if (!peer.graceTimer) return;
    clearTimeout(peer.graceTimer);
    peer.graceTimer = null;
  }

  private scheduleReconnect(peer: PeerState): void {
    if (this.destroyed || peer.removed || peer.retryTimer) return;
    this.markPeerReconnecting(peer);
    if (this.clientId > peer.id) {
      // The responder drops its dead generation and waits for a fresh offer.
      this.closePeerConnection(peer);
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** peer.retries,
      RECONNECT_MAX_DELAY_MS,
    );
    // Cap the backoff, not the lifetime of the receive state. An outage longer
    // than a minute must still resume when the network returns in the same tab.
    peer.retries = Math.min(peer.retries + 1, MAX_RECONNECT_ATTEMPTS);
    peer.retryTimer = setTimeout(() => {
      peer.retryTimer = null;
      if (this.destroyed || peer.removed) return;
      // Drop the dead generation so the next offer starts clean.
      this.closePeerConnection(peer);
      void this.enqueue(peer, () => this.connect(peer));
    }, delay);
  }

  private markPeerReconnecting(peer: PeerState): void {
    for (const record of this.records.values()) {
      if (record.peerId !== peer.id || this.isTerminal(record) || record.status === "queued") continue;
      // A replacement channel must obtain a fresh receiver offset before any
      // old pump or explicit Resume can send more bytes.
      if (record.direction === "outgoing") record.accepted = false;
      if (record.paused) continue;
      if (record.status !== "reconnecting") {
        record.status = "reconnecting";
        this.emit(record, true);
      }
    }
  }

  private failPeer(peer: PeerState, message: string): void {
    this.clearPeerTimers(peer);
    this.closePeerConnection(peer);
    for (const record of this.records.values()) {
      if (record.peerId === peer.id && !this.isTerminal(record)) {
        this.failRecord(record, message);
      }
    }
    this.reportError(`${peer.id}: ${message}`);
  }

  private signal(to: string, signal: PeerSignal): void {
    try {
      this.options.sendSignal(to, signal);
    } catch (error) {
      this.reportError(`could not send signal (${errorMessage(error)})`);
    }
  }

  private enqueue(peer: PeerState, task: () => Promise<void>): Promise<void> {
    peer.signalChain = peer.signalChain
      .then(task)
      .catch((error) => this.reportError(`${peer.id}: ${errorMessage(error)}`));
    return peer.signalChain;
  }

  // --- signaling ------------------------------------------------------------

  private async applySignal(peer: PeerState, signal: unknown): Promise<void> {
    if (this.destroyed || peer.removed || !isObject(signal)) return;
    if ("description" in signal) {
      const description = signal.description;
      if (!isObject(description)) return;
      const type = description.type;
      if (type !== "offer" && type !== "answer") return;
      if (typeof description.sdp !== "string" || description.sdp.length > MAX_SDP_LENGTH) {
        return;
      }
      const init: RTCSessionDescriptionInit = { type, sdp: description.sdp };
      if (type === "offer") {
        // Only the lower client id offers; dropping glare keeps one session.
        if (this.clientId < peer.id) return;
        // Offers represent a fresh connection attempt, not renegotiation of the
        // old file channel. A closed PC must never receive the replacement SDP.
        if (peer.pc && (peer.pc.remoteDescription || peer.pc.connectionState === "closed" || peer.pc.connectionState === "failed")) {
          this.closePeerConnection(peer);
        }
        const pc = await this.ensurePc(peer);
        if (!pc || peer.pc !== pc) return;
        await pc.setRemoteDescription(init);
        if (peer.pc !== pc) return;
        await this.flushCandidates(peer, pc);
        const answer = await pc.createAnswer();
        if (peer.pc !== pc) return;
        await pc.setLocalDescription(answer);
        if (peer.pc !== pc) return;
        this.signal(peer.id, {
          description: {
            type: "answer",
            sdp: pc.localDescription?.sdp ?? answer.sdp ?? "",
          },
        });
        this.startSetupTimer(peer, true);
        return;
      }
      const pc = peer.pc;
      if (!pc) return;
      await pc.setRemoteDescription(init);
      if (peer.pc !== pc) return;
      await this.flushCandidates(peer, pc);
      peer.retries = 0;
      return;
    }
    if (!("candidate" in signal)) return;
    const candidate = parseCandidate(signal.candidate);
    if (candidate === undefined) return;
    const pc = peer.pc;
    if (!pc || !pc.remoteDescription) {
      if (candidate && peer.candidates.length < MAX_PENDING_CANDIDATES) {
        peer.candidates.push(candidate);
      }
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // Stale candidates for an older generation are expected.
    }
  }

  private async flushCandidates(
    peer: PeerState,
    pc: RTCPeerConnection,
  ): Promise<void> {
    const pending = peer.candidates;
    peer.candidates = [];
    for (const candidate of pending) {
      if (peer.pc !== pc) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Ignore candidates the browser rejects.
      }
    }
  }

  // --- connection metadata / ICE refresh -----------------------------------

  private async updateConnectionType(peer: PeerState): Promise<void> {
    const pc = peer.pc;
    if (!pc || typeof pc.getStats !== "function") return;
    let type: PeerConnectionType = "unknown";
    try {
      const stats = await pc.getStats();
      let pairId: string | undefined;
      stats.forEach((report: Record<string, unknown>) => {
        if (
          report.type === "candidate-pair" &&
          (report.selected === true || report.nominated === true) &&
          typeof report.id === "string"
        ) {
          pairId = pairId ?? report.id;
        }
        if (
          !pairId &&
          report.type === "transport" &&
          typeof report.selectedCandidatePairId === "string"
        ) {
          pairId = report.selectedCandidatePairId;
        }
      });
      if (pairId) {
        const pair = stats.get(pairId) as Record<string, unknown> | undefined;
        const local = pair && stats.get(String(pair.localCandidateId));
        const remote = pair && stats.get(String(pair.remoteCandidateId));
        const localRelay =
          local && (local as Record<string, unknown>).candidateType === "relay";
        const remoteRelay =
          remote && (remote as Record<string, unknown>).candidateType === "relay";
        if (localRelay || remoteRelay) type = "relay";
        else if (local && remote) type = "direct";
      }
    } catch {
      return;
    }
    if (peer.pc !== pc || type === "unknown" || peer.connectionType === type) return;
    peer.connectionType = type;
    for (const record of this.records.values()) {
      if (record.peerId !== peer.id || this.isTerminal(record)) continue;
      record.connectionType = type;
      this.emit(record, true);
    }
  }

  private startIceRefresh(): void {
    if (this.iceRefreshTimer || this.destroyed) return;
    this.iceRefreshTimer = setInterval(() => {
      void this.refreshIceServers();
    }, this.iceRefreshMs);
  }

  private async refreshIceServers(): Promise<void> {
    if (this.destroyed) {
      if (this.iceRefreshTimer) clearInterval(this.iceRefreshTimer);
      this.iceRefreshTimer = null;
      return;
    }
    const active = [...this.peers.values()].some((peer) => !peer.removed && peer.pc);
    if (!active) {
      if (this.iceRefreshTimer) clearInterval(this.iceRefreshTimer);
      this.iceRefreshTimer = null;
      return;
    }
    let iceServers: RTCIceServer[];
    try {
      iceServers = await this.options.getIceServers();
    } catch {
      return;
    }
    if (this.destroyed) return;
    for (const peer of this.peers.values()) {
      const pc = peer.pc;
      if (!pc || peer.removed || typeof pc.setConfiguration !== "function") continue;
      try {
        pc.setConfiguration({ iceServers });
      } catch {
        // Older browsers may refuse; the next reconnect fetches fresh servers.
      }
    }
  }

  // --- data channel traffic ------------------------------------------------

  private onChannelMessage(
    peer: PeerState,
    channel: RTCDataChannel,
    data: unknown,
  ): void {
    if (this.destroyed || peer.channel !== channel) return;
    if (peer.queueLength >= MAX_INBOUND_QUEUE) {
      this.failPeer(peer, "receive queue overflow");
      return;
    }
    peer.queueLength++;
    peer.inboundChain = peer.inboundChain
      .then(async () => {
        if (this.destroyed || peer.channel !== channel) return;
        if (typeof data === "string") {
          await this.handleControl(peer, data);
          return;
        }
        if (data instanceof ArrayBuffer) {
          await this.handleChunk(peer, data);
          return;
        }
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          await this.handleChunk(peer, await data.arrayBuffer());
        }
      })
      .catch((error) => {
        if (!this.destroyed) this.reportError(`${peer.id}: ${errorMessage(error)}`);
      })
      .finally(() => {
        peer.queueLength--;
      });
  }

  private async handleControl(peer: PeerState, raw: string): Promise<void> {
    if (raw.length > MAX_CONTROL_CHARS) return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isObject(message) || typeof message.t !== "string") return;
    const fileId = message.fileId;
    if (typeof fileId !== "string" || !isSafeFileId(fileId)) {
      return;
    }
    switch (message.t) {
      case "offer":
        this.handleOffer(peer, fileId, message);
        return;
      case "accept":
        this.handleAccept(peer, fileId, message.offset, message.paused);
        return;
      case "ack":
        this.handleAck(peer, fileId, message.offset);
        return;
      case "pause":
        this.handlePause(peer, fileId);
        return;
      case "resume":
        this.handleResume(peer, fileId);
        return;
      case "done":
        this.handleDone(peer, fileId);
        return;
      case "cancel":
        this.handleCancel(peer, fileId, message.reason);
        return;
      default:
        return;
    }
  }

  private pendingInbound(peer: PeerState): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.direction === "incoming" && record.peerId === peer.id && !record.accepted) {
        count += 1;
      }
    }
    return count;
  }

  private handleOffer(
    peer: PeerState,
    fileId: string,
    message: Record<string, unknown>,
  ): void {
    const size = message.size;
    const name = message.name;
    const mime = message.mime;
    if (
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > MAX_FILE_BYTES
    ) {
      return;
    }
    if (
      typeof name !== "string" ||
      !name ||
      name.length > MAX_NAME_LENGTH
    ) {
      return;
    }
    if (typeof mime !== "string" || mime.length > MAX_MIME_LENGTH) return;

    const key = transferId(peer.id, "incoming", fileId);
    const existing = this.records.get(key);
    if (existing) {
      if (
        existing.size !== size ||
        existing.name !== name ||
        existing.mime !== mime
      ) {
        this.failRecord(existing, "peer sent inconsistent file metadata");
        this.sendControl(peer, { t: "cancel", fileId, reason: "inconsistent metadata" });
        return;
      }
      if (existing.status === "cancelled" || existing.status === "error") {
        this.sendControl(peer, { t: "cancel", fileId });
        return;
      }
      if (existing.accepted) {
        if (!existing.sink && existing.status !== "completed") {
          this.failRecord(existing, "receive state was lost");
          return;
        }
        existing.remotePaused = message.paused === true;
        existing.paused = existing.localPaused === true || existing.remotePaused;
        existing.status = existing.paused ? "paused" : existing.finished ? "completed" : "transferring";
        this.emit(existing, true);
        this.sendControl(peer, {
          t: "accept",
          fileId,
          offset: existing.bytesTransferred,
          paused: existing.localPaused === true,
        });
      }
      return;
    }

    if (!supportsDiskSaving() && size > this.memoryLimit) {
      this.sendControl(peer, {
        t: "cancel",
        fileId,
        reason: "file too large for this receiver",
      });
      this.reportError(
        `${peer.id}: "${name}" is too large for memory and disk saving is unavailable`,
      );
      return;
    }

    if (this.pendingInbound(peer) >= MAX_PENDING_INBOUND) {
      this.sendControl(peer, {
        t: "cancel",
        fileId,
        reason: "too many pending transfers",
      });
      this.reportError(`${peer.id}: too many pending transfers`);
      return;
    }

    const record: TransferRecord = {
      id: transferId(peer.id, "incoming", fileId),
      fileId,
      peerId: peer.id,
      direction: "incoming",
      name,
      size,
      mime,
      status: "offered",
      bytesTransferred: 0,
      progress: 0,
      connectionType: peer.connectionType,
      offset: 0,
      ackedOffset: 0,
      accepted: false,
      pumping: false,
      pumpQueued: false,
      finished: false,
      memoryHeld: 0,
      paused: false,
      speed: null,
      lastEmit: 0,
      emitTimer: null,
      waiters: [],
    };
    this.records.set(record.id, record);
    if (this.options.autoReceive && record.size <= this.memoryLimit - this.memoryUsed) {
      void this.acceptInMemory(record);
    } else {
      this.emit(record, true);
    }
  }

  private handleAccept(peer: PeerState, fileId: string, offset: unknown, paused?: unknown): void {
    const record = this.records.get(transferId(peer.id, "outgoing", fileId));
    if (!record || this.isTerminal(record) || record.status === "queued") return;
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > record.size ||
      offset > record.offset
    ) {
      this.failRecord(record, "peer reported an invalid resume offset");
      return;
    }
    if (offset < record.ackedOffset) {
      this.failRecord(record, "peer resume offset is behind confirmed data");
      return;
    }
    record.accepted = true;
    record.remotePaused = paused === true;
    record.paused = record.localPaused === true || record.remotePaused;
    record.ackedOffset = offset;
    record.offset = offset;
    record.bytesTransferred = offset;
    record.progress = progressOf(offset, record.size);
    if (record.paused) {
      record.status = "paused";
      this.emit(record, true);
      return;
    }
    record.status = "transferring";
    this.emit(record, true);
    this.pump(peer, record);
  }

  private handleAck(peer: PeerState, fileId: string, offset: unknown): void {
    const record = this.records.get(transferId(peer.id, "outgoing", fileId));
    if (!record || this.isTerminal(record)) return;
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > record.size ||
      offset > record.offset
    ) {
      this.failRecord(record, "peer sent an invalid acknowledgement");
      return;
    }
    if (offset < record.ackedOffset) return; // Stale ack from an older session.
    record.ackedOffset = offset;
    record.bytesTransferred = offset;
    record.progress = progressOf(offset, record.size);
    if (record.status === "offered" || record.status === "reconnecting") {
      record.status = record.paused ? "paused" : "transferring";
      this.emit(record, true);
    } else {
      this.emit(record);
    }
    this.wake(record);
  }

  private handleDone(peer: PeerState, fileId: string): void {
    const record = this.records.get(transferId(peer.id, "outgoing", fileId));
    if (!record || this.isTerminal(record)) return;
    if (record.offset !== record.size) {
      this.failRecord(record, "peer confirmed a file before it was sent");
      return;
    }
    record.bytesTransferred = record.size;
    record.ackedOffset = record.size;
    record.offset = record.size;
    record.progress = 100;
    record.status = "completed";
    record.accepted = true;
    this.releaseFile(record);
    this.wake(record);
    this.emit(record, true);
  }

  private handlePause(peer: PeerState, fileId: string): void {
    for (const direction of ["incoming", "outgoing"] as const) {
      const record = this.records.get(transferId(peer.id, direction, fileId));
      if (!record || this.isTerminal(record) || record.paused) continue;
      record.remotePaused = true;
      record.paused = true;
      record.status = "paused";
      this.wake(record);
      this.emit(record, true);
    }
  }

  private handleResume(peer: PeerState, fileId: string): void {
    for (const direction of ["incoming", "outgoing"] as const) {
      const record = this.records.get(transferId(peer.id, direction, fileId));
      if (!record || this.isTerminal(record) || !record.paused) continue;
      record.localPaused = false;
      record.remotePaused = false;
      record.paused = false;
      const open = this.isChannelOpen(peer);
      record.status = open ? "transferring" : "reconnecting";
      this.emit(record, true);
      if (direction === "outgoing" && record.accepted && open) {
        this.pump(peer, record);
      }
    }
  }

  private handleCancel(
    peer: PeerState,
    fileId: string,
    reason: unknown,
  ): void {
    const message =
      typeof reason === "string" && reason.length <= 200 ? reason : undefined;
    for (const direction of ["incoming", "outgoing"] as const) {
      const record = this.records.get(transferId(peer.id, direction, fileId));
      if (!record || this.isTerminal(record)) continue;
      record.paused = false;
      record.error = message;
      record.status = "cancelled";
      this.releaseRecord(record);
      this.emit(record, true);
    }
  }

  private sendControl(peer: PeerState, message: Record<string, unknown>): boolean {
    const channel = peer.channel;
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private isChannelOpen(peer: PeerState | undefined): boolean {
    return !!peer?.channel && peer.channel.readyState === "open";
  }

  // --- outgoing transfers ---------------------------------------------------

  private queueOutgoing(peer: PeerState, file: File): void {
    if (
      !file ||
      typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      typeof file.name !== "string" ||
      typeof file.slice !== "function"
    ) {
      throw new Error("invalid file");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds the ${MAX_FILE_BYTES} byte limit`);
    }
    if (this.destroyed) return;
    const fileId = randomId();
    const record: TransferRecord = {
      id: transferId(peer.id, "outgoing", fileId),
      fileId,
      peerId: peer.id,
      direction: "outgoing",
      name: (file.name || "file").slice(0, MAX_NAME_LENGTH),
      size: file.size,
      mime: (file.type || "application/octet-stream").slice(0, MAX_MIME_LENGTH),
      status: "queued",
      bytesTransferred: 0,
      progress: 0,
      connectionType: peer.connectionType,
      file,
      offset: 0,
      ackedOffset: 0,
      accepted: false,
      pumping: false,
      pumpQueued: false,
      finished: false,
      memoryHeld: 0,
      paused: false,
      speed: null,
      lastEmit: 0,
      emitTimer: null,
      waiters: [],
    };
    this.records.set(record.id, record);
    this.emit(record, true);
    this.advanceQueue(peer);
  }

  private advanceQueue(peer: PeerState): void {
    if (this.destroyed || peer.removed || !this.isChannelOpen(peer)) return;
    const next = [...this.records.values()].find(
      (record) => record.peerId === peer.id && record.direction === "outgoing" && !this.isTerminal(record),
    );
    if (!next || next.status !== "queued") return;
    next.status = "offered";
    this.emit(next, true);
    this.sendControl(peer, {
      t: "offer",
      fileId: next.fileId,
      name: next.name,
      size: next.size,
      mime: next.mime,
    });
  }

  private pump(peer: PeerState, record: TransferRecord): void {
    if (record.direction !== "outgoing") return;
    if (record.pumping) {
      record.pumpQueued = true;
      return;
    }
    const channel = peer.channel;
    const file = record.file;
    if (!channel || channel.readyState !== "open" || !file) return;
    const chunkSize = this.chunkSizeFor(peer, record.fileId);
    if (chunkSize <= 0) {
      this.failRecord(record, "data channel message limit is too small");
      return;
    }
    const windowBytes = Math.max(WINDOW_BYTES, chunkSize * 4);
    record.pumping = true;
    record.pumpQueued = false;

    void (async () => {
      try {
        while (!this.destroyed) {
          if (record.paused || record.status !== "transferring") break;
          if (peer.channel !== channel || channel.readyState !== "open") break;
          if (record.offset < record.size) {
            if (record.offset - record.ackedOffset >= windowBytes) {
              await this.wait(record);
              continue;
            }
            if (channel.bufferedAmount > BUFFER_LOW_BYTES) {
              await this.waitForDrain(channel);
              continue;
            }
          }
          const start = record.offset;
          const end = Math.min(record.size, start + chunkSize);
          const final = end >= record.size;
          const data = new Uint8Array(await file.slice(start, end).arrayBuffer());
          if (
            this.destroyed ||
            record.paused ||
            record.status !== "transferring" ||
            peer.channel !== channel ||
            channel.readyState !== "open" ||
            record.offset !== start
          ) {
            break;
          }
          if (data.byteLength !== end - start) {
            throw new Error("file changed while sending");
          }
          const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", data),
          );
          if (
            this.destroyed ||
            record.paused ||
            record.status !== "transferring" ||
            peer.channel !== channel ||
            channel.readyState !== "open" ||
            record.offset !== start
          ) {
            break;
          }
          channel.send(this.encodeChunk(record.fileId, start, final, digest, data));
          record.offset = end;
          if (final) break;
        }
      } catch (error) {
        if (
          !this.destroyed &&
          peer.channel === channel &&
          channel.readyState === "open"
        ) {
          this.failRecord(record, errorMessage(error));
        }
      } finally {
        record.pumping = false;
        if (
          record.pumpQueued &&
          !this.destroyed &&
          record.status === "transferring" &&
          !record.paused
        ) {
          record.pumpQueued = false;
          this.pump(peer, record);
        }
      }
    })();
  }

  private chunkSizeFor(peer: PeerState, fileId: string): number {
    const maxMessage = peer.pc?.sctp?.maxMessageSize;
    const limit =
      typeof maxMessage === "number" && Number.isFinite(maxMessage) && maxMessage > 0
        ? maxMessage
        : MAX_CHUNK_BYTES;
    const payload = Math.min(CHUNK_BYTES, limit - (42 + fileId.length));
    if (!Number.isFinite(payload) || payload < 1) return 0;
    return Math.min(payload, MAX_CHUNK_BYTES);
  }

  private encodeChunk(
    fileId: string,
    offset: number,
    final: boolean,
    digest: Uint8Array,
    data: Uint8Array,
  ): ArrayBuffer {
    const id = textEncoder.encode(fileId);
    const header = 42 + id.byteLength;
    const frame = new ArrayBuffer(header + data.byteLength);
    const view = new DataView(frame);
    view.setUint8(0, final ? 1 : 0);
    view.setUint8(1, id.byteLength);
    new Uint8Array(frame, 2, id.byteLength).set(id);
    view.setBigUint64(2 + id.byteLength, BigInt(offset));
    new Uint8Array(frame, 10 + id.byteLength, 32).set(digest);
    new Uint8Array(frame, header).set(data);
    return frame;
  }

  private wait(record: TransferRecord): Promise<void> {
    return new Promise((resolve) => record.waiters.push(resolve));
  }

  private wake(record: TransferRecord): void {
    const waiters = record.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  private wakePeer(peer: PeerState): void {
    for (const record of this.records.values()) {
      if (record.peerId === peer.id) this.wake(record);
    }
  }

  private waitForDrain(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        channel.removeEventListener("bufferedamountlow", finish);
        channel.removeEventListener("close", finish);
        resolve();
      };
      channel.addEventListener("bufferedamountlow", finish);
      channel.addEventListener("close", finish);
    });
  }

  // --- incoming chunks ------------------------------------------------------

  private async handleChunk(peer: PeerState, buffer: ArrayBuffer): Promise<void> {
    if (buffer.byteLength < 42) return;
    const view = new DataView(buffer);
    const final = (view.getUint8(0) & 1) === 1;
    const idLength = view.getUint8(1);
    if (idLength < 1 || idLength > MAX_FILE_ID_LENGTH) return;
    const header = 42 + idLength;
    if (buffer.byteLength < header) return;
    const fileId = textDecoder.decode(new Uint8Array(buffer, 2, idLength));
    if (!isSafeFileId(fileId)) return;
    const record = this.records.get(transferId(peer.id, "incoming", fileId));
    if (!record || record.direction !== "incoming") return;
    if (record.finished) {
      // The completion frame may have been lost across a reoffer.
      this.sendControl(peer, { t: "ack", fileId, offset: record.bytesTransferred });
      this.sendControl(peer, { t: "done", fileId });
      return;
    }
    if (!record.accepted || !record.sink) return;
    if (record.status === "cancelled" || record.status === "error") return;

    let offset: number;
    try {
      offset = Number(view.getBigUint64(2 + idLength));
    } catch {
      return;
    }
    const digest = new Uint8Array(buffer, 10 + idLength, 32);
    const payload = new Uint8Array(buffer, header);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > record.size ||
      payload.byteLength > MAX_CHUNK_BYTES ||
      offset + payload.byteLength > record.size
    ) {
      this.failRecord(record, "invalid chunk geometry");
      return;
    }

    if (offset < record.bytesTransferred) {
      if (offset + payload.byteLength <= record.bytesTransferred) {
        // Duplicate after a lost ack: already verified and written.
        this.sendControl(peer, {
          t: "ack",
          fileId,
          offset: record.bytesTransferred,
        });
        if (final && record.bytesTransferred === record.size) {
          await this.finishIncoming(peer, record);
        }
        return;
      }
      this.failRecord(record, "overlapping chunk");
      return;
    }
    if (offset !== record.bytesTransferred) {
      this.failRecord(record, "chunk gap");
      return;
    }
    if (payload.byteLength === 0 && !final) {
      this.failRecord(record, "empty non-final chunk");
      return;
    }

    const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
    if (this.destroyed || this.isTerminal(record) || !record.sink) return;
    if (!equalBytes(actual, digest)) {
      this.failRecord(record, "checksum mismatch");
      return;
    }
    const sink = record.sink;
    try {
      if (payload.byteLength > 0) await sink.write(offset, payload);
    } catch (error) {
      this.failRecord(record, `write failed (${errorMessage(error)})`);
      return;
    }
    if (this.destroyed || this.isTerminal(record) || record.sink !== sink) return;
    record.bytesTransferred += payload.byteLength;
    record.progress = progressOf(record.bytesTransferred, record.size);
    if (!record.paused && record.status !== "transferring") {
      record.status = "transferring";
    }
    this.sendControl(peer, {
      t: "ack",
      fileId,
      offset: record.bytesTransferred,
    });
    this.emit(record, record.status === "transferring" && record.bytesTransferred === record.size);
    if (final) {
      if (record.bytesTransferred !== record.size) {
        this.failRecord(record, "final size mismatch");
        return;
      }
      await this.finishIncoming(peer, record);
    }
  }

  private async finishIncoming(
    peer: PeerState,
    record: TransferRecord,
  ): Promise<void> {
    if (record.finished) {
      this.sendControl(peer, { t: "done", fileId: record.fileId });
      return;
    }
    const sink = record.sink;
    if (!sink) return;
    try {
      // The sink must close before the sender is told the file is complete.
      await sink.close();
    } catch (error) {
      this.failRecord(record, `could not finalize file (${errorMessage(error)})`);
      return;
    }
    if (this.destroyed || this.isTerminal(record) || record.sink !== sink) {
      await sink.abort();
      return;
    }
    record.sink = undefined;
    record.finished = true;
    record.status = "completed";
    record.progress = 100;
    record.bytesTransferred = record.size;
    record.savedToDisk = sink.kind === "disk";
    if (sink.url) record.url = sink.url;
    this.sendControl(peer, { t: "ack", fileId: record.fileId, offset: record.size });
    this.sendControl(peer, { t: "done", fileId: record.fileId });
    this.emit(record, true);
  }

  // --- receiver acceptance --------------------------------------------------

  private acceptInMemory(record: TransferRecord): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.memoryUsed += record.size;
    record.memoryHeld = record.size;
    record.sink = new MemorySink(record.size);
    record.accepted = true;
    this.confirmAccept(record);
    return Promise.resolve();
  }

  private acceptOnDisk(record: TransferRecord): Promise<void> {
    const picker = getSaveFilePicker();
    if (!picker) {
      this.rejectIncoming(record, "disk saving is not available");
      return Promise.resolve();
    }
    let picked: Promise<DiskHandle>;
    try {
      // Called in the click handler before any await so the gesture is valid.
      picked = Promise.resolve(picker({ suggestedName: safeFileName(record.name) }));
    } catch (error) {
      this.rejectIncoming(record, `could not open the save dialog (${errorMessage(error)})`);
      return Promise.resolve();
    }
    return this.attachDiskSink(record, picked);
  }

  private async attachDiskSink(
    record: TransferRecord,
    picked: Promise<DiskHandle>,
  ): Promise<void> {
    try {
      const handle = await picked;
      if (
        this.destroyed ||
        record.status === "cancelled" ||
        record.status === "error" ||
        record.accepted
      ) {
        return;
      }
      const writable = await handle.createWritable();
      if (this.destroyed || this.isTerminal(record) || record.accepted) {
        try {
          await writable.abort?.();
        } catch {
          // Nothing to release.
        }
        return;
      }
      record.sink = new DiskSink(writable);
      record.accepted = true;
      record.savedToDisk = true;
      this.confirmAccept(record);
    } catch (error) {
      if (this.destroyed) return;
      if (record.status === "cancelled") return;
      this.failRecord(record, `could not open the save file (${errorMessage(error)})`);
    } finally {
      record.accepting = false;
    }
  }

  private confirmAccept(record: TransferRecord): void {
    const peer = this.peers.get(record.peerId);
    const open = this.isChannelOpen(peer);
    record.status = record.paused
      ? "paused"
      : open
        ? "transferring"
        : "reconnecting";
    this.emit(record, true);
    if (peer && open) {
      this.sendControl(peer, {
        t: "accept",
        fileId: record.fileId,
        offset: record.bytesTransferred,
        paused: record.localPaused === true,
      });
    }
  }

  private rejectIncoming(record: TransferRecord, message: string): void {
    this.failRecord(record, message);
    const peer = this.peers.get(record.peerId);
    if (peer) {
      this.sendControl(peer, {
        t: "cancel",
        fileId: record.fileId,
        reason: message.slice(0, 200),
      });
    }
  }

  // --- record state helpers -------------------------------------------------

  private isTerminal(record: TransferRecord): boolean {
    return (
      record.status === "completed" ||
      record.status === "cancelled" ||
      record.status === "error"
    );
  }

  private failRecord(record: TransferRecord, message: string): void {
    if (this.destroyed || record.status === "error" || record.status === "cancelled") {
      return;
    }
    record.paused = false;
    record.status = "error";
    record.error = message;
    const peer = this.peers.get(record.peerId);
    if (peer) {
      this.sendControl(peer, {
        t: "cancel",
        fileId: record.fileId,
        reason: message.slice(0, 200),
      });
    }
    this.releaseRecord(record);
    this.emit(record, true);
    this.reportError(`${record.peerId}: ${message}`);
  }

  private cancelRecord(
    record: TransferRecord,
    notifyPeer: boolean,
    reason: string,
  ): void {
    if (this.isTerminal(record)) {
      // Already terminal: cancel is a request to release retained resources.
      this.releaseRecord(record);
      return;
    }
    record.paused = false;
    record.status = "cancelled";
    if (notifyPeer) {
      const peer = this.peers.get(record.peerId);
      if (peer) {
        this.sendControl(peer, {
          t: "cancel",
          fileId: record.fileId,
          reason: reason.slice(0, 200),
        });
      }
    }
    this.releaseRecord(record);
    this.emit(record, true);
  }

  private releaseRecord(record: TransferRecord): void {
    if (record.emitTimer) {
      clearTimeout(record.emitTimer);
      record.emitTimer = null;
    }
    this.wake(record);
    const sink = record.sink;
    record.sink = undefined;
    if (sink) {
      void sink.abort().catch(() => {});
    }
    if (record.url) {
      try {
        URL.revokeObjectURL(record.url);
      } catch {
        // Already revoked.
      }
      record.url = undefined;
    }
    if (record.memoryHeld > 0) {
      this.memoryUsed = Math.max(0, this.memoryUsed - record.memoryHeld);
      record.memoryHeld = 0;
    }
    this.releaseFile(record);
  }

  private releaseFile(record: TransferRecord): void {
    record.file = undefined;
  }

  private emit(record: TransferRecord, force = false): void {
    if (this.destroyed) return;
    const now = Date.now();
    if (!force && now - record.lastEmit < EMIT_INTERVAL_MS) {
      // Keep the latest state visible without flooding the UI per chunk.
      if (!record.emitTimer) {
        record.emitTimer = setTimeout(() => {
          record.emitTimer = null;
          if (!this.destroyed) this.deliverTransfer(record);
        }, EMIT_INTERVAL_MS - (now - record.lastEmit));
      }
      return;
    }
    this.deliverTransfer(record);
    if (record.direction === "outgoing" && this.isTerminal(record)) {
      const peer = this.peers.get(record.peerId);
      if (peer) this.advanceQueue(peer);
    }
  }

  private deliverTransfer(record: TransferRecord): void {
    const now = Date.now();
    record.lastEmit = now;
    const active = record.status === "transferring" && !record.paused;
    // Resetting here means a pause, reconnect, or completion clears stale speed
    // instead of resuming a rate that was measured before the gap.
    record.speed = active
      ? sampleSpeed(record.speed, record.bytesTransferred, now)
      : null;
    const bytesPerSecond = Math.round(record.speed?.bytesPerSecond ?? 0);
    if (active) this.startMetricsTimer();
    const transfer: PeerTransfer = {
      id: record.id,
      name: record.name,
      size: record.size,
      mime: record.mime,
      progress: record.progress,
      direction: record.direction,
      url: record.url,
      peerId: record.peerId,
      peerName: getChatName(record.peerId),
      status: record.status,
      connectionType: record.connectionType,
      bytesTransferred: record.bytesTransferred,
      bytesPerSecond: bytesPerSecond > 0 ? bytesPerSecond : undefined,
      etaSeconds:
        bytesPerSecond > 0
          ? remainingSeconds(record.bytesTransferred, record.size, bytesPerSecond)
          : undefined,
      error: record.error,
      savedToDisk: record.savedToDisk,
    };
    try {
      this.options.onTransfer(transfer);
    } catch {
      // A consumer error must not break the transfer engine.
    }
  }

  private startMetricsTimer(): void {
    if (this.metricsTimer || this.destroyed) return;
    // Re-sampling while nothing arrives lets a stalled channel show zero speed
    // instead of freezing the last value.
    this.metricsTimer = setInterval(() => {
      let active = false;
      for (const record of this.records.values()) {
        if (record.status !== "transferring" || record.paused) continue;
        active = true;
        this.emit(record);
      }
      if (!active && this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }
    }, METRICS_TICK_MS);
  }

  private reportError(message: string): void {
    if (this.destroyed) return;
    try {
      this.options.onError(message);
    } catch {
      // Ignore consumer errors.
    }
  }
}
