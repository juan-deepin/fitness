#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-15000}"

exec ngrok http "http://127.0.0.1:$PORT"
