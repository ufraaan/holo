# Local GitHub Actions checks

Run the repository's existing CI workflow with `act` and Docker. This runs on your machine and does not use GitHub Actions runner minutes. It does not deploy the application.

Install `act` on macOS and start Docker Desktop:

```bash
brew install act
open -a Docker
```

From the repository root, run both CI jobs:

```bash
./ci/local/run.sh
```

Run one job, or reuse the downloaded runner image:

```bash
./ci/local/run.sh --job p2p --pull=false
./ci/local/run.sh --job frontend-core --pull=false
```

The script uses `.github/workflows/ci.yml` directly rather than maintaining a second workflow. Both jobs use Ubuntu 24.04; Node 24 matches Vercel. The Linux amd64 runner matches GitHub's architecture and runs through emulation on Apple Silicon. The first run downloads the runner image, actions, dependencies, and Chromium.

The `p2p` job checks the Cloudflare runtime, validates the Worker bundle without deploying it, and exercises file transfers in Chromium. The `frontend-core` job runs lint, type checking, unit tests, and a production build. Missing Sentry credentials only disable release/source-map uploads during a local build.

No environment, secret, input, or variable files are loaded by the wrapper. Ignored files are excluded from the container copy, and the repository is not bind-mounted. Public actions do not require a GitHub token.

Local runs do not publish GitHub check statuses. A cancelled hosted check remains cancelled even when local checks pass. Vercel preview deployments are separate from GitHub Actions.

See [VALIDATION.md](VALIDATION.md) for the migration's recorded results. Keep generated browser reports and raw logs out of version control.
