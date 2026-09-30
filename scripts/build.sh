#!/bin/bash
# Thin wrapper. The build itself is scripts/build.mjs, because this repo is
# developed on Windows where a bare `bash scripts/build.sh` is not available.
# Kept so an existing habit (or CI step) that calls build.sh keeps working.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/build.mjs "$@"
