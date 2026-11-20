# Local GitHub Actions checks

Run Holo's workflows with [act](https://github.com/nektos/act) and Docker. Local runs use no hosted Actions runner minutes and do not deploy the application.

Install [act](https://github.com/nektos/act) on macOS and start Docker Desktop:

```bash
brew install act
open -a Docker
```

## Routine checks

PRs and pushes to `master` run three jobs: **Lint**, **Typecheck**, and **Unit tests**. Type checking and tests cover both the frontend and signaling Worker. These jobs do not install or run Chromium.

```bash
./ci/local/run.sh
./ci/local/run.sh --matrix check:lint --pull=false
./ci/local/run.sh --matrix check:typecheck --pull=false
./ci/local/run.sh --matrix check:unit-tests --pull=false
```

## Production build

GitHub runs **Production build** only on pushes to `master`, after all routine checks succeed. To simulate that event locally:

```bash
./ci/local/run.sh build --pull=false
```

The wrapper uses `push.json` to supply the `master` event ref; it builds the current checkout without pushing or deploying anything. Because the build depends on the checks, [act](https://github.com/nektos/act) also runs those prerequisite jobs.

## Optional browser checks

The separate **Browser transfers** workflow runs only through **Actions → Browser transfers → Run workflow**. Use it for transfer, reconnect, or file-saving changes. It checks the Worker runtime and bundle, installs Chromium, and runs the browser suite. The workflow becomes available in the Actions UI after it is merged into the default branch.

```bash
./ci/local/run.sh browser --pull=false
```

The existing `cd frontend && bun run test:e2e` command remains available for native local execution.

## Runner details

The wrapper uses the checked-in workflow files directly. Jobs use Ubuntu 24.04 and Node 24. Linux amd64 matches GitHub's architecture and runs through emulation on Apple Silicon. `--pull=false` reuses the downloaded runner image; workflow dependency caches reduce repeat package downloads. GitHub runs the routine checks in parallel; [act](https://github.com/nektos/act) may also run matrix entries together locally.

No environment, secret, input, or variable files are loaded by default. Ignored files are excluded from the container copy, and the repository is not bind-mounted. Missing Sentry credentials only disable release/source-map uploads during a build.

Local runs publish no GitHub check statuses. Vercel preview deployments are separate from GitHub Actions. Required PR checks should be **Lint**, **Typecheck**, and **Unit tests**; the post-merge build and manual browser suite should not be required PR checks.

[VALIDATION.md](VALIDATION.md) records the earlier P2P migration results, rather than the current job layout. Keep generated browser reports and raw logs out of version control.
