import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactNode } from "react";
import messages from "../../messages/en.json";
import { getChatName } from "./room-utils";

type MockEngine = {
  args: {
    clientId: string;
    sendSignal: (to: string, signal: unknown) => void;
    getIceServers: () => Promise<RTCIceServer[]>;
    onTransfer: (transfer: Record<string, unknown>) => void;
    onError: (message: string) => void;
  };
  setPeers: ReturnType<typeof vi.fn>;
  handleSignal: ReturnType<typeof vi.fn>;
  sendFiles: ReturnType<typeof vi.fn>;
  acceptTransfer: ReturnType<typeof vi.fn>;
  pauseTransfer: ReturnType<typeof vi.fn>;
  resumeTransfer: ReturnType<typeof vi.fn>;
  cancelTransfer: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const { engineInstances } = vi.hoisted(() => ({
  engineInstances: [] as MockEngine[],
}));

vi.mock("./p2p/PeerTransferManager", () => {
  class MockPeerTransferManager {
    args: MockEngine["args"];
    setPeers = vi.fn();
    handleSignal = vi.fn().mockResolvedValue(undefined);
    sendFiles = vi.fn().mockResolvedValue(undefined);
    acceptTransfer = vi.fn().mockResolvedValue(undefined);
    pauseTransfer = vi.fn();
    resumeTransfer = vi.fn();
    cancelTransfer = vi.fn();
    destroy = vi.fn();

    constructor(args: MockEngine["args"]) {
      this.args = args;
      engineInstances.push(this);
    }
  }
  return { PeerTransferManager: MockPeerTransferManager };
});

vi.mock("./p2p/types", () => ({
  MEMORY_LIMIT_BYTES: 100 * 1024 * 1024,
  MAX_FILE_BYTES: 3 * 1024 * 1024 * 1024,
  supportsDiskSaving: () => true,
}));

const I18nProvider = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    {children}
  </NextIntlClientProvider>
);

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("RTCPeerConnection", class {});
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { useRoomWebSocket } from "./useRoomWebSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((e: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  binaryType = "blob";
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

