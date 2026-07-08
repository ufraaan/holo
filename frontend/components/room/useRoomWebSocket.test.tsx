import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactNode } from "react";
import messages from "../../messages/en.json";

const I18nProvider = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    {children}
  </NextIntlClientProvider>
);

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});
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

  send() {}

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
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    expect(result.current.status).toBe("connecting");
  });

  it("transitions to connected on open", () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();

    expect(result.current.status).toBe("connected");
    expect(result.current.errorMessage).toBeNull();
  });

  it("transitions to closed on close", () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();
    act(() => {
      wsClose();
    });

    expect(result.current.status).toBe("closed");
    expect(result.current.errorMessage).toContain("closed");
  });

  it("updates clientCount on room-state", async () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
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
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();

    await receiveMessage(
      JSON.stringify({ type: "room-state", payload: { clientCount: 2 } }),
    );

    await receiveMessage(
      JSON.stringify({ type: "room-state", payload: { clientCount: 3 } }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100));
    });

    expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    expect(result.current.toasts[0].type).toBe("joined");
  });

  it("adds incoming transfer on file-meta", async () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
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
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
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
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
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
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();
    MockWebSocket.instances[0].send = sendSpy;

    act(() => {
      result.current.sendJson({ type: "ping" });
    });

    expect(sendSpy).toHaveBeenCalled();
  });

  it("handleRetry reconnects", () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();

    act(() => {
      result.current.handleRetry();
    });

    expect(result.current.status).toBe("connecting");
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it("sets error when sendJson is called while not open", () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    act(() => {
      result.current.sendJson({ type: "ping" });
    });

    expect(result.current.errorMessage).toContain("not open");
  });

  it("handles text-share with customName", async () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
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

  it("adds incoming chat-message", async () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();

    await receiveMessage(
      JSON.stringify({
        type: "chat-message",
        payload: { id: "c1", text: "hello", senderId: "other", senderName: "Ken", timestamp: 1000 },
      }),
    );

    await waitFor(() => {
      expect(result.current.chatMessages.length).toBe(1);
    });
    expect(result.current.chatMessages[0].text).toBe("hello");
    expect(result.current.chatMessages[0].senderName).toBe("Ken");
  });

  it("sendChatMessage adds message locally and sends over socket", () => {
    const sendSpy = vi.fn();
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    connect();
    MockWebSocket.instances[0].send = sendSpy;

    act(() => {
      result.current.sendChatMessage("hey folks");
    });

    expect(result.current.chatMessages.length).toBe(1);
    expect(result.current.chatMessages[0].text).toBe("hey folks");
    expect(sendSpy).toHaveBeenCalledOnce();

    const raw = sendSpy.mock.calls[0][0];
    const decoded = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const sent = JSON.parse(decoded);
    expect(sent.type).toBe("chat-message");
    expect(sent.payload.text).toBe("hey folks");
    expect(sent.payload.senderId).toBe("test-client");
  });

  it("exposes currentSenderId and currentSenderName", () => {
    const { result } = renderHook(
      () => useRoomWebSocket({ roomId: "test-room", clientId: "test-client" }),
      { wrapper: I18nProvider },
    );

    expect(result.current.currentSenderId).toBe("test-client");
    expect(result.current.currentSenderName).toBeTruthy();
  });
});
