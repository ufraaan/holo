import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerTransferManager } from "./PeerTransferManager";
import { MAX_PENDING_INBOUND } from "./PeerTransferManager";
import { MAX_FILE_BYTES, MEMORY_LIMIT_BYTES, supportsDiskSaving } from "./types";
import type { PeerTransfer } from "./types";
import { MockNetwork, makeBytes, waitFor } from "./mock-peer";

interface Harness {
  manager: PeerTransferManager;
  events: PeerTransfer[];
  updates: Map<string, PeerTransfer>;
  errors: string[];
  iceServerCalls: number;
  destroyed: boolean;
}

interface HarnessOptions {
  autoReceive?: boolean;
  memoryLimitBytes?: number;
  iceRefreshMs?: number;
}

const openManagers: PeerTransferManager[] = [];
const openNetworks: MockNetwork[] = [];
const blobs = new Map<string, Blob>();

function installRtc(net: MockNetwork): void {
  vi.stubGlobal("RTCPeerConnection", function MockRtc() {
    return net.createPc();
  });
  openNetworks.push(net);
}

function harness(
  net: MockNetwork,
  clientId: string,
  options: HarnessOptions = {},
): Harness {
  const state: Harness = {
    manager: null as unknown as PeerTransferManager,
    events: [],
    updates: new Map<string, PeerTransfer>(),
    errors: [],
    iceServerCalls: 0,
    destroyed: false,
  };
  state.manager = new PeerTransferManager({
    clientId,
    sendSignal: (to, signal) => net.deliver(clientId, to, signal),
    getIceServers: async () => {
      state.iceServerCalls++;
      return [];
    },
    onTransfer: (transfer) => {
      state.events.push(transfer);
      state.updates.set(transfer.id, transfer);
    },
    onError: (error) => state.errors.push(error),
    autoReceive: options.autoReceive,
    internal: options,
  });
  net.attach(clientId, state.manager);
  openManagers.push(state.manager);
  return state;
}

async function connect(
  net: MockNetwork,
  peers: Harness[],
  ids = ["a", "b"],
): Promise<void> {
  for (const peer of peers) peer.manager.setPeers(ids);
  await waitFor(
    () => ids.every((id) => net.isOpen(id)),
    "data channels open",
    8000,
  );
}

function incoming(peer: Harness, from: string): PeerTransfer | undefined {
  return [...peer.updates.values()]
    .filter((item) => item.direction === "incoming" && item.peerId === from)
    .pop();
}

function outgoing(peer: Harness, to: string): PeerTransfer | undefined {
  return [...peer.updates.values()]
    .filter((item) => item.direction === "outgoing" && item.peerId === to)
    .pop();
}

async function waitForIncoming(
  peer: Harness,
  from: string,
  status?: PeerTransfer["status"],
): Promise<PeerTransfer> {
  await waitFor(
    () => {
      const record = incoming(peer, from);
      return !!record && (!status || record.status === status);
    },
    `incoming ${status ?? "offer"}`,
  );
  return incoming(peer, from)!;
}

async function completedBytes(transfer: PeerTransfer): Promise<Uint8Array> {
  expect(transfer.url).toBeTruthy();
  const blob = blobs.get(transfer.url!);
  expect(blob).toBeTruthy();
  return new Uint8Array(await blob!.arrayBuffer());
}

function offerControl(
  fileId: string,
  size: number,
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    t: "offer",
    fileId,
    name: "injected.bin",
    size,
    mime: "application/octet-stream",
    ...overrides,
  });
}

async function chunkFrame(
  fileId: string,
  offset: number,
  final: boolean,
  payload: Uint8Array,
  tamperDigest = false,
): Promise<ArrayBuffer> {
  const id = new TextEncoder().encode(fileId);
  const digest = new Uint8Array(
    await webcrypto.subtle.digest("SHA-256", new Uint8Array(payload)),
  );
  if (tamperDigest) digest[0] ^= 0xff;
  const header = 42 + id.byteLength;
  const frame = new ArrayBuffer(header + payload.byteLength);
  const view = new DataView(frame);
  view.setUint8(0, final ? 1 : 0);
  view.setUint8(1, id.byteLength);
  new Uint8Array(frame, 2, id.byteLength).set(id);
  view.setBigUint64(2 + id.byteLength, BigInt(offset));
  new Uint8Array(frame, 10 + id.byteLength, 32).set(digest);
  new Uint8Array(frame, header).set(payload);
  return frame;
}

