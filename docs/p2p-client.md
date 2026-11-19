# Holo P2P transfers (client)

The frontend uses WebRTC for every file transfer and Cloudflare WebSockets for
room coordination, chat, and text. There is no alternative file-relay transport.

## Enabling it

```bash
# frontend/.env.local (or Vercel's environment settings at build time)
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8788/ws
```

```bash
cd signaling && bun run dev -- --port 8788
```

Hosted instances require a `wss://` signaling endpoint. The previous relay URL
setting is ignored. Configure a branch-specific Preview variable for PRs.

## What goes over the socket

The WebSocket is signaling, presence, chat and text only. No file bytes ever
cross it.

Client to server:

```json
{ "type": "signal", "payload": { "to": "<peerId>", "signal": { } } }
{ "type": "ice-request", "payload": {} }
```

Server to client:

```json
{ "type": "room-state", "payload": { "clientCount": 2, "peerIds": ["me", "them"], "clientId": "me" } }
{ "type": "signal", "payload": { "from": "them", "signal": { } } }
{ "type": "ice-config", "payload": { "iceServers": [], "turnEnabled": false, "expiresAt": 0 } }
```

`room-state.peerIds` includes the local client; the hook filters it out. The
worker sanitizes the sender id, so `signal.from` is always a peer id, never a
client-supplied spoof. ICE config is cached for at most two minutes and never beyond shortly before
`expiresAt` (seconds or milliseconds both accepted) and re-requested for new
peer connections. TURN credentials are delivered by the worker inside
`iceServers`; the frontend never holds the TURN API token.

The hook auto-reconnects signaling with bounded exponential backoff (500 ms →
8 s) using the same `clientId` and `token`. Reconnecting does **not** destroy the
`PeerTransferManager` or drop received chunks; only a room change, client
change or unmount does.

## Multiple files and queueing

The file picker accepts multiple files; dropping multiple files uses the same path.
Each recipient has an independent FIFO queue. Only the first nonterminal file is
offered, so a large selection does not flood the receiver with pending offers.
Later files show "Queued" on the sender and can be cancelled before being offered.

The next file is offered when the current file completes, is declined, fails, or
is cancelled. Pausing or reconnecting the current transfer holds that recipient's
queue. New selections append to the queue. Each file still requires individual
acceptance, preserving the user gesture needed for the native save picker.
Other recipients and transfers in the opposite direction run independently.

## Limits

| Situation | Limit |
|---|---|
| Sending (any browser) | 3 GiB per file (`MAX_FILE_BYTES`) |
| Receiving, File System Access API (Chromium desktop) | 3 GiB, saved straight to disk |
| Receiving, memory fallback | 100 MiB aggregate (`MEMORY_LIMIT_BYTES`) |
| Unaccepted offers per peer | 64 (`MAX_PENDING_INBOUND`); further offers are cancelled, and cancelling an offered transfer frees its slot |

Both tabs must stay open for the whole transfer. There is no resume across
page reloads or across devices/tabs that were closed — recovery covers a
signaling reconnect in the same tab only.

`supportsDiskSaving()` from `./p2p/types` decides which receiving limit the UI
announces. Memory-mode files are offered as a Blob download; disk-mode
completions show "Saved to disk" and no download link.

## Hook surface

`useRoomWebSocket({ roomId, clientId, token })` exposes:

```ts
p2pEnabled: boolean;
peers: { id: string; name: string }[];
p2pError: string | null;
canReceiveToDisk: boolean;
acceptTransfer(id: string): void; // call from the click handler, keeps the save picker gesture
pauseTransfer(id: string): void;
resumeTransfer(id: string): void;
cancelTransfer(id: string): void;
handleFiles(files: FileList | null, peerIds?: string[]): Promise<void>;
```

Transfers stay a `Record<string, Transfer>` keyed by the engine's
recipient-scoped id (`out:<peerId>:<fileId>` / `in:<peerId>:<fileId>`).
P2P adds optional fields to `Transfer`: `peerId`, `peerName`, `connectionType`,
`status`, `bytesTransferred`, `error`, `savedToDisk`.

## Errors you will see

- WebRTC missing in the browser: direct transfers disabled, chat/text still work.
- Room has no other peer: sending is blocked with a "nobody else here" hint.
- Signaling down: `ICE` request rejects with a timeout message; the room keeps
  retrying in the background.
- User dismisses the save picker: the rejection is caught and shown as an error
  on the transfer card, never as an unhandled promise.

## Local verification

Run `bun run check` in both `frontend/` and `signaling/`. From `frontend/`,
`bun run test:e2e` starts isolated Next.js and Worker processes on ports
3001 and 8788, with explicit P2P configuration and no TURN credentials.
It checks three-person chat/file sharing, byte-exact downloads, and pause plus
same-tab recovery over real Chromium data channels. Install Playwright's
Chromium with `bunx playwright install chromium` if it is not present.

Completed in-memory transfers retain their download until removed. Use
**Remove** after saving to release their memory budget. Both tabs must remain
open; no file content or resumable-transfer metadata is stored server-side.
