# holo-signaling

Signaling backend for Holo's peer-to-peer transfers: a Cloudflare Worker that
upgrades `/ws` and forwards it to **one SQLite-backed Durable Object per room**.
It relays presence, SDP/ICE signaling, chat, and text shares. File bytes never
reach this Worker.

This Worker is the only room backend. Set
`NEXT_PUBLIC_SIGNALING_URL=wss://<worker>.workers.dev/ws` when building the
frontend. File bytes travel over WebRTC, directly or through TURN.

## API contract

### HTTP

| Route | Result |
|---|---|
| `GET /health` | `200 {"status":"ok","service":"holo-signaling","turnEnabled":boolean}` |
| `GET /ws?roomId=<id>&clientId=<id>&token=<secret>` with `Upgrade: websocket` and an allowlisted `Origin` | `101` |
| `/ws` without upgrade | `426` |
| `/ws` with a missing/unlisted `Origin` | `403 {"error":"origin-not-allowed"}` |
| `/ws` with an invalid `roomId`/`clientId`/`token` | `400 {"error":"bad-request"}` |
| `/ws` when the room already has 10 other peers | `409 {"error":"room-full"}` |
| `/ws` when another socket holds that `clientId` with a different token | `409 {"error":"id-in-use"}` |
| anything else | `404` |

`roomId` matches `^[a-z0-9][a-z0-9-]{0,63}$`, `clientId` matches
`^[A-Za-z0-9_-]{1,64}$`, and `token` matches `^[A-Za-z0-9_-]{16,64}$`. A tab
generates `clientId` and `token` together and keeps them in memory for its whole
lifetime. Reconnecting with the same `clientId` **and** token replaces the old
socket (the old one is closed with code `4000`, reason `replaced`). A caller
holding only an observed `clientId` is refused, so peers cannot evict or
impersonate each other.

### Client → server

```json
{ "type": "signal", "payload": { "to": "<clientId>", "signal": { "description": { "type": "offer", "sdp": "..." } } } }
{ "type": "signal", "payload": { "to": "<clientId>", "signal": { "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 } } } }
{ "type": "text-share", "payload": { "id": "<id>", "text": "...", "customName": "optional", "timestamp": 0 } }
{ "type": "chat-message", "payload": { "id": "<id>", "text": "...", "timestamp": 0 } }
{ "type": "ice-request", "payload": {} }
```

`join` is accepted and ignored (membership comes from the URL). `file-meta` and
`file-chunk` are rejected: files are peer-to-peer only.

### Server → client

```json
{ "type": "room-state", "payload": { "clientCount": 2, "peerIds": ["me", "them"], "clientId": "me" } }
{ "type": "signal", "payload": { "from": "them", "signal": { } } }
{ "type": "text-share", "payload": { "id": "...", "text": "...", "customName": "...", "timestamp": 0 } }
{ "type": "chat-message", "payload": { "id": "...", "text": "...", "timestamp": 0, "senderId": "them", "senderName": "Yuki" } }
{ "type": "ice-config", "payload": { "iceServers": [ { "urls": "...", "username": "...", "credential": "..." } ], "turnEnabled": true, "expiresAt": 1760000000000 } }
{ "type": "error", "payload": { "code": "rate-limited" } }
```

- `room-state` is recomputed after every join/replacement/close and broadcast to
  every connected client. `peerIds` includes the recipient's own `clientId`.
- `signal` is delivered only to `to`. The `from` field is assigned from the
  socket, never from the client payload.