function frameOffset(frame: string | ArrayBuffer): number {
  if (typeof frame === "string") return -1;
  const view = new DataView(frame);
  const idLength = view.getUint8(1);
  return Number(view.getBigUint64(2 + idLength));
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
    const url = `blob:holo-test/${blobs.size}`;
    blobs.set(url, value as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    blobs.delete(url);
  });
});

afterEach(() => {
  for (const manager of openManagers.splice(0)) manager.destroy();
  openNetworks.length = 0;
  blobs.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PeerTransferManager", () => {
  it("automatically receives files within the memory budget", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b", { autoReceive: true });
    await connect(net, [a, b]);
    await a.manager.sendFiles([new File(["automatic"], "auto.txt")], ["b"]);
    await waitFor(() => outgoing(a, "b")?.status === "completed");
    expect([...b.updates.values()][0].status).toBe("completed");
    expect(b.errors).toEqual([]);
  });

  it("accepts completion when disk finalization finishes during reconnection", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b", { memoryLimitBytes: 0 });
    let finishClose: () => void = () => {};
    const close = vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({ createWritable: async () => ({ write: async () => {}, close, abort: async () => {} }) }));
    await connect(net, [a, b]);
    await a.manager.sendFiles([new File(["finish"], "finalize.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => close.mock.calls.length === 1);
    net.fail("a", "b");
    await waitFor(() => net.isOpen("a") && net.isOpen("b"), "replacement channel", 8000);
    finishClose();
    await waitFor(() => outgoing(a, "b")?.status === "completed");
    expect(a.errors).toEqual([]);
    expect(b.updates.get(received.id)?.status).toBe("completed");
  });

  it("retries an unanswered first offer rather than leaving setup stuck", async () => {
    vi.useFakeTimers();
    try {
      const net = new MockNetwork();
      installRtc(net);
      const deliver = net.deliver.bind(net);
      let dropped = false;
      vi.spyOn(net, "deliver").mockImplementation((from, to, signal) => {
        if (!dropped && "description" in signal && signal.description.type === "offer") {
          dropped = true;
          return;
        }
        deliver(from, to, signal);
      });
      const a = harness(net, "a");
      const b = harness(net, "b");
      a.manager.setPeers(["a", "b"]);
      b.manager.setPeers(["a", "b"]);
      await vi.advanceTimersByTimeAsync(100);
      expect(dropped).toBe(true);
      expect(net.isOpen("a")).toBe(false);
      await vi.advanceTimersByTimeAsync(10_600);
      expect(net.isOpen("a")).toBe(true);
      expect(net.isOpen("b")).toBe(true);
    } finally {
      for (const manager of openManagers) manager.destroy();
      vi.useRealTimers();
    }
  });

  it("offers a 3 GiB file without reading it and rejects anything above the cap", async () => {
    const net = new MockNetwork();
    installRtc(net);
    vi.stubGlobal("showSaveFilePicker", vi.fn());
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);
    const allowed = new File([], "large.bin");
    Object.defineProperty(allowed, "size", { value: MAX_FILE_BYTES });
    const slice = vi.spyOn(allowed, "slice");
    await a.manager.sendFiles([allowed], ["b"]);
    const offered = await waitForIncoming(b, "a", "offered");
    expect(offered.size).toBe(MAX_FILE_BYTES);
    expect(slice).not.toHaveBeenCalled();
    const tooLarge = new File([], "too-large.bin");
    Object.defineProperty(tooLarge, "size", { value: MAX_FILE_BYTES + 1 });
    await a.manager.sendFiles([tooLarge], ["b"]);
    expect(a.errors.some((message) => message.includes("exceeds"))).toBe(true);
    expect([...b.updates.values()].filter((transfer) => transfer.direction === "incoming")).toHaveLength(1);
  });

  it("rejects acknowledgments for bytes that have never been sent", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);
    await a.manager.sendFiles([new File(["hello"], "ack.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    const fileId = received.id.split(":").at(-1)!;
    net.channelOf("b").send(JSON.stringify({ t: "ack", fileId, offset: 5 }));
    await waitFor(() => outgoing(a, "b")?.status === "error");
    expect(outgoing(a, "b")?.progress).toBe(0);
  });

  it("honors resume requested before the replacement channel opens", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);
    const bytes = makeBytes(1024 * 1024 + 17);
    // The SDP responder is the file sender in this case.
    await b.manager.sendFiles([new File([bytes], "reverse.bin")], ["a"]);
    const received = await waitForIncoming(a, "b", "offered");
    await a.manager.acceptTransfer(received.id);
    const sent = outgoing(b, "a")!;
    b.manager.pauseTransfer(sent.id);
    await waitFor(() => a.updates.get(received.id)?.status === "paused");
    net.fail("a", "b");
    b.manager.resumeTransfer(sent.id);
    await waitFor(() => a.updates.get(received.id)?.status === "completed", "responder file resumed", 8000);
    expect(Buffer.from(await completedBytes(a.updates.get(received.id)!)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("does not revive a cancelled transfer after its disk write resolves", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b", { memoryLimitBytes: 0 });
    let finishWrite: () => void = () => {};
    const write = vi.fn(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    const close = vi.fn().mockResolvedValue(undefined);
    const abort = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close, abort }) }));
    await connect(net, [a, b]);
    await a.manager.sendFiles([new File([makeBytes(32)], "cancel.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => write.mock.calls.length === 1);
    b.manager.cancelTransfer(received.id);
    finishWrite();
    await net.settle();
    expect(b.updates.get(received.id)?.status).toBe("cancelled");
    expect(b.updates.get(received.id)?.bytesTransferred).toBe(0);
    expect(close).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledOnce();
  });

  it("transfers a file end to end and only reports 100% after the receiver finalized it", async () => {
    const net = new MockNetwork(1024 * 1024);
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    const bytes = makeBytes(80 * 1024 + 7);
    const file = new File([bytes], "photo.bin", {
      type: "application/octet-stream",
    });
    await a.manager.sendFiles([file], ["b"]);

    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);

    await waitFor(() => b.updates.get(received.id)?.status === "completed");
    const sent = outgoing(a, "b")!;
    await waitFor(() => a.updates.get(sent.id)?.status === "completed");

    const receiverDone = b.updates.get(received.id)!;
    expect(receiverDone.progress).toBe(100);
    expect(receiverDone.bytesTransferred).toBe(bytes.length);
    expect(receiverDone.savedToDisk).toBe(false);
    expect(Buffer.from(await completedBytes(receiverDone)).equals(Buffer.from(bytes))).toBe(true);

    const senderEvents = a.events.filter((item) => item.id === sent.id);
    for (const event of senderEvents) {
      if (event.status === "completed") continue;
      expect(event.progress).toBeLessThan(100);
    }
    expect(a.updates.get(sent.id)?.progress).toBe(100);
    expect(b.errors).toEqual([]);
  });

  it("clamps chunks to the negotiated data channel message size", async () => {
    const net = new MockNetwork(1024); // mock throws on oversized sends
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    const bytes = makeBytes(100 * 1024 + 3);
    await a.manager.sendFiles([new File([bytes], "small-window.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");

    expect(Buffer.from(await completedBytes(b.updates.get(received.id)!)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("supports zero byte files", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    await a.manager.sendFiles([new File([], "empty.txt")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    expect(received.size).toBe(0);
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");

    expect(await completedBytes(b.updates.get(received.id)!)).toEqual(
      new Uint8Array(0),
    );
  });

  it("rejects chunks whose digest does not match and reports an error", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    net.channelOf("a").send(offerControl("checksum", 4096));
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);

    const payload = makeBytes(4096);
    net
      .channelOf("a")
      .send(await chunkFrame("checksum", 0, true, payload, true));

    await waitFor(() => b.updates.get(received.id)?.status === "error");
    expect(b.updates.get(received.id)?.error).toMatch(/checksum/i);
    expect(b.errors.some((item) => /checksum/i.test(item))).toBe(true);
    expect(b.updates.get(received.id)?.url).toBeUndefined();
  });

  it("keeps a transfer paused across a reconnect and resumes from the written offset", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    // Large enough that the transfer is still running when we pause it.
    const bytes = makeBytes(16 * 1024 * 1024 + 333);
    await a.manager.sendFiles([new File([bytes], "pause.bin"), new File(["next"], "next.txt")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    const sent = [...a.updates.values()].find((t) => t.name === "pause.bin")!;

    // Pause immediately; any chunks already in flight still drain and are acked.
    a.manager.pauseTransfer(sent.id);
    await waitFor(() => a.updates.get(sent.id)?.status === "paused");
    await new Promise((resolve) => setTimeout(resolve, 250));

    const settled = b.updates.get(received.id)!.bytesTransferred;
    expect(settled).toBeLessThan(bytes.length);

    net.fail("a", "b");
    await waitFor(
      () =>
        ["paused", "reconnecting"].includes(
          b.updates.get(received.id)?.status ?? "",
        ),
      "receiver marked offline",
    );
    await waitFor(
      () => net.isOpen("a") && net.isOpen("b"),
      "reconnected channels",
      8000,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(b.updates.get(received.id)?.status).toBe("paused");
    expect(a.updates.get(sent.id)?.status).toBe("paused");
    expect(b.updates.get(received.id)?.bytesTransferred).toBe(settled);

    expect([...a.updates.values()].find((t) => t.name === "next.txt")?.status).toBe("queued");
    expect(b.updates.size).toBe(1);
    a.manager.resumeTransfer(sent.id);
    await waitFor(
      () => b.updates.get(received.id)?.status === "completed",
      "completed after resume",
      8000,
    );
    await waitFor(() => a.updates.get(sent.id)?.status === "completed", "sender", 8000);
    await waitFor(() => incoming(b, "a")?.name === "next.txt");
    expect(Buffer.from(await completedBytes(b.updates.get(received.id)!)).equals(Buffer.from(bytes))).toBe(true);
  }, 20000);

  it("resumes at the receiver confirmed offset after a reconnect loses acks", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    const bytes = makeBytes(1024 * 1024 + 17);
    await a.manager.sendFiles([new File([bytes], "resume.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    const sent = outgoing(a, "b")!;

    // Drop acks and done from the start so the receiver cannot complete.
    const receiverChannel = net.channelOf("b");
    const originalSend = receiverChannel.send.bind(receiverChannel);
    receiverChannel.send = (data: string | ArrayBuffer) => {
      if (typeof data === "string") {
        const control = JSON.parse(data) as { t?: string };
        if (control.t === "ack" || control.t === "done") return;
      }
      originalSend(data);
    };
    await b.manager.acceptTransfer(received.id);

    await waitFor(
      () => (b.updates.get(received.id)?.bytesTransferred ?? 0) > 0,
      "partial write",
    );
    // Let the bounded unacknowledged window drain and the sender stall.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const written = b.updates.get(received.id)?.bytesTransferred ?? 0;
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(bytes.length);

    net.fail("a", "b");
    await waitFor(
      () => net.isOpen("a") && net.isOpen("b"),
      "reconnected channels",
      8000,
    );
    await waitFor(
      () => a.updates.get(sent.id)?.status === "completed",
      "sender completed after resume",
      8000,
    );
    await waitFor(() => b.updates.get(received.id)?.status === "completed");

    const freshChannel = net.channelOf("a");
    const firstBinary = freshChannel.sent.find(
      (frame): frame is ArrayBuffer => typeof frame !== "string",
    );
    expect(firstBinary).toBeDefined();
    expect(frameOffset(firstBinary!)).toBeGreaterThanOrEqual(written);
    expect(Buffer.from(await completedBytes(b.updates.get(received.id)!)).equals(Buffer.from(bytes))).toBe(true);
  }, 20000);

  it("isolates peers: one receiver cancelling does not affect another", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    const c = harness(net, "c");
    await connect(net, [a, b, c], ["a", "b", "c"]);

    const bytes = makeBytes(40 * 1024);
    await a.manager.sendFiles([new File([bytes], "shared.bin")], ["b", "c"]);
    const toB = await waitForIncoming(b, "a", "offered");
    const toC = await waitForIncoming(c, "a", "offered");
    expect(toB.id).not.toBe(toC.id);

    c.manager.cancelTransfer(toC.id);
    await b.manager.acceptTransfer(toB.id);

    await waitFor(() => b.updates.get(toB.id)?.status === "completed");
    await waitFor(() => c.updates.get(toC.id)?.status === "cancelled");
    expect(Buffer.from(await completedBytes(b.updates.get(toB.id)!)).equals(Buffer.from(bytes))).toBe(true);

    const sentToB = outgoing(a, "b")!;
    const sentToC = outgoing(a, "c")!;
    expect(sentToB.id).not.toBe(sentToC.id);
    await waitFor(() => a.updates.get(sentToB.id)?.status === "completed");
    await waitFor(() => a.updates.get(sentToC.id)?.status === "cancelled");
  });

  it("ignores malformed metadata and rejects files beyond the memory cap", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    const channel = net.channelOf("a");
    channel.send(offerControl("neg", -1));
    channel.send(offerControl("huge", MAX_FILE_BYTES + 1));
    channel.send(offerControl("bad:id", 10));
    channel.send(offerControl("long", 10, { name: "x".repeat(300) }));
    channel.send(offerControl("mime", 10, { mime: "m".repeat(300) }));
    channel.send(
      offerControl("toobig", MEMORY_LIMIT_BYTES + 1, {
        name: "too-big.bin",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(b.updates.size).toBe(0);
    expect(b.errors.some((item) => /too large/i.test(item))).toBe(true);

    // The manager still works afterwards.
    await a.manager.sendFiles([new File([makeBytes(64)], "ok.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");
  });

  it("queues batches larger than the inbound offer cap and sends one file at a time", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);
    const files = Array.from({ length: MAX_PENDING_INBOUND + 2 }, (_, i) => new File([String(i)], `file-${i}.txt`));
    await a.manager.sendFiles(files, ["b"]);
    expect([...a.updates.values()].filter((t) => t.status === "queued")).toHaveLength(files.length - 1);
    for (const file of files) {
      await waitFor(() => [...b.updates.values()].some((t) => t.name === file.name && t.status === "offered"));
      const received = [...b.updates.values()].find((t) => t.name === file.name)!;
      expect([...b.updates.values()].filter((t) => t.status === "offered")).toHaveLength(1);
      await b.manager.acceptTransfer(received.id);
      await waitFor(() => [...a.updates.values()].some((t) => t.name === file.name && t.status === "completed"));
      expect(Array.from(await completedBytes(b.updates.get(received.id)!))).toEqual(Array.from(new TextEncoder().encode(await file.text())));
    }
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
  }, 15000);

  it("advances after decline or failure and skips a cancelled queued file", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);
    await a.manager.sendFiles(["decline", "skip", "fail", "last"].map((name) => new File([name], name)), ["b"]);
    const queued = [...a.updates.values()].find((t) => t.name === "skip")!;
    a.manager.cancelTransfer(queued.id);
    const first = await waitForIncoming(b, "a", "offered");
    b.manager.cancelTransfer(first.id);
    await waitFor(() => incoming(b, "a")?.name === "fail");
    const failed = incoming(b, "a")!;
    net.channelOf("b").send(JSON.stringify({ t: "accept", fileId: failed.id.split(":").pop(), offset: 999 }));
    await waitFor(() => incoming(b, "a")?.name === "last");
    expect([...b.updates.values()].some((t) => t.name === "skip")).toBe(false);
    expect([...a.updates.values()].find((t) => t.name === "fail")?.status).toBe("error");
    const last = incoming(b, "a")!;
    await b.manager.acceptTransfer(last.id);
    await waitFor(() => b.updates.get(last.id)?.status === "completed");
  });

  it("keeps queues independent for each recipient", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    const c = harness(net, "c");
    await connect(net, [a, b, c], ["a", "b", "c"]);
    await a.manager.sendFiles([new File(["one"], "one"), new File(["two"], "two")]);
    const first = await waitForIncoming(c, "a", "offered");
    await c.manager.acceptTransfer(first.id);
    await waitFor(() => incoming(c, "a")?.name === "two");
    expect(incoming(b, "a")?.name).toBe("one");
    expect([...a.updates.values()].find((t) => t.peerId === "b" && t.name === "two")?.status).toBe("queued");
  });

  it("caps unaccepted inbound offers per peer", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    const channel = net.channelOf("a");
    for (let i = 0; i < MAX_PENDING_INBOUND + 5; i++) {
      channel.send(offerControl(`f${i}`, 16, { name: `f${i}.bin` }));
    }

    await waitFor(() => b.errors.some((item) => /too many pending/i.test(item)));
    expect(b.updates.size).toBe(MAX_PENDING_INBOUND);

    // Cancelling an offered transfer frees its slot.
    b.manager.cancelTransfer("in:a:f0");
    channel.send(offerControl("after", 16, { name: "after.bin" }));
    await waitFor(() => b.updates.get("in:a:after")?.status === "offered");
  });

  it("enforces the aggregate in-memory cap and frees it on cancel", async () => {    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a", { memoryLimitBytes: 1000 });
    const b = harness(net, "b", { memoryLimitBytes: 1000 });
    await connect(net, [a, b]);

    const channel = net.channelOf("a");
    channel.send(offerControl("alpha", 600));
    await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer("in:a:alpha");

    channel.send(offerControl("beta", 600));
    await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer("in:a:beta");
    await waitFor(() => b.updates.get("in:a:beta")?.status === "error");
    expect(b.updates.get("in:a:beta")?.error).toMatch(/memory|larger/i);

    b.manager.cancelTransfer("in:a:alpha");
    channel.send(offerControl("gamma", 600));
    await waitFor(() => b.updates.get("in:a:gamma")?.status === "offered");
    await b.manager.acceptTransfer("in:a:gamma");
    expect(b.updates.get("in:a:gamma")?.status).toBe("transferring");
    expect(b.updates.get("in:a:gamma")?.error).toBeUndefined();
  });

  it("writes to disk at absolute offsets and closes before the sender completes", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a", { memoryLimitBytes: 1 });
    const b = harness(net, "b", { memoryLimitBytes: 1 });
    await connect(net, [a, b]);

    const writes: Array<{ position?: number; data: Uint8Array }> = [];
    let senderStatusAtClose = "";
    let sentId = "";
    const writable = {
      write: vi.fn(
        async (input: { position?: number; data: Uint8Array }) => {
          writes.push({ position: input.position, data: new Uint8Array(input.data) });
        },
      ),
      close: vi.fn(async () => {
        senderStatusAtClose = a.updates.get(sentId)?.status ?? "";
      }),
      abort: vi.fn(async () => {}),
    };
    const picker = vi.fn(async () => ({
      createWritable: async () => writable,
    }));
    vi.stubGlobal("showSaveFilePicker", picker);
    vi.stubGlobal("isSecureContext", true);
    expect(supportsDiskSaving()).toBe(true);

    const bytes = makeBytes(4096 + 19);
    await a.manager.sendFiles([new File([bytes], "large.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    sentId = outgoing(a, "b")!.id;

    const acceptance = b.manager.acceptTransfer(received.id);
    // The picker must be opened synchronously inside the user gesture.
    expect(picker).toHaveBeenCalledTimes(1);
    await acceptance;

    await waitFor(() => b.updates.get(received.id)?.status === "completed");
    await waitFor(() => a.updates.get(sentId)?.status === "completed");
    expect(writes.reduce((sum, item) => sum + item.data.byteLength, 0)).toBe(
      bytes.length,
    );
    expect(writes[0].position).toBe(0);
    expect(senderStatusAtClose).not.toBe("completed");
    expect(b.updates.get(received.id)?.savedToDisk).toBe(true);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("fails the transfer and aborts the sink when a disk write fails", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a", { memoryLimitBytes: 1 });
    const b = harness(net, "b", { memoryLimitBytes: 1 });
    await connect(net, [a, b]);

    const abort = vi.fn(async () => {});
    const writable = {
      write: vi.fn(async () => {
        throw new Error("disk full");
      }),
      close: vi.fn(async () => {}),
      abort,
    };
    vi.stubGlobal("showSaveFilePicker", async () => ({
      createWritable: async () => writable,
    }));
    vi.stubGlobal("isSecureContext", true);

    await a.manager.sendFiles([new File([makeBytes(2048)], "fail.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    const sentId = outgoing(a, "b")!.id;
    await b.manager.acceptTransfer(received.id);

    await waitFor(() => b.updates.get(received.id)?.status === "error");
    expect(b.updates.get(received.id)?.error).toMatch(/disk full|write failed/i);
    expect(abort).toHaveBeenCalled();
    await waitFor(() => a.updates.get(sentId)?.status === "cancelled");
  });

  it("reports relay candidate pairs from connection stats", async () => {
    const net = new MockNetwork();
    net.relay = true;
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    await a.manager.sendFiles([new File([makeBytes(2048)], "relay.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");

    expect(b.updates.get(received.id)?.connectionType).toBe("relay");
    expect(outgoing(a, "b")?.connectionType).toBe("relay");
  });

  it("refreshes ICE servers on a bounded interval without dropping state", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a", { iceRefreshMs: 25 });
    const b = harness(net, "b", { iceRefreshMs: 25 });
    await connect(net, [a, b]);

    const initialCalls = a.iceServerCalls + b.iceServerCalls;
    await waitFor(
      () => a.iceServerCalls + b.iceServerCalls > initialCalls,
      "ice server refresh",
      3000,
    );
    const configured = [...net.pcs.values()].reduce(
      (sum, pc) => sum + pc.configurations.length,
      0,
    );
    expect(configured).toBeGreaterThan(0);
    expect(net.isOpen("a")).toBe(true);

    const bytes = makeBytes(4096);
    await a.manager.sendFiles([new File([bytes], "after-refresh.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");
    expect(Buffer.from(await completedBytes(b.updates.get(received.id)!)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("revokes retained blob URLs and clears sinks on destroy", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b");
    await connect(net, [a, b]);

    await a.manager.sendFiles([new File([makeBytes(512)], "cleanup.bin")], ["b"]);
    const received = await waitForIncoming(b, "a", "offered");
    await b.manager.acceptTransfer(received.id);
    await waitFor(() => b.updates.get(received.id)?.status === "completed");
    const url = b.updates.get(received.id)!.url!;
    expect(blobs.has(url)).toBe(true);

    b.manager.destroy();
    expect(blobs.has(url)).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    expect(net.isOpen("b")).toBe(false);
  });

  it("reports a speed and eta while receiving and clears them on pause", async () => {
    const net = new MockNetwork();
    installRtc(net);
    const a = harness(net, "a");
    const b = harness(net, "b", { autoReceive: true });
    await connect(net, [a, b]);

    net.channelOf("a").send(offerControl("speed", 3 * 4096));
    const received = await waitForIncoming(b, "a", "transferring");

    vi.useFakeTimers();
    try {
      const channel = net.channelOf("a");
      channel.send(await chunkFrame("speed", 0, false, makeBytes(4096)));
      await vi.advanceTimersByTimeAsync(1000);
      channel.send(await chunkFrame("speed", 4096, false, makeBytes(4096, 3)));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      const active = b.updates.get(received.id)!;
      expect(active.bytesTransferred).toBe(8192);
      expect(active.bytesPerSecond).toBeGreaterThan(4000);
      expect(active.bytesPerSecond).toBeLessThan(4200);
      expect(active.etaSeconds).toBe(1);

      b.manager.pauseTransfer(received.id);
      const paused = b.updates.get(received.id)!;
      expect(paused.status).toBe("paused");
      expect(paused.bytesPerSecond).toBeUndefined();
      expect(paused.etaSeconds).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
