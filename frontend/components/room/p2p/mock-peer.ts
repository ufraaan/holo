import type { PeerSignal } from "./types";

type Listener = () => void;

function copyData(data: string | ArrayBuffer): string | ArrayBuffer {
  return typeof data === "string" ? data : data.slice(0);
}

export class MockChannel {
  readyState: RTCDataChannelState = "connecting";
  binaryType = "arraybuffer";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  peer: MockChannel | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  readonly sent: Array<string | ArrayBuffer> = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly maxMessageSize: number) {}

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== "open") throw new Error("data channel is not open");
    const size = typeof data === "string" ? data.length : data.byteLength;
    if (size > this.maxMessageSize) {
      throw new Error(`message of ${size} bytes exceeds maxMessageSize`);
    }
    const target = this.peer;
    if (!target) throw new Error("data channel has no peer");
    const payload = copyData(data);
    this.sent.push(payload);
    queueMicrotask(() => {
      if (target.readyState === "open") target.onmessage?.({ data: payload });
    });
  }

  open(): void {
    if (this.readyState !== "connecting") return;
    this.readyState = "open";
    queueMicrotask(() => this.onopen?.({}));
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    queueMicrotask(() => {
      this.onclose?.({});
      for (const listener of [...(this.listeners.get("close") ?? [])]) listener();
    });
  }

  fail(): void {
    this.readyState = "closed";
    queueMicrotask(() => this.onclose?.({}));
  }
}

let pcSequence = 1;

interface MockManager {
  handleSignal(from: string, signal: unknown): Promise<void>;
}

export class MockNetwork {
  readonly managers = new Map<string, MockManager>();
  readonly maxMessageSize: number;
  readonly pending: Array<Promise<void>> = [];
  relay = false;
  readonly pcs = new Map<string, MockPeerConnection>();

  constructor(maxMessageSize = 65536) {
    this.maxMessageSize = maxMessageSize;
  }

  attach(clientId: string, manager: MockManager): void {
    this.managers.set(clientId, manager);
  }

  createPc(): MockPeerConnection {
    const pc = new MockPeerConnection(this);
    this.pcs.set(pc.id, pc);
    return pc;
  }

  deliver(from: string, to: string, signal: PeerSignal): void {
    if ("description" in signal) {
      const sdp = signal.description.sdp ?? "";
      const separator = sdp.indexOf(":");
      if (separator > 0) {
        const pc = this.pcs.get(sdp.slice(separator + 1));
        if (pc) {
          if (!pc.clientId) pc.clientId = from;
          if (pc.remotePcId) {
            const remote = this.pcs.get(pc.remotePcId);
            if (remote) {
              pc.remoteClientId = remote.clientId;
              remote.remoteClientId = pc.clientId;
            }
          }
        }
      }
    }
    const target = this.managers.get(to);
    if (!target) return;
    this.pending.push(target.handleSignal(from, signal));
  }

  pc(id: string): MockPeerConnection | undefined {
    return this.pcs.get(id);
  }

  channelOf(clientId: string): MockChannel {
    for (const pc of this.pcs.values()) {
      if (pc.clientId !== clientId) continue;
      const channel = pc.channels.find((item) => item.readyState === "open");
      if (channel) return channel;
    }
    throw new Error(`no open channel for ${clientId}`);
  }

  isOpen(clientId: string): boolean {
    try {
      this.channelOf(clientId);
      return true;
    } catch {
      return false;
    }
  }

  fail(from: string, to: string): void {
    for (const pc of this.pcs.values()) {
      if (
        (pc.clientId === from && pc.remoteClientId === to) ||
        (pc.clientId === to && pc.remoteClientId === from)
      ) {
        pc.fail();
      }
    }
  }

