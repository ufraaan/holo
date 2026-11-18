# P2P migration validation

Validated on 18 November 2026 using act 0.2.98, Docker 29.9.2, Ubuntu 24.04 amd64, Node 24, and Bun 1.4.4. Runs execute locally through Docker on Apple Silicon.

| Check | Result |
| --- | --- |
| Cloudflare runtime type checking | Passed |
| Cloudflare runtime tests | 26 passed |
| Worker bundle dry run | Passed; no deployment performed by CI |
| Chromium three-person chat and file transfer | Passed; byte-identical downloads |
| Chromium disk streaming above 100 MiB | Passed |
| Chromium pause/resume after signaling and peer interruption | Passed |
| Frontend lint and type checking | Passed |
| Frontend unit tests | 145 passed |
| Frontend production build | Passed |

The signaling/browser job passed in the initial local workflow run. The frontend's application checks also passed, but Bun's post-job cache action could not locate Node in act's default environment. The workflow now explicitly sets up Node 24 in both jobs; the frontend job was rerun successfully with that configuration, including both post-job cache steps.

Separately, the deployed Vercel preview was tested against the live Cloudflare service with direct ICE paths disabled. Three-person chat/file delivery and pause/resume through reconnection both passed over TURN.

A complete 3 GiB transfer and the native OS save picker still require manual validation. The disk-streaming browser test uses a real browser file writer with the picker replaced by an automated handle.

To reproduce the workflow checks:

```bash
./ci/local/run.sh
```
