import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoomWebSocket } from "./useRoomWebSocket";

let wsClose: () => void = () => {};

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string | ArrayBuffer }) => void) | null;
  onclose: ((e: { code: number; reason: string; wasClean: boolean }) => void) | null;
  onerror: ((e: Event) => void) | null;
  binaryType: string;

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.binaryType = "blob";

    MockWebSocket.instances.push(this);
    wsClose = () => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ code: 1000, reason: "closed", wasClean: true });
      }
    };
  }

  send(_data: string | ArrayBuffer) {}

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

beforeEach(() => {
  MockWebSocket.instances = [];
  wsClose = () => {};
});

async function receiveMessage(data: string) {
  const ws = MockWebSocket.instances[0];
  if (ws && ws.onmessage) {
    await act(async () => {
      await ws.onmessage!({ data });
    });
  }
}

function connect() {
  const ws = MockWebSocket.instances[0];
  if (!ws) throw new Error("no WebSocket created");
  ws.readyState = MockWebSocket.OPEN;
  act(() => {
    ws.onopen?.();
  });
}

describe("useRoomWebSocket", () => {
  it("starts in connecting status", () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    expect(result.current.status).toBe("connecting");
  });

  it("transitions to connected on open", () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    expect(result.current.status).toBe("connected");
    expect(result.current.errorMessage).toBeNull();
  });

  it("transitions to closed on close", () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();
    act(() => {
      wsClose();
    });

    expect(result.current.status).toBe("closed");
    expect(result.current.errorMessage).toContain("closed");
  });

  it("updates clientCount on room-state", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({ type: "room-state", payload: { clientCount: 3 } }),
    );

    await waitFor(() => {
      expect(result.current.clientCount).toBe(3);
    });
  });

  it("shows toast when client count changes", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({ type: "room-state", payload: { clientCount: 2 } }),
    );

    await receiveMessage(
      JSON.stringify({ type: "room-state", payload: { clientCount: 3 } }),
    );

    await new Promise((r) => setTimeout(r, 1100));

    expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    expect(result.current.toasts[0].message).toBe("someone joined the room");
  });

  it("adds incoming transfer on file-meta", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({
        type: "file-meta",
        payload: { fileId: "f1", name: "test.txt", size: 100, mime: "text/plain" },
      }),
    );

    await waitFor(() => {
      expect(result.current.transfers["f1"]).toBeDefined();
    });
    expect(result.current.transfers["f1"].name).toBe("test.txt");
    expect(result.current.transfers["f1"].direction).toBe("incoming");
  });

  it("completes incoming file on file-chunk with final", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({
        type: "file-meta",
        payload: { fileId: "f2", name: "data.bin", size: 5, mime: "application/octet-stream" },
      }),
    );

    const chunk = btoa("hello");
    await receiveMessage(
      JSON.stringify({
        type: "file-chunk",
        payload: { fileId: "f2", chunk, offset: 0, final: true },
      }),
    );

    await waitFor(() => {
      expect(result.current.transfers["f2"].progress).toBe(100);
    });
    expect(result.current.transfers["f2"].url).toContain("blob:");
  });

  it("adds incoming text-share", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({
        type: "text-share",
        payload: { id: "t1", text: "hello world", timestamp: 1000 },
      }),
    );

    await waitFor(() => {
      expect(result.current.textShares["t1"]).toBeDefined();
    });
    expect(result.current.textShares["t1"].text).toBe("hello world");
    expect(result.current.textShares["t1"].direction).toBe("incoming");
  });

  it("sendJson sends JSON text over the socket", () => {
    const sendSpy = vi.fn();
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();
    MockWebSocket.instances[0].send = sendSpy;

    act(() => {
      result.current.sendJson({ type: "ping" });
    });

    expect(sendSpy).toHaveBeenCalled();
  });

  it("handleRetry reconnects", () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    act(() => {
      result.current.handleRetry();
    });

    expect(result.current.status).toBe("connecting");
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it("sets error when sendJson is called while not open", () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    act(() => {
      result.current.sendJson({ type: "ping" });
    });

    expect(result.current.errorMessage).toContain("not open");
  });

  it("handles text-share with customName", async () => {
    const { result } = renderHook(() =>
      useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
    );

    connect();

    await receiveMessage(
      JSON.stringify({
        type: "text-share",
        payload: { id: "t2", text: "shared", customName: "alice", timestamp: 2000 },
      }),
    );

    await waitFor(() => {
      expect(result.current.textShares["t2"].customName).toBe("alice");
    });
  });
});