  async settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.allSettled(this.pending.splice(0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

export class MockPeerConnection {
  readonly id = `pc-${pcSequence++}`;
  readonly channels: MockChannel[] = [];
  readonly configurations: RTCConfiguration[] = [];
  readonly candidates: RTCIceCandidateInit[] = [];
  readonly sctp: { maxMessageSize: number };
  clientId = "";
  remoteClientId: string | null = null;
  remotePcId: string | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null;
  onconnectionstatechange: ((event: unknown) => void) | null = null;
  oniceconnectionstatechange: ((event: unknown) => void) | null = null;
  ondatachannel: ((event: { channel: MockChannel }) => void) | null = null;
  private failed = false;

  constructor(private readonly net: MockNetwork) {
    this.sctp = { maxMessageSize: net.maxMessageSize };
  }

  createDataChannel(): MockChannel {
    const channel = new MockChannel(this.net.maxMessageSize);
    this.channels.push(channel);
    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: `offer:${this.id}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: `answer:${this.id}` };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
    if (description.type === "offer") {
      const offerPcId = description.sdp?.startsWith("offer:")
        ? description.sdp.slice("offer:".length)
        : null;
      const offerPc = offerPcId ? this.net.pc(offerPcId) : undefined;
      if (offerPc) {
        this.remoteClientId = offerPc.clientId;
        this.remotePcId = offerPc.id;
        offerPc.remoteClientId = this.clientId;
        offerPc.remotePcId = this.id;
        const local = new MockChannel(this.net.maxMessageSize);
        const remote = offerPc.channels[0];
        if (!remote) throw new Error("offer had no data channel");
        local.peer = remote;
        remote.peer = local;
        this.channels.push(local);
        queueMicrotask(() => this.ondatachannel?.({ channel: local }));
      }
      return;
    }
    if (description.type === "answer" && this.connectionState !== "closed") {
      this.openPair();
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (candidate) this.candidates.push(candidate);
  }

  async getStats(): Promise<RTCStatsReport> {
    const reports = new Map<string, Record<string, unknown>>([
      [
        "pair",
        {
          id: "pair",
          type: "candidate-pair",
          selected: true,
          nominated: true,
          localCandidateId: "local",
          remoteCandidateId: "remote",
          state: "succeeded",
        },
      ],
      [
        "local",
        {
          id: "local",
          type: "local-candidate",
          candidateType: this.net.relay ? "relay" : "host",
        },
      ],
      ["remote", { id: "remote", type: "remote-candidate", candidateType: "host" }],
    ]);
    return {
      forEach: (callback: (value: Record<string, unknown>) => void) =>
        reports.forEach((value) => callback(value)),
      get: (id: string) => reports.get(id),
    } as unknown as RTCStatsReport;
  }

  setConfiguration(configuration: RTCConfiguration): void {
    this.configurations.push(configuration);
  }

  close(): void {
    if (this.connectionState === "closed") return;
    this.connectionState = "closed";
    for (const channel of this.channels) channel.fail();
  }

  fail(): void {
    if (this.failed || this.connectionState === "closed") return;
    this.failed = true;
    this.connectionState = "failed";
    this.iceConnectionState = "failed";
    for (const channel of this.channels) channel.fail();
    this.onconnectionstatechange?.({});
    this.oniceconnectionstatechange?.({});
  }

  private openPair(): void {
    const remote = this.remotePcId ? this.net.pc(this.remotePcId) : undefined;
    if (!remote) return;
    if (this.connectionState !== "connected") {
      this.connectionState = "connected";
      this.iceConnectionState = "connected";
      this.onconnectionstatechange?.({});
      this.oniceconnectionstatechange?.({});
    }
    if (remote.connectionState !== "connected") {
      remote.connectionState = "connected";
      remote.iceConnectionState = "connected";
      remote.onconnectionstatechange?.({});
      remote.oniceconnectionstatechange?.({});
    }
    for (const channel of [...this.channels, ...remote.channels]) channel.open();
  }
}

export function makeBytes(size: number, seed = 7): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed) % 256;
  return bytes;
}

export async function waitFor(
  check: () => boolean,
  label = "condition",
  timeoutMs = 5000,
): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}
