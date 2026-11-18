<p align="center">
  <img src="frontend/public/holo-banner.png" alt="holo" width="600">
</p>

# holo

Ephemeral file, text, and chat sharing. Create a room, share its code, and connect
without an account. Available in English, Spanish, French, Portuguese, German,
and Hindi.

## how it works

```text
browser ── WebSocket ── Cloudflare Worker / room Durable Object ── WebSocket ── browser
   └──────────────── encrypted WebRTC file transfer ──────────────────────────┘
                         ↳ TURN when a direct path fails
```

Cloudflare handles room membership, chat, text, and WebRTC connection setup.
File bytes travel over reliable binary data channels. TURN relays encrypted
traffic when the browsers cannot connect directly. There is no Go server and no
application relay.

Transfers have independent progress and controls for each recipient. The sender
advances from receiver acknowledgments after checksum validation and writing.
Pause, resume, and reconnect recovery retain progress while both tabs remain
open. Refreshing or closing a tab ends that transfer session.

- Up to **3 GiB per file** on receivers that support saving directly to disk.
- **100 MiB total** for in-memory receiving on other browsers; remove saved
  transfers to free the budget.
- Receivers accept files before data starts. Large files open a save picker.
- Sending to several recipients uploads one copy per recipient.
- Rooms currently allow up to ten participants. No chat or file content is
  persisted by the signaling service.

## structure

```text
frontend/                       Next.js website and six locales
  components/room/              room WebSocket, chat, text, and transfer UI
    p2p/                        WebRTC, checksums, pause/resume, receive sinks
signaling/                      Cloudflare Worker and per-room Durable Objects
  src/                          protocol validation, membership, TURN credentials
  test/                         workerd integration tests
```

## running locally

Requires Bun and Node.js 24 or later. No Go installation is needed.

```bash
bun install
cd signaling && bun install
cd ../frontend && bun install
```

Terminal 1, from the repository root:

```bash
cd signaling
bun run dev -- --port 8788
```

Terminal 2, from the repository root:

```bash
cd frontend
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8788/ws bun run dev
```

Open `http://localhost:3000` in two tabs. Local TURN is disabled by default;
configure credentials to test restrictive networks. Port 8788 avoids conflicts
with other services using Wrangler's default 8787.

For a hosted frontend, **set `NEXT_PUBLIC_SIGNALING_URL` at build time** to its
Cloudflare `wss://…/ws` endpoint. There is no fallback to an older relay URL.

## verification

```bash
bun run check                   # signaling + frontend checks
cd frontend && bun run test:e2e  # local Worker + real Chromium transfers
```

The browser suite covers three-person chat and file sharing, byte-exact
receiving, streaming above the memory limit to browser disk, and pause/reconnect
recovery. Install Chromium with `bunx playwright install chromium` if needed.
The disk test replaces the OS picker with a real browser file writer; the native
picker still needs a manual check. A full 3 GiB transfer is not yet benchmarked.

## deployment

Production needs a Cloudflare Worker with its own room namespace, TURN
credentials stored as Worker secrets, an exact `ORIGINS` allowlist, and Vercel's
Production `NEXT_PUBLIC_SIGNALING_URL` pointing at that Worker. Set the Vercel
variable before the build that serves traffic; it is inlined at build time and
there is no runtime fallback.

Preview deployments use their own Worker and room namespace selected by Vercel's
branch-specific Preview variable. Merging source does not create or delete a
hosting account or service; retire the old Render service separately once the
Worker deployment is verified.

See [signaling setup](signaling/README.md), [client protocol](docs/p2p-client.md),
and [contributing](CONTRIBUTING.md).

## docker

Docker Compose runs the frontend only. Run or deploy the Cloudflare Worker
separately and provide the URL that the user's browser can reach:

```bash
NEXT_PUBLIC_SIGNALING_URL=wss://your-worker.workers.dev/ws docker compose up --build
```

## license

[MIT](LICENSE) · [live site](https://holo.ufraan.dev) ·
[issues](https://github.com/ufraaan/holo/issues)
