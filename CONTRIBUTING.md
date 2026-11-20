# contributing

Holo is a Next.js frontend plus a Cloudflare signaling Worker. Files use WebRTC;
chat, text, membership, and connection setup use room WebSockets. No Go tooling
or application file relay is required.

## setup

Use Bun and Node.js 24 or later. Install dependencies at the root, in
`frontend/`, and in `signaling/`. Follow the [local setup](README.md#running-locally)
to start the Worker on 8788 and the website on 3000.

Copy `frontend/.env.example` to a local ignored env file if desired. TURN is
optional for local direct connections. Its credentials belong in Worker secrets,
never a `NEXT_PUBLIC_` variable. See [signaling setup](signaling/README.md).

## making changes

1. Branch from `master`.
2. Keep the change focused and preserve the room's ephemeral behavior.
3. Run `bun run check` at the repository root (signaling typecheck/runtime tests,
   then frontend lint/typecheck/unit tests).
4. Run `bun run test:e2e` from `frontend/` for transfer or room-protocol changes.
5. Commit, push your branch, and open a PR. Never merge or deploy production
   without checking the target configuration.

The pre-commit hook runs the same root check. GitHub Actions runs lint, type
checks, and unit tests on PRs and pushes to `master`. Successful checks on
`master` are followed by a production build. The separate **Browser transfers**
workflow is manual-only; run it from Actions when changing transfers, reconnects,
or disk saving, or use `./ci/local/run.sh browser` locally.

## conventions

- Strict TypeScript and Tailwind v4; preserve the existing glass styling.
- State and effects belong in hooks. New reusable modules use named exports;
  framework-required entry points retain their required export shape.
- Keep file data off the signaling WebSocket. Validate signaling and file
  frames, and acknowledge bytes only after receiving and writing them.
- Do not buffer a whole large file. Respect the negotiated channel message size,
  sender backpressure, and aggregate receiver memory budget.
- `messages/en.json` is the source of truth; every locale must mirror its keys.
- Do not add permanent file/chat storage or cross-refresh resume accidentally.
- Never commit credentials, local env files, dependencies, or generated builds.

## reports

Include the browser, connection type (direct/relay), transfer state, and relevant
sanitized console errors. Do not post TURN credentials, file contents, or private
room codes in public issues.