- `text-share` and `chat-message` are broadcast to every other client. Chat
  `senderId`/`senderName` are overridden from the socket identity
  (`senderName` uses the same hash as the frontend's `getChatName`).
- `expiresAt` is an epoch-milliseconds timestamp; `0` when only STUN is returned.
  Renewing TURN credentials is allowed at most once per 60 s per socket; an
  earlier request gets `{"code":"ice-rate-limited"}` and should keep the cached
  config.

Error codes: `frame-too-large`, `rate-limited`, `bad-json`, `bad-frame`,
`invalid-signal`, `invalid-target`, `peer-not-found`, `invalid-text-share`,
`invalid-chat-message`, `unsupported-type`, `ice-rate-limited`.

### Limits

| Limit | Value |
|---|---|
| Peers per room | 10 client ids |
| Frames per client | 300 per 60 s fixed window (persisted) |
| Frame size | 512 KiB (64 KiB is the text-share payload limit, UTF-8 bytes) |
| Chat message | 1000 characters |
| SDP | 16 KiB |
| ICE candidate | 4 KiB |
| ICE renewal | 1 per 60 s per socket |
| TURN credential issuance | 180 per room per hour |
| TURN credential TTL | 600 s |
| Room state | none persisted; membership drops to zero when the last socket leaves |

No chat, text, SDP, or file data is written to storage. Membership lives in
WebSocket attachments; per-socket counters also live in attachments; only the room-level
TURN issuance counter (`turn_usage`) lives in SQLite, so hibernation/eviction loses nothing.

A 180-issuance hourly room budget accommodates ten peers refreshing credentials
every four minutes (150 issuances/hour). This limits API calls, not TURN bytes
or spending. Null ICE candidates are forwarded as `{ "candidate": null }`.

## Local development

```bash
cd signaling
bun install
bun run dev -- --port 8788   # http://localhost:8788
curl http://localhost:8788/health
```

Wrangler's default port is 8787; pass `--port 8788` if it is taken:
`bun run dev -- --port 8788`.

The Worker only accepts the origins listed in `ORIGINS` (comma-separated,
exact `scheme://host:port`, no wildcards). The checked-in default is
`http://localhost:3000`, which is what the Next.js dev server uses.

TURN is off by default. To enable it locally:

```bash
cp .dev.vars.example .dev.vars   # fill TURN_KEY_ID and TURN_API_TOKEN
# set "TURN_ENABLED": "true" in wrangler.jsonc
bun run dev
```

For a deployed Worker, never put the key in `wrangler.jsonc`:

```bash
wrangler secret put TURN_KEY_ID
wrangler secret put TURN_API_TOKEN
```

TURN keys are created in the Cloudflare dashboard (Realtime → TURN). The
credential endpoint is
`POST https://rtc.live.cloudflare.com/v1/turn/keys/<TURN_KEY_ID>/credentials/generate-ice-servers`
with `Authorization: Bearer <TURN_API_TOKEN>`.

Before deploying, set `ORIGINS` in `wrangler.jsonc` to the production origin,
for example `https://holo.ufraan.dev`. The `preview` environment deploys the isolated test Worker; the production
frontend has not been switched.

## Checks

```bash
bun run typecheck   # regenerate ignored Worker types, then tsc --noEmit
bun run test        # vitest in workerd via @cloudflare/vitest-plugin
bun run check       # both
bun run types       # regenerate worker-configuration.d.ts after config changes
```

Tests use real WebSocket clients against the Worker, so they cover: origin and
query rejection, room isolation, duplicate client id replacement, `peerIds`
including self, signal routing (and spoofed `from`), chat identity override,
text-share relay, file-frame rejection, every size limit, the per-client frame
budget, the 10-peer cap, TURN disabled/missing-secret/failure fallbacks, the
renewal interval, the hourly issuance cap, the documented TURN request, and a
real Durable Object eviction (`evictDurableObject(..., {webSockets:"hibernate"})`)
proving membership, routing, and rate state survive hibernation.

## Design notes

- **Why a default export.** Wrangler maps `main` to the Worker's default export,
  so the entry point must have one; `Room` is also a named export because a
  Durable Object class has to be reachable from the entry module.
- **Worker vs DO validation.** The Worker validates the origin, method, upgrade
  header, and query before billing a Durable Object request; the DO re-validates
  the query because it is its own trust boundary.
- **Abuse bounds.** Frames are counted before parsing so oversized frames cannot
  skip the budget. TURN slots are reserved before the upstream call and are not
  refunded on failure, which prevents retry amplification. No message content,
  SDP, client id, room id, or token is logged.
- **Duplicate ids.** The stale socket's attachment is marked `replaced`, so it
  is excluded from membership and further messages even if the runtime still
  reports it before its close event lands.
- **Origins are not authentication.** The allowlist stops other websites from
  opening a socket in a visitor's browser; any room code still grants access by
  design, and a scripted client can send any `Origin` it likes.

## Cost and quotas

Cloudflare's free-plan quotas are allowances, not guarantees: each WebSocket
message is a Durable Object request, each HTTP/WS upgrade is a Worker request,
and duration is billed while a Durable Object is awake (hibernation reduces that,
but not message requests). TURN relay usage is billed separately by Cloudflare
Realtime. This code bounds credential issuance (180/room/hour, 600 s TTL, 1
renewal/min/socket) but there is **no hard cap on TURN bandwidth or spend** — set
Billing alerts and monitor Realtime usage. Check current pricing before relying
on free-tier limits.

## Preview deployment

`wrangler deploy --env preview` targets `holo-p2p-preview`, with its own room
namespace. Bind `TURN_KEY_ID` and `TURN_API_TOKEN` as secrets in that environment.
The `ORIGINS` allowlist must contain the exact Vercel branch preview origin;
use its stable branch alias for subsequent commits. Keep production origins and
credentials separate until production rollout is approved.

The Vercel branch setting is `NEXT_PUBLIC_SIGNALING_URL` in Preview, restricted
to `feat/p2p-transfers`. Existing production variables are not changed.

For an explicit live TURN smoke test (small files only):

```bash
cd frontend
HOLO_E2E_SIGNALING_URL=wss://holo-p2p-preview.ufraan.workers.dev/ws HOLO_FORCE_RELAY=1 bun run test:e2e --grep 'three peers'
```

This requires the Worker to allow `http://localhost:3001`; it mints real temporary
credentials and verifies relayed file delivery. No long-lived key reaches the
browser or test output.
