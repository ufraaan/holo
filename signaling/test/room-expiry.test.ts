import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { attempt, open, type Client } from "./connect";

const clients: Client[] = [];
let roomCounter = 0;

function roomId(): string {
  roomCounter += 1;
  return `x-${roomCounter}-${crypto.randomUUID().slice(0, 6).toLowerCase()}`;
}

async function join(room: string, clientId: string): Promise<Client> {
  const client = await open(room, clientId);
  clients.push(client);
  return client;
}

type Stub = ReturnType<typeof env.ROOMS.getByName>;

function stubFor(room: string): Stub {
  return env.ROOMS.getByName(`room:${room}`);
}

async function sessionState(stub: Stub): Promise<{ expiresAt: number | null; alarm: number | null }> {
  return runInDurableObject(stub, async (_instance, state) => {
    const row = state.storage.sql
      .exec<{ expires_at: number }>("SELECT expires_at FROM room_session WHERE id = 1")
      .toArray()[0];
    return { expiresAt: row?.expires_at ?? null, alarm: await state.storage.getAlarm() };
  });
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

describe("room session lifetime", () => {
  it("starts one hour after the first join and does not extend on later joins", async () => {
    const room = roomId();
    const before = Date.now();
    const a = await join(room, "a");
    await a.next("room-state");
    const after = Date.now();

    const stub = stubFor(room);
    const first = await sessionState(stub);
    expect(first.expiresAt).not.toBeNull();
    expect(first.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(first.expiresAt).toBeLessThanOrEqual(after + 3_600_000);
    expect(first.alarm).toBe(first.expiresAt);

    const b = await join(room, "b");
    await b.next("room-state");
    expect(await sessionState(stub)).toEqual(first);
  });

  it("keeps the persisted deadline and alarm across hibernation", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    const stub = stubFor(room);
    const before = await sessionState(stub);
    await evictDurableObject(stub, { webSockets: "hibernate" });
    expect(await sessionState(stub)).toEqual(before);
  });

  it("closes every socket at expiry and starts a fresh session once they close", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");
    const b = await join(room, "b");
    await a.next("room-state");
    await b.next("room-state");

    const stub = stubFor(room);
    const original = await sessionState(stub);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("UPDATE room_session SET expires_at = ? WHERE id = 1", Date.now() - 1_000);
      await state.storage.setAlarm(Date.now());
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await a.waitClosed()).toEqual({ code: 4001, reason: "room-expired" });
    expect(await b.waitClosed()).toEqual({ code: 4001, reason: "room-expired" });

    const c = await join(room, "c");
    expect((await c.next("room-state")).payload).toMatchObject({
      clientCount: 1,
      peerIds: ["c"],
    });

    const fresh = await sessionState(stub);
    expect(fresh.expiresAt).not.toBeNull();
    expect(fresh.expiresAt).toBeGreaterThan(original.expiresAt ?? 0);
    expect(fresh.alarm).toBe(fresh.expiresAt);
  });

  it("closes expired sockets instead of handling their frames before the alarm runs", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");
    const b = await join(room, "b");
    await a.next("room-state");
    await b.next("room-state");

    const stub = stubFor(room);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("UPDATE room_session SET expires_at = ? WHERE id = 1", Date.now() - 1_000);
    });

    a.send({ type: "chat-message", payload: { id: "late", text: "after expiry", timestamp: Date.now() } });
    expect(await a.waitClosed()).toEqual({ code: 4001, reason: "room-expired" });
    expect(await b.waitClosed()).toEqual({ code: 4001, reason: "room-expired" });
    expect(await b.none("chat-message")).toBe(true);
  });

  it("rejects a join with the expired close code while the old session is still closing", async () => {
    const room = roomId();
    const a = await join(room, "a");
    await a.next("room-state");

    const stub = stubFor(room);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec("UPDATE room_session SET expires_at = ? WHERE id = 1", Date.now() - 1_000);
    });

    const rejected = await attempt(room, "b");
    expect(rejected.status).toBe(101);
    const socket = rejected.webSocket;
    expect(socket).not.toBeNull();

    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      socket!.addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
    });
    socket!.accept();
    expect(await closed).toEqual({ code: 4001, reason: "room-expired" });
    expect(await a.waitClosed()).toEqual({ code: 4001, reason: "room-expired" });
  });

  it("does not arm an alarm before the first join", async () => {
    const room = roomId();
    const stub = stubFor(room);
    expect(await sessionState(stub)).toEqual({ expiresAt: null, alarm: null });
  });
});
