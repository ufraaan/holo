import { DurableObject } from "cloudflare:workers";
import { getChatName } from "./chat-names";
import { errorName, log } from "./log";
import { decodeFrame, parseClientFrame, type Signal } from "./protocol";
import { mintTurnCredentials, STUN_ONLY, TURN_TTL_SECONDS, type IceServer } from "./turn";

/**
 * One Durable Object per room. Signaling only: no chat, text, or file bytes
 * are ever persisted. Membership and per-socket rate state live in WebSocket attachments, with
 * room-level TURN issuance counters in SQLite, so hibernation/eviction loses nothing.
 */

const MAX_PEERS = 10;
const FRAME_LIMIT = 300;
const FRAME_WINDOW_MS = 60_000;
const ICE_MIN_INTERVAL_MS = 60_000;
const ROOM_LIFETIME_MS = 3_600_000;
const ROOM_EXPIRED_CODE = 4001;
const ROOM_EXPIRED_REASON = "room-expired";
export const TURN_HOURLY_LIMIT = 180;
const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CLIENT_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

interface Attachment {
  clientId: string;
  /** Secret claimed on first join; a reconnect must present the same value. */
  token: string;
  /** Set on the stale socket while a duplicate client id replaces it. */
  replaced?: boolean;
  windowStart?: number;
  frameCount?: number;
  iceLast?: number;
}

export interface IceConfig {
  iceServers: IceServer[];
  turnEnabled: boolean;
  expiresAt: number;
}

export type IceResult =
  | { ok: true; config: IceConfig }
  | { ok: false; code: "ice-rate-limited" };

function stunOnly(): IceResult {
  return { ok: true, config: { iceServers: STUN_ONLY, turnEnabled: false, expiresAt: 0 } };
}

