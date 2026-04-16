#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-15000}"

exec env PORT="$PORT" python3 server.py
