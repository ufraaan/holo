#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

command -v act >/dev/null || { echo 'Install act first: brew install act' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Start Docker before running local CI.' >&2; exit 1; }

# Run the checked-in workflow in Linux containers without loading local secrets.
# amd64 matches GitHub's runner, including on Apple Silicon.
exec act pull_request \
  --workflows .github/workflows/ci.yml \
  --platform ubuntu-24.04=ghcr.io/catthehacker/ubuntu:act-24.04 \
  --container-architecture linux/amd64 \
  --container-options '--shm-size=1g' \
  --concurrent-jobs 1 \
  --env-file /dev/null \
  --secret-file /dev/null \
  --input-file /dev/null \
  --var-file /dev/null \
  "$@"