beforeEach(() => {
  engineInstances.length = 0;
  MockWebSocket.instances = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function connect() {
  const ws = MockWebSocket.instances[0];
  ws.readyState = MockWebSocket.OPEN;
  act(() => ws.onopen?.());
}

function closeSocket() {
  const ws = MockWebSocket.instances[0];
  act(() => {
    ws.onclose?.({ code: 1006, reason: "", wasClean: false });
  });
}

async function receive(payload: unknown) {
  const ws = MockWebSocket.instances[0];
  await act(async () => {
    await ws.onmessage?.({ data: JSON.stringify(payload) });
  });
}

function makeFiles(): File[] {
  return [new File(["hello"], "hello.txt", { type: "text/plain" })];
}

function renderRoom() {
  return renderHook(
    () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    { wrapper: I18nProvider },
  );
}

async function joinWithPeer() {
  connect();
  await receive({
    type: "room-state",
    payload: { clientCount: 2, peerIds: ["test-client", "peer-1"], clientId: "test-client" },
  });
}

describe("useRoomWebSocket P2P mode", () => {
  it("does not broadcast when an explicitly selected recipient has left", async () => {
    const { result } = renderRoom();
    await joinWithPeer();
    await act(async () => { await result.current.handleFiles(makeFiles() as unknown as FileList, ["departed-peer"]); });
    expect(engineInstances[0].sendFiles).not.toHaveBeenCalled();
    expect(result.current.p2pError).toBe(messages.P2P.recipientUnavailable);
  });

  it("renews TURN config before a four-minute refresh can reuse expiring credentials", async () => {
    renderRoom();
    connect();
    vi.useFakeTimers();
    try {
      const engine = engineInstances[0];
      const first = engine.args.getIceServers();
      await receive({ type: "ice-config", payload: { iceServers: [{ urls: "turn:example.org", credential: "old" }], expiresAt: Date.now() + 600_000 } });
      await first;
      await vi.advanceTimersByTimeAsync(240_000);
      const renewed = engine.args.getIceServers();
      await receive({ type: "ice-config", payload: { iceServers: [{ urls: "turn:example.org", credential: "new" }], expiresAt: Date.now() + 600_000 } });
      expect((await renewed)[0].credential).toBe("new");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes the latest offline offer and its candidates after rejoining", async () => {
    const { result } = renderRoom();
    await joinWithPeer();
    const old = MockWebSocket.instances[0];
    old.readyState = MockWebSocket.CLOSED;
    engineInstances[0].args.sendSignal("peer-1", { description: { type: "offer", sdp: "obsolete" } });
    engineInstances[0].args.sendSignal("peer-1", { description: { type: "offer", sdp: "latest" } });
    engineInstances[0].args.sendSignal("peer-1", { candidate: null });
    act(() => result.current.handleRetry());
    const next = MockWebSocket.instances[1];
    next.readyState = MockWebSocket.OPEN;
    act(() => next.onopen?.());
    await act(async () => {
      await next.onmessage?.({ data: JSON.stringify({ type: "room-state", payload: { clientCount: 2, peerIds: ["test-client", "peer-1"], clientId: "test-client" } }) });
    });
    const sent = next.send.mock.calls.map(([data]) => JSON.parse(new TextDecoder().decode(data as Uint8Array)));
    expect(sent.filter((frame) => frame.type === "signal")).toEqual([
      { type: "signal", payload: { to: "peer-1", signal: { description: { type: "offer", sdp: "latest" } } } },
      { type: "signal", payload: { to: "peer-1", signal: { candidate: null } } },
    ]);
  });

  it("ignores legacy file payloads in P2P mode", async () => {
    const { result } = renderRoom();
    connect();
    await receive({ type: "file-meta", payload: { fileId: "legacy", name: "a", size: 1, mime: "text/plain" } });
    await receive({ type: "file-chunk", payload: { fileId: "legacy", chunk: "YQ==", offset: 0, final: true } });
    expect(result.current.transfers).toEqual({});
  });

  it("rejects outstanding ICE work on unmount and clears its timer", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderRoom();
      connect();
      const pending = engineInstances[0].args.getIceServers().catch((error: Error) => error.message);
      unmount();
      expect(await pending).toBe(messages.P2P.iceUnavailable);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores stale events after automatic socket replacement", async () => {
    const { result } = renderRoom();
    connect();
    const old = MockWebSocket.instances[0];
    vi.useFakeTimers();
    try {
      closeSocket();
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      const next = MockWebSocket.instances[1];
      next.readyState = MockWebSocket.OPEN;
      act(() => next.onopen?.());
      await act(async () => {
        await old.onmessage?.({ data: JSON.stringify({ type: "room-state", payload: { clientCount: 999, peerIds: ["stale"] } }) });
        old.onclose?.({ code: 1006, reason: "old socket", wasClean: false });
      });
      expect(result.current.status).toBe("connected");
      expect(result.current.clientCount).not.toBe(999);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(MockWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates one engine and syncs peers excluding self", async () => {
    const { result } = renderRoom();
    connect();

    expect(engineInstances).toHaveLength(1);
    expect(engineInstances[0].args.clientId).toBe("test-client");

    await receive({
      type: "room-state",
      payload: { clientCount: 2, peerIds: ["test-client", "peer-1"], clientId: "test-client" },
    });

    await waitFor(() => {
      expect(result.current.peers).toEqual([
        { id: "peer-1", name: getChatName("peer-1") },
      ]);
    });
    expect(engineInstances[0].setPeers).toHaveBeenLastCalledWith(["peer-1"]);
  });

  it("routes incoming signals to the engine and ignores our own", async () => {
    renderRoom();
    connect();
    const engine = engineInstances[0];

    await receive({
      type: "signal",
      payload: { from: "peer-1", signal: { description: { type: "offer", sdp: "abc" } } },
    });

    expect(engine.handleSignal).toHaveBeenCalledWith("peer-1", {
      description: { type: "offer", sdp: "abc" },
    });

    await receive({
      type: "signal",
      payload: { from: "test-client", signal: { candidate: null } },
    });
    expect(engine.handleSignal).toHaveBeenCalledTimes(1);
  });

  it("keeps the engine and received transfers across a signaling reconnect", async () => {
    const { result } = renderRoom();
    connect();
    const engine = engineInstances[0];

    act(() => {
      engine.args.onTransfer({
        id: "out:peer-1:f1",
        peerId: "peer-1",
        peerName: "Ken",
        direction: "outgoing",
        name: "a.bin",
        size: 100,
        mime: "application/octet-stream",
        progress: 50,
        status: "transferring",
        connectionType: "direct",
        bytesTransferred: 50,
      });
    });

    await waitFor(() => {
      expect(result.current.transfers["out:peer-1:f1"]).toBeDefined();
    });

    closeSocket();
    expect(result.current.status).toBe("closed");

    act(() => result.current.handleRetry());

    expect(engineInstances).toHaveLength(1);
    expect(engine.destroy).not.toHaveBeenCalled();
    expect(engineInstances[0]).toBe(engine);
    expect(result.current.transfers["out:peer-1:f1"].status).toBe("transferring");
  });

  it("coalesces ICE requests and caches the answer until expiry", async () => {
    renderRoom();
    connect();
    const engine = engineInstances[0];
    const ws = MockWebSocket.instances[0];

    const first = engine.args.getIceServers();
    const second = engine.args.getIceServers();
    expect(second).toBe(first);

    const requested = ws.send.mock.calls.filter(([raw]) => {
      const text = new TextDecoder().decode(raw as Uint8Array);
      return JSON.parse(text).type === "ice-request";
    });
    expect(requested).toHaveLength(1);

    await receive({
      type: "ice-config",
      payload: {
        iceServers: [{ urls: "stun:example.org" }],
        turnEnabled: false,
        expiresAt: Date.now() + 300_000,
      },
    });

    await expect(first).resolves.toEqual([{ urls: "stun:example.org" }]);

    await expect(engine.args.getIceServers()).resolves.toEqual([
      { urls: "stun:example.org" },
    ]);
    expect(
      ws.send.mock.calls.filter(([raw]) =>
        new TextDecoder().decode(raw as Uint8Array).includes("ice-request"),
      ),
    ).toHaveLength(1);
  });

  it("rejects a pending ICE request on timeout and clears it", async () => {
    renderRoom();
    connect();
    const engine = engineInstances[0];

    vi.useFakeTimers();
    try {
      const pending = engine.args.getIceServers();
      const caught = pending.catch((error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await caught).toContain("Timed out");
      // A later attempt starts a fresh request instead of reusing the dead one.
      const retry = engine.args.getIceServers();
      expect(retry).not.toBe(pending);
      const retryCaught = retry.catch(() => {});
      await vi.advanceTimersByTimeAsync(10_001);
      await retryCaught;
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends files to everyone by default and to a chosen peer when asked", async () => {
    const { result } = renderRoom();
    await joinWithPeer();
    const engine = engineInstances[0];
    const files = makeFiles();

    await act(async () => {
      await result.current.handleFiles(files as unknown as FileList);
    });
    expect(engine.sendFiles).toHaveBeenLastCalledWith(files, undefined);

    await act(async () => {
      await result.current.handleFiles(files as unknown as FileList, ["peer-1"]);
    });
    expect(engine.sendFiles).toHaveBeenLastCalledWith(files, ["peer-1"]);
  });

  it("explains that nobody else is in the room instead of failing silently", async () => {
    const { result } = renderRoom();
    connect();

    await act(async () => {
      await result.current.handleFiles(makeFiles() as unknown as FileList);
    });

    expect(result.current.p2pError).toContain("No one else is in the room");
    expect(engineInstances[0].sendFiles).not.toHaveBeenCalled();
  });

  it("delegates accept to the engine and surfaces picker rejections", async () => {
    const { result } = renderRoom();
    connect();
    const engine = engineInstances[0];
    engine.acceptTransfer.mockRejectedValueOnce(new Error("picker dismissed"));

    act(() => result.current.acceptTransfer("in:peer-1:f1"));

    expect(engine.acceptTransfer).toHaveBeenCalledWith("in:peer-1:f1");
    await waitFor(() => {
      expect(result.current.p2pError).toContain("Could not save this file");
    });
  });

  it("delegates pause, resume and cancel per transfer id", () => {
    const { result } = renderRoom();
    connect();
    const engine = engineInstances[0];

    act(() => result.current.pauseTransfer("out:peer-1:f1"));
    act(() => result.current.resumeTransfer("out:peer-1:f1"));
    act(() => result.current.cancelTransfer("out:peer-1:f1"));

    expect(engine.pauseTransfer).toHaveBeenCalledWith("out:peer-1:f1");
    expect(engine.resumeTransfer).toHaveBeenCalledWith("out:peer-1:f1");
    expect(engine.cancelTransfer).toHaveBeenCalledWith("out:peer-1:f1");
  });

  it("destroys the engine on unmount only", () => {
    const { unmount } = renderRoom();
    const engine = engineInstances[0];
    expect(engine.destroy).not.toHaveBeenCalled();
    unmount();
    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("auto-reconnects signaling after a drop without recreating the engine", async () => {
    const { result } = renderRoom();
    connect();
    const engine = engineInstances[0];

    vi.useFakeTimers();
    try {
      closeSocket();
      expect(result.current.status).toBe("closed");

      await vi.advanceTimersByTimeAsync(600);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(engineInstances).toHaveLength(1);

      const next = MockWebSocket.instances[1];
      next.readyState = MockWebSocket.OPEN;
      act(() => next.onopen?.());

      expect(result.current.status).toBe("connected");
      expect(engine.destroy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a readable error when WebRTC is unavailable", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    try {
      const { result } = renderRoom();

      await waitFor(() => {
        expect(result.current.p2pError).toContain("does not support WebRTC");
      });
      expect(engineInstances).toHaveLength(0);
    } finally {
      vi.stubGlobal("RTCPeerConnection", class {});
    }
  });
});
