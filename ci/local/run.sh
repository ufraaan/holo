#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

command -v act >/dev/null || { echo 'Install act first: brew install act' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Start Docker before running local CI.' >&2; exit 1; }

mode=checks
if [[ $# -gt 0 && "${1:-}" != -* ]]; then
  mode="$1"
  shift
fi

case "$mode" in
  checks)
    event=pull_request
    workflow=.github/workflows/ci.yml
    mode_args=(--job checks)
    ;;
  build)
    event=push
    workflow=.github/workflows/ci.yml
    mode_args=(--job build --eventpath ci/local/push.json)
    ;;
  browser)
    event=workflow_dispatch
    workflow=.github/workflows/browser.yml
    mode_args=(--job browser)
    ;;
  *)
    echo 'Usage: ./ci/local/run.sh [checks|build|browser] [act options]' >&2
    exit 1
    ;;
esac

exec act "$event" \
  --workflows "$workflow" \
  --platform ubuntu-24.04=ghcr.io/catthehacker/ubuntu:act-24.04 \
  --container-architecture linux/amd64 \
  --container-options '--shm-size=1g' \
  --concurrent-jobs 1 \
  --env-file /dev/null \
  --secret-file /dev/null \
  --input-file /dev/null \
  --var-file /dev/null \
  "${mode_args[@]}" \
  "$@"
