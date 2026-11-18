import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { attempt, open, ORIGIN, type Client } from "./connect";
import { getChatName } from "../src/chat-names";

const clients: Client[] = [];
let roomCounter = 0;

function roomId(): string {
  roomCounter += 1;
  return `t-${roomCounter}-${crypto.randomUUID().slice(0, 6).toLowerCase()}`;
}

async function join(room: string, clientId: string): Promise<Client> {
  const client = await open(room, clientId);
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    try {
      client.close();
    } catch {
      // already closed
    }
  }
});

describe("worker entry", () => {
  it("serves health without secrets", async () => {
    const response = await exports.default.fetch("https://holo.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "holo-signaling",
      turnEnabled: false,
    });
  });

  it("rejects unknown origins and missing origins", async () => {
    const room = roomId();
    const evil = await attempt(room, "a", "https://evil.example");
    expect(evil.status).toBe(403);
    const missing = await attempt(room, "a", null);
    expect(missing.status).toBe(403);
  });

  it("validates room and client ids", async () => {
    expect((await attempt("UPPER", "a")).status).toBe(400);
    expect((await attempt(roomId(), "bad id!")).status).toBe(400);
  });

  it("returns 404 for other paths", async () => {
    expect((await exports.default.fetch("https://holo.test/")).status).toBe(404);
  });
});

describe("room membership", () => {
  it("sends room-state with all peer ids including self", async () => {
    const room = roomId();
    const a = await join(room, "a");
    expect((await a.next("room-state")).payload).toEqual({
      clientCount: 1,
      peerIds: ["a"],
      clientId: "a",
    });

    const b = await join(room, "b");
    const stateA = await a.next("room-state");
    const stateB = await b.next("room-state");
    expect(stateA.payload).toMatchObject({ clientCount: 2, peerIds: ["a", "b"] });
    expect(stateB.payload).toEqual({
      clientCount: 2,
      peerIds: ["a", "b"],
      clientId: "b",
    });
  });

  it("isolates rooms", async () => {
    const one = roomId();
    const two = roomId();
    const a = await join(one, "a");
    const b = await join(two, "b");
    await a.next("room-state");
    const stateB = await b.next("room-state");
    expect(stateB.payload).toMatchObject({ clientCount: 1, peerIds: ["b"] });

    a.send({ type: "text-share", payload: { id: "t", text: "one", timestamp: 1 } });
    expect(await b.none("text-share")).toBe(true);
  });

  it("replaces a duplicate client id instead of adding a peer", async () => {    const room = roomId();
    const a1 = await join(room, "a");
    const b = await join(room, "b");
    await a1.next("room-state");
    await b.next("room-state");

    const a2 = await join(room, "a");
    await b.next("room-state");
    expect((await a2.next("room-state")).payload).toMatchObject({
      clientCount: 2,
      peerIds: ["a", "b"],
    });
    expect(a1.closed?.code).toBe(4000);
    expect((await a1.waitClosed()).code).toBe(4000);
  });

  it("rejects a reconnect that cannot prove it owns the client id", async () => {
    const room = roomId();
    const victim = await join(room, "a");
    await victim.next("room-state");

    const hijack = await attempt(room, "a", undefined, "tok-attacker-0000");
    expect(hijack.status).toBe(409);
    expect(await hijack.json()).toEqual({ error: "id-in-use" });
    expect(victim.closed).toBeNull();
  });

  it("requires a client token on the socket path", async () => {
    const room = roomId();
    const response = await exports.default.fetch(
      `https://holo.test/ws?roomId=${room}&clientId=a`,
      { headers: { Upgrade: "websocket", Origin: ORIGIN } },
    );
    expect(response.status).toBe(400);
  });

  it("drops a departing peer from room-state", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    b.close();
    expect((await a.next("room-state")).payload).toEqual({
      clientCount: 1,
      peerIds: ["a"],
      clientId: "a",
    });
  });

  it("caps a room at 10 peers but still allows replacement", async () => {
    const room = roomId();
    for (let i = 0; i < 10; i++) await join(room, `p${i}`);

    const rejected = await attempt(room, "p10");
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "room-full" });

    const replacement = await attempt(room, "p0");
    expect(replacement.status).toBe(101);
    replacement.webSocket?.accept();
    replacement.webSocket?.close();
  });
});