function isTurnEnabled(value: string): boolean {
  return value === "true";
}

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS turn_usage (
          hour_start INTEGER PRIMARY KEY,
          issued INTEGER NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_session (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          expires_at INTEGER NOT NULL
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") ?? "";
    const clientId = url.searchParams.get("clientId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!ROOM_ID.test(roomId) || !CLIENT_ID.test(clientId) || !CLIENT_TOKEN.test(token)) {
      return Response.json({ error: "bad-request" }, { status: 400 });
    }

    const now = Date.now();
    let expiresAt = this.sessionExpiry();
    if (expiresAt !== null && now >= expiresAt) {
      this.closeExpired();
      if (this.peers().size > 0) return this.expiredResponse();
      await this.releaseExpiredSession();
      expiresAt = null;
    }

    const peers = this.peers();
    const previous = peers.get(clientId);
    if (!previous && peers.size >= MAX_PEERS) {
      return Response.json({ error: "room-full" }, { status: 409 });
    }
    const previousAttachment = previous ? this.attachment(previous) : null;
    // Only the tab that claimed this id may replace it; otherwise any peer that
    // read `peerIds` from room-state could evict and impersonate it.
    if (previous && previousAttachment?.token !== token) {
      return Response.json({ error: "id-in-use" }, { status: 409 });
    }
    // A reload can race the old socket's close; mark it replaced so peerIds
    // stays unique no matter which socket the runtime reports first.
    if (previous) {
      try {
        previous.serializeAttachment({ clientId, token, replaced: true } satisfies Attachment);
      } catch {
        // socket already closing
      }
      try {
        previous.close(4000, "replaced");
      } catch {
        // already closing
      }
    }

    if (expiresAt === null) {
      expiresAt = this.startSession(now);
      await this.ctx.storage.setAlarm(expiresAt);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...previousAttachment, clientId, token } satisfies Attachment);

    this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    const expiresAt = this.sessionExpiry();
    if (expiresAt === null) return;
    if (Date.now() < expiresAt) {
      await this.ctx.storage.setAlarm(expiresAt);
      return;
    }
    this.closeExpired();
    await this.releaseExpiredSession();
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = this.attachment(ws);
    if (!attachment) return;

    const expiresAt = this.sessionExpiry();
    if (expiresAt !== null && Date.now() >= expiresAt) {
      this.closeExpired();
      return;
    }

    if (!this.allowFrame(ws, attachment)) {
      this.fail(ws, "rate-limited");
      return;
    }

    const raw = decodeFrame(message);
    if (raw === null) {
      this.fail(ws, "frame-too-large");
      return;
    }

    const parsed = parseClientFrame(raw);
    if (!parsed.ok) {
      this.fail(ws, parsed.code);
      return;
    }

    switch (parsed.frame.type) {
      case "signal":
        this.routeSignal(ws, attachment.clientId, parsed.frame.to, parsed.frame.signal);
        return;

      case "text-share":
        this.broadcast(
          { type: "text-share", payload: parsed.frame.payload },
          ws,
        );
        return;

      case "chat-message": {
        const { id, text, timestamp } = parsed.frame.payload;
        this.broadcast(
          {
            type: "chat-message",
            payload: {
              id,
              text,
              timestamp,
              // Never trust a client-supplied sender identity.
              senderId: attachment.clientId,
              senderName: getChatName(attachment.clientId),
            },
          },
          ws,
        );
        return;
      }

      case "ice-request": {
        const result = await this.iceConfig(attachment.clientId);
        if (!result.ok) {
          this.fail(ws, result.code);
          return;
        }
        this.send(ws, { type: "ice-config", payload: result.config });
        return;
      }

      case "join":
        return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Compatibility date 2026-11-18 auto-replies to the close frame.
    this.broadcastState(ws);
    await this.releaseExpiredSession(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastState(ws);
    await this.releaseExpiredSession(ws);
  }

  /** Exposed for tests; production paths call iceConfig(). */
  async buildIceConfig(
    env: Env,
    clientId: string,
    mint: (env: Env) => Promise<IceServer[] | null> = mintTurnCredentials,
  ): Promise<IceResult> {
    if (!isTurnEnabled(env.TURN_ENABLED)) return stunOnly();
    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
      log("warn", "turn_not_configured");
      return stunOnly();
    }

    const now = Date.now();
    const socket = this.peers().get(clientId);
    const attachment = socket ? this.attachment(socket) : null;
    if (!socket || !attachment || (attachment.iceLast && now - attachment.iceLast < ICE_MIN_INTERVAL_MS)) {
      return { ok: false, code: "ice-rate-limited" };
    }
    if (!this.reserveTurnSlot(now)) {
      log("warn", "turn_hourly_cap");
      return stunOnly();
    }
    socket.serializeAttachment({ ...attachment, iceLast: now });

    const servers = await mint(env);
    if (!servers) {
      // The reserved slot stays spent on purpose: failures must not become a
      // free retry loop against the TURN API.
      log("warn", "turn_mint_failed");
      return stunOnly();
    }

    return {
      ok: true,
      config: {
        iceServers: servers,
        turnEnabled: true,
        expiresAt: now + TURN_TTL_SECONDS * 1000,
      },
    };
  }

  private iceConfig(clientId: string): Promise<IceResult> {
    return this.buildIceConfig(this.env, clientId, mintTurnCredentials);
  }

  private reserveTurnSlot(now: number): boolean {
    const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
    this.ctx.storage.sql.exec(
      "DELETE FROM turn_usage WHERE hour_start < ?",
      hourStart - 3_600_000,
    );
    const used = this.ctx.storage.sql
      .exec<{ issued: number }>("SELECT issued FROM turn_usage WHERE hour_start = ?", hourStart)
      .toArray()[0];
    if ((used?.issued ?? 0) >= TURN_HOURLY_LIMIT) return false;
    this.ctx.storage.sql.exec(
      `INSERT INTO turn_usage (hour_start, issued) VALUES (?, 1)
       ON CONFLICT(hour_start) DO UPDATE SET issued = issued + 1`,
      hourStart,
    );
    return true;
  }

  private sessionExpiry(): number | null {
    const row = this.ctx.storage.sql
      .exec<{ expires_at: number }>("SELECT expires_at FROM room_session WHERE id = 1")
      .toArray()[0];
    return row?.expires_at ?? null;
  }

  private startSession(now: number): number {
    const expiresAt = now + ROOM_LIFETIME_MS;
    this.ctx.storage.sql.exec(
      "INSERT INTO room_session (id, expires_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at",
      expiresAt,
    );
    return expiresAt;
  }

  private closeExpired(): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (!this.attachment(socket)) continue;
      try {
        socket.close(ROOM_EXPIRED_CODE, ROOM_EXPIRED_REASON);
      } catch {
        // already closing
      }
    }
  }

  private expiredResponse(): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.close(ROOM_EXPIRED_CODE, ROOM_EXPIRED_REASON);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async releaseExpiredSession(exclude?: WebSocket): Promise<void> {
    const expiresAt = this.sessionExpiry();
    if (expiresAt === null || Date.now() < expiresAt) return;
    const remaining = this.ctx.getWebSockets().some(
      (socket) => socket !== exclude && this.attachment(socket) !== null,
    );
    if (remaining) return;
    this.ctx.storage.sql.exec("DELETE FROM room_session WHERE id = 1");
    await this.ctx.storage.deleteAlarm();
  }

  /** Socket attachments survive hibernation without a storage write per message. */
  private allowFrame(ws: WebSocket, attachment: Attachment): boolean {
    const windowStart = Math.floor(Date.now() / FRAME_WINDOW_MS) * FRAME_WINDOW_MS;
    const frameCount = attachment.windowStart === windowStart ? (attachment.frameCount ?? 0) + 1 : 1;
    ws.serializeAttachment({ ...attachment, windowStart, frameCount });
    return frameCount <= FRAME_LIMIT;
  }

  private routeSignal(ws: WebSocket, from: string, to: string, signal: Signal): void {
    if (to === from) {
      this.fail(ws, "invalid-target");
      return;
    }
    const target = this.peers().get(to);
    if (!target) {
      this.fail(ws, "peer-not-found");
      return;
    }
    this.send(target, { type: "signal", payload: { from, signal } });
  }

  /** Live sockets, deduped by client id (the newest socket wins). */
  private peers(): Map<string, WebSocket> {
    const peers = new Map<string, WebSocket>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (attachment) peers.set(attachment.clientId, socket);
    }
    return peers;
  }

  private attachment(ws: WebSocket): Attachment | null {
    const value = ws.deserializeAttachment() as Partial<Attachment> | null;
    if (!value || value.replaced === true) return null;
    if (typeof value.clientId !== "string" || !CLIENT_ID.test(value.clientId)) {
      return null;
    }
    if (typeof value.token !== "string" || !CLIENT_TOKEN.test(value.token)) {
      return null;
    }
    return { ...value, clientId: value.clientId, token: value.token };
  }

  private broadcastState(exclude?: WebSocket): void {
    const peers = this.peers();
    if (exclude) {
      const attachment = this.attachment(exclude);
      const mapped = attachment ? peers.get(attachment.clientId) : undefined;
      // Only the socket that currently represents this id counts as leaving;
      // a replaced stale socket must not remove its successor.
      if (attachment && mapped === exclude) peers.delete(attachment.clientId);
    }
    const peerIds = [...peers.keys()].sort();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue;
      const attachment = this.attachment(socket);
      if (!attachment) continue;
      this.send(socket, {
        type: "room-state",
        payload: {
          clientCount: peerIds.length,
          peerIds,
          clientId: attachment.clientId,
        },
      });
    }
  }

  private broadcast(frame: unknown, exclude: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== exclude && this.attachment(socket)) this.send(socket, frame);
    }
  }

  private fail(ws: WebSocket, code: string): void {
    this.send(ws, { type: "error", payload: { code } });
  }

  private send(ws: WebSocket, frame: unknown): void {
    try {
      ws.send(JSON.stringify(frame));
    } catch (err) {
      log("warn", "ws_send_failed", { error: errorName(err) });
    }
  }
}
