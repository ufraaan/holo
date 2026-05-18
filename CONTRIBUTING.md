# contributing

thanks for taking the time to contribute! here's how to get started.

## project overview

holo is an ephemeral file and text sharing tool. a Go relay server forwards WebSocket messages between browsers. the frontend is a Next.js app that chunks files and renders the UI.

## prerequisites

| tool | version | why |
|---|---|---|
| Go | 1.22+ | backend relay server |
| Bun | latest | frontend package manager and dev server |
| Node.js | 20+ | required by some frontend tooling |

## setup

### 1. clone and install

```bash
git clone https://github.com/ufraaan/holo.git
cd holo

# backend deps
cd backend && go mod tidy && cd ..

# frontend deps
cd frontend && bun install && cd ..
```

### 2. environment

```bash
# frontend
cp frontend/.env.example frontend/.env

# backend (optional — only needed for Sentry)
cp backend/.env.example backend/.env
```

the defaults point the frontend at `ws://localhost:8080/ws` and the backend at `:8080`. that works out of the box.

### 3. run both

terminal 1 — backend:

```bash
cd backend
go run ./cmd/holo-server
```

terminal 2 — frontend:

```bash
cd frontend
bun run dev
```

open `http://localhost:3000`.

### 4. verify

```bash
# frontend
cd frontend && bun run lint    # eslint
bun run typecheck               # tsc --noEmit
bun run test                    # vitest

# backend
cd backend && go vet ./...      # static analysis
go test ./...                   # unit tests
go run ./cmd/holo-server        # starts the relay
```

## codebase structure

```
holo/
├── backend/
│   ├── cmd/holo-server/main.go    # entry point, HTTP server, CORS
│   └── internal/server/
│       ├── client.go              # WebSocket read/write pumps
│       ├── hub.go                 # room registry and garbage collector
│       ├── room.go                # in-memory room state and broadcast
│       └── logging.go             # structured key=value logger
├── frontend/
│   ├── app/
│   │   ├── (main)/page.tsx        # landing page (create/join room)
│   │   ├── room/[roomId]/page.tsx # room page (file drop, text, transfers)
│   │   ├── layout.tsx             # root layout, metadata, analytics
│   │   └── globals.css            # Tailwind v4 + keyframes
│   └── components/
│       ├── BackgroundVideo.tsx     # fullscreen background
│       └── room/
│           ├── useRoomWebSocket.ts # WebSocket connection and reconnection
│           ├── room-utils.ts       # chunking, encoding, formatting
│           ├── RoomHeader.tsx      # room code, status, fullscreen overlay
│           ├── FileDropZone.tsx    # drag-and-drop + file input
│           ├── TextInputArea.tsx   # text compose + send
│           ├── TransferList.tsx    # file/text transfer list with progress
│           └── ConnectionToast.tsx # join/leave notifications
└── .github/
    └── workflows/ci.yml           # CI: lint, typecheck, test, build
```

## making changes

1. create a branch off `master`:

   ```bash
   git checkout -b my-change
   ```

2. make your changes.

3. run all checks locally:

   ```bash
   cd backend   && go test ./... && go vet ./...
   cd ../frontend && bun run lint && bun run typecheck && bun run test
   ```

   these same checks run in CI and as a pre-commit hook.

4. commit and push:

   ```bash
   git add -A
   git commit -m "a short human description of what you changed"
   git push -u origin my-change
   ```

5. open a pull request on GitHub.

## guidelines

- **keep it focused.** one change per PR. small PRs get reviewed faster.
- **match the existing style.** the codebase uses strict TypeScript, Go standard formatting (`gofmt`), and Tailwind v4 utilities.
- **no commented-out code.** delete it instead.
- **test your changes.** if you add new behaviour, add a test. if you fix a bug, add a test that would have caught it.
- **handle errors.** if something can fail, log it or return it — don't ignore it.
- **no secrets in code.** DSNs, tokens, and API keys go in `.env` files (already gitignored).

### frontend conventions

- components use named exports, not `export default`.
- state and side effects stay in custom hooks (see `useRoomWebSocket.ts`).
- avoid calling `setState` synchronously inside `useEffect` — use `startTransition` or move it to an event handler.

### backend conventions

- run `gofmt` before pushing. CI enforces it.
- structured logging via the `logf` helper (`logf(level, msg, "key", val, ...)`).
- use `atomic.Int64` for lock-free fields like `lastActivity`.

## pull request checklist

before opening a PR:

- [ ] the branch is up to date with `master`
- [ ] `go test ./...` passes
- [ ] `bun run lint` — 0 errors
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run test` — all passing
- [ ] no secrets or credentials committed

## need help?

open an issue or start a discussion. if it's a bug, include the browser console output, the go server terminal logs, and the room code if possible.
