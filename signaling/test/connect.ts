import { exports } from "cloudflare:workers";

export const ORIGIN = "http://localhost:3000";

/** Stable per-id token so a reconnect proves ownership the way the app does. */
export function tokenFor(clientId: string): string {
  return `tok_${clientId}`.padEnd(16, "0");
}

function wsUrl(roomId: string, clientId: string, token: string): string {
  return `https://holo.test/ws?roomId=${roomId}&clientId=${clientId}&token=${token}`;
}

export interface ServerFrame {
  type: string;
  payload?: Record<string, unknown>;
}

export interface Client {
  id: string;
  ws: WebSocket;
  closed: { code: number; reason: string } | null;
  send(frame: unknown): void;
  sendBytes(text: string): void;
  next(type: string, timeoutMs?: number): Promise<ServerFrame>;
  none(type: string, timeoutMs?: number): Promise<boolean>;
  waitClosed(timeoutMs?: number): Promise<{ code: number; reason: string }>;
  close(): void;
}

export async function open(
  roomId: string,
  clientId: string,
  origin: string | null = ORIGIN,
  token: string = tokenFor(clientId),
): Promise<Client> {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (origin) headers.Origin = origin;
  const response = await exports.default.fetch(wsUrl(roomId, clientId, token), {
    headers,
  });
  if (response.status !== 101 || !response.webSocket) {
    throw new Error(`upgrade failed: ${response.status} ${await response.text()}`);
  }
  return wrap(response.webSocket, clientId);
}

export async function attempt(
  roomId: string,
  clientId: string,
  origin: string | null = ORIGIN,
  token: string = tokenFor(clientId),
): Promise<Response> {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (origin) headers.Origin = origin;
  return exports.default.fetch(wsUrl(roomId, clientId, token), { headers });
}

function wrap(ws: WebSocket, id: string): Client {
  const inbox: ServerFrame[] = [];
  const waiters = new Set<{
    type: string;
    resolve: (frame: ServerFrame) => void;
  }>();
  let closed: { code: number; reason: string } | null = null;
  const closeWaiters = new Set<(value: { code: number; reason: string }) => void>();

  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const frame = JSON.parse(event.data) as ServerFrame;
    for (const waiter of waiters) {
      if (waiter.type === frame.type) {
        waiters.delete(waiter);
        waiter.resolve(frame);
        return;
      }
    }
    inbox.push(frame);
  });
  ws.addEventListener("close", (event) => {
    closed = { code: event.code, reason: event.reason };
    for (const waiter of closeWaiters) waiter(closed);
    closeWaiters.clear();
    for (const waiter of waiters) {
      waiters.delete(waiter);
      waiter.resolve({ type: "__closed__" });
    }
  });
  // Listeners first: accept() can dispatch already-queued frames synchronously.
  ws.accept();

  function next(type: string, timeoutMs = 2000): Promise<ServerFrame> {
    const index = inbox.findIndex((frame) => frame.type === type);
    const queued = index === -1 ? undefined : inbox.splice(index, 1)[0];
    if (queued) return Promise.resolve(queued);

    return new Promise((resolve, reject) => {
      const waiter = { type, resolve };
      waiters.add(waiter);
      setTimeout(() => {
        if (!waiters.delete(waiter)) return;
        reject(
          new Error(
            `timed out waiting for ${type} on ${id}; inbox=${JSON.stringify(inbox)}`,
          ),
        );
      }, timeoutMs);
    });
  }

  return {
    id,
    ws,
    get closed() {
      return closed;
    },
    send(frame: unknown) {
      ws.send(JSON.stringify(frame));
    },
    sendBytes(text: string) {
      ws.send(new TextEncoder().encode(text));
    },
    next,
    async none(type: string, timeoutMs = 150) {
      if (inbox.some((frame) => frame.type === type)) return false;
      return new Promise((resolve) => {
        const waiter = { type, resolve: () => resolve(false) };
        waiters.add(waiter);
        setTimeout(() => {
          if (!waiters.delete(waiter)) return;
          resolve(!inbox.some((frame) => frame.type === type));
        }, timeoutMs);
      });
    },
    waitClosed(timeoutMs = 2000) {
      if (closed) return Promise.resolve(closed);
      return new Promise((resolve, reject) => {
        const waiter = (value: { code: number; reason: string }) => resolve(value);
        closeWaiters.add(waiter);
        setTimeout(() => {
          if (!closeWaiters.delete(waiter)) return;
          reject(new Error(`timed out waiting for close on ${id}`));
        }, timeoutMs);
      });
    },
    close() {
      ws.close();
    },
  };
}