describe("message relay", () => {
  it("routes signals to the target only and stamps the real sender", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    const c = await join(room, "c");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");
    await c.next("room-state");

    a.send({
      type: "signal",
      payload: { to: "b", from: "c", signal: { description: { type: "offer", sdp: "v=0\r\n" } } },
    });

    expect((await b.next("signal")).payload).toEqual({
      from: "a",
      signal: { description: { type: "offer", sdp: "v=0\r\n" } },
    });
    expect(await c.none("signal")).toBe(true);
  });

  it("rejects signals to self or unknown peers and bad signal shapes", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    a.send({ type: "signal", payload: { to: "a", signal: { description: { type: "offer", sdp: "v=0" } } } });
    expect((await a.next("error")).payload).toEqual({ code: "invalid-target" });

    a.send({ type: "signal", payload: { to: "ghost", signal: { description: { type: "offer", sdp: "v=0" } } } });
    expect((await a.next("error")).payload).toEqual({ code: "peer-not-found" });

    a.send({ type: "signal", payload: { to: "ghost", signal: { type: "hack" } } });
    expect((await a.next("error")).payload).toEqual({ code: "invalid-signal" });
  });

  it("relays candidates of both shapes", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    const candidate = {
      candidate: "candidate:1 1 UDP 1 127.0.0.1 1234 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    a.send({ type: "signal", payload: { to: "b", signal: { candidate } } });
    expect((await b.next("signal")).payload).toEqual({
      from: "a",
      signal: {
        candidate: { ...candidate, sdpMid: "0", usernameFragment: null },
      },
    });
    a.send({ type: "signal", payload: { to: "b", signal: { candidate: null } } });
    expect((await b.next("signal")).payload).toEqual({ from: "a", signal: { candidate: null } });
  });

  it("broadcasts text shares excluding the sender", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    const share = { id: "t1", text: "hello", customName: "note", timestamp: 42 };
    a.sendBytes(JSON.stringify({ type: "text-share", payload: share }));

    expect((await b.next("text-share")).payload).toEqual(share);
    expect(await a.none("text-share")).toBe(true);
  });

  it("overrides chat sender identity and excludes the sender", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    a.send({
      type: "chat-message",
      payload: {
        id: "m1",
        text: "hi",
        senderId: "b",
        senderName: "Fake",
        timestamp: 7,
      },
    });

    expect((await b.next("chat-message")).payload).toEqual({
      id: "m1",
      text: "hi",
      timestamp: 7,
      senderId: "a",
      senderName: getChatName("a"),
    });
    expect(await a.none("chat-message")).toBe(true);
  });

  it("never relays file frames", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    a.send({ type: "file-meta", payload: { fileId: "f", name: "x", size: 1, mime: "x" } });
    a.send({ type: "file-chunk", payload: { fileId: "f", chunk: "AAAA", offset: 0, final: true } });
    expect((await a.next("error")).payload).toEqual({ code: "unsupported-type" });
    expect((await a.next("error")).payload).toEqual({ code: "unsupported-type" });
    expect(await b.none("file-meta")).toBe(true);
    expect(await b.none("file-chunk")).toBe(true);
  });

  it("enforces text, chat, signal, and frame bounds", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    a.send({ type: "text-share", payload: { id: "t", text: "x".repeat(70 * 1024) } });
    expect((await a.next("error")).payload).toEqual({ code: "invalid-text-share" });

    a.send({ type: "chat-message", payload: { id: "m", text: "x".repeat(1001) } });
    expect((await a.next("error")).payload).toEqual({ code: "invalid-chat-message" });

    a.send({
      type: "signal",
      payload: { to: "ghost", signal: { description: { type: "offer", sdp: "x".repeat(20 * 1024) } } },
    });
    expect((await a.next("error")).payload).toEqual({ code: "invalid-signal" });

    a.sendBytes("x".repeat(600 * 1024));
    expect((await a.next("error")).payload).toEqual({ code: "frame-too-large" });
  });

  it("rate limits frames per client", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    for (let i = 0; i < 305; i++) a.send({ type: "ping" });

    const codes: string[] = [];
    for (let i = 0; i < 305; i++) {
      codes.push(String((await a.next("error", 5000)).payload?.code));
    }
    expect(codes.filter((code) => code === "rate-limited")).toHaveLength(5);
    expect(codes.filter((code) => code === "unsupported-type")).toHaveLength(300);
  });
});

describe("hibernation", () => {
  it("keeps membership, routing, and rate state across eviction", async () => {
    const room = roomId();
    const a = await join(room, "a");
    const b = await join(room, "b");
    await a.next("room-state");
    await a.next("room-state");
    await b.next("room-state");

    const stub = env.ROOMS.getByName(`room:${room}`);
    await evictDurableObject(stub, { webSockets: "hibernate" });

    a.send({
      type: "chat-message",
      payload: { id: "m2", text: "after eviction", senderName: "Fake", timestamp: 9 },
    });
    expect((await b.next("chat-message")).payload).toMatchObject({
      id: "m2",
      senderId: "a",
      senderName: getChatName("a"),
    });

    const c = await join(room, "c");
    expect((await c.next("room-state")).payload).toEqual({
      clientCount: 3,
      peerIds: ["a", "b", "c"],
      clientId: "c",
    });

    const frames = await runInDurableObject(stub, (_instance, state) => {
      const socket = state.getWebSockets().find((socket) => socket.deserializeAttachment()?.clientId === "a");
      return socket?.deserializeAttachment()?.frameCount ?? 0;
    });
    expect(frames).toBeGreaterThan(0);
  });
});

describe("ice-request over the socket", () => {
  it("returns STUN only when TURN is disabled", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    a.send({ type: "ice-request", payload: {} });
    expect((await a.next("ice-config")).payload).toEqual({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      turnEnabled: false,
      expiresAt: 0,
    });
  });
});
