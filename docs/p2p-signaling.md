# Holo P2P signaling

The room backend lives in `signaling/`. Each deployment has its own Worker and
room namespace. File data never passes through this service.

## Shape

```
sender tab ──ws──> Worker /ws ──> Durable Object "room:<roomId>" <──ws── receiver tab
    │                                                                   │
    └────────────────── WebRTC data channels (files) ───────────────────┘
```

- One Cloudflare Worker (`signaling/src/index.ts`) validates the request and
  forwards `/ws?roomId=X&clientId=Y` to `ROOMS.getByName("room:" + roomId)`.
- One SQLite-backed Durable Object per room (`signaling/src/room.ts`), using the
  WebSocket Hibernation API (`ctx.acceptWebSocket`).
- Membership is derived from `ctx.getWebSockets()` + serialized attachments on
  every event; there is no in-memory membership cache to rebuild.
- The relay never sees file bytes. `file-meta`/`file-chunk` frames are rejected.

## Protocol

The full contract, limits, and error codes live in
[`signaling/README.md`](../signaling/README.md). The client-side view is
[`docs/p2p-client.md`](./p2p-client.md); keep the two in sync.

Join flow:

1. Client opens `ws(s)://<signaling-host>/ws?roomId=<room>&clientId=<tab id>&token=<secret>`.
2. Worker checks `Origin` against `ORIGINS`, validates all three values, upgrades.
3. Room accepts the socket, tags it with `{clientId, token}`, broadcasts `room-state`
   to everyone. `peerIds` includes the recipient itself.
4. Each peer offers to the others through `{type:"signal", payload:{to,signal}}`.
   The server stamps `from` from the socket, so a client cannot spoof a sender.
5. ICE servers come from the same socket: `{type:"ice-request", payload:{}}` →
   `{type:"ice-config", payload:{iceServers, turnEnabled, expiresAt}}`.
   `expiresAt` is epoch milliseconds (`0` for STUN-only). Credentials renew at
   most once per minute per socket.
6. Chat and text shares ride the same socket and are broadcast excluding the
   sender. Chat `senderId`/`senderName` are server-assigned.

Reconnect with the same `clientId` and `token` replaces the previous socket (close
code `4000`), which keeps `peerIds` unique across reload races. A client that
presents a different token for a live `clientId` gets `409 id-in-use` and the
live socket is left alone, so a room peer cannot evict or impersonate another.

## TURN

`TURN_ENABLED` defaults to `false`; the Worker then returns Cloudflare STUN only.
When enabled and `TURN_KEY_ID` + `TURN_API_TOKEN` are configured as Wrangler
secrets, the Durable Object mints 600-second credentials from
`https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`.
The key and token never leave the Worker; the response is filtered to
`urls`/`username`/`credential` with `stun:`/`stuns:`/`turn:`/`turns:` URLs only.
Any configuration or upstream failure falls back to STUN.

## Security boundaries

- Exact origin allowlist, no wildcard; a missing `Origin` is rejected.
- 10 peers per room; 300 frames/min/client; 512 KiB frame ceiling; 64 KiB text,
  1000-char chat, 16 KiB SDP, 4 KiB candidate.
- Per-socket rate windows live in WebSocket attachments and survive hibernation.
  Only the bounded room-level TURN issuance counter is written to SQLite.
- No logging of message bodies, SDP, room/client ids, or tokens; health exposes
  only whether TURN is on.
- No persistence of chat, text, or files; when the last socket closes the room
  has no members and the Durable Object hibernates.

## Local try-out

```bash
cd signaling
bun install
bun run dev -- --port 8788        # http://localhost:8788
```

```bash
# frontend/.env.local
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8788/ws
```

The Worker's default `ORIGINS` is `http://localhost:3000`, matching the
frontend dev server. Set a production origin before any deployment.

## Not covered

- Deployment, DNS, and secrets provisioning are intentionally out of scope here.
- Free-plan quotas are not guarantees; TURN spend has no hard cap in code.
- No deployment or production switch is performed by the local setup.
