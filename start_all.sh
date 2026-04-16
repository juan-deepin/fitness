#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-15000}"
FORCE_RESTART=0
STOP_ONLY=0
SERVER_STARTED=0
NGROK_STARTED=0
SERVER_PID=""
NGROK_PID=""

for arg in "$@"; do
  case "$arg" in
    --force-restart|-f)
      FORCE_RESTART=1
      ;;
    --stop|-s)
      STOP_ONLY=1
      ;;
    --help|-h)
      echo "Uso: ./start_all.sh [--force-restart] [--stop]"
      echo "  --force-restart, -f   Detiene instancias previas de server.py y ngrok antes de iniciar"
      echo "  --stop, -s            Detiene server.py y ngrok y sale sin iniciar nada"
      exit 0
      ;;
    *)
      echo "Argumento no reconocido: $arg"
      echo "Usa --help para ver opciones."
      exit 2
      ;;
  esac
done

cleanup() {
  if [[ "$NGROK_STARTED" -eq 1 ]] && [[ -n "${NGROK_PID:-}" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
  if [[ "$SERVER_STARTED" -eq 1 ]] && [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

get_public_url() {
  curl -fsS http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c '
import json
import sys

raw = sys.stdin.read().strip()
if not raw:
    print("")
    raise SystemExit(0)

data = json.loads(raw)
for tunnel in data.get("tunnels", []):
    public_url = str(tunnel.get("public_url", ""))
    proto = str(tunnel.get("proto", ""))
    addr = str((tunnel.get("config") or {}).get("addr", ""))
    if proto in ("https", "http") and f":{sys.argv[1]}" in addr:
        print(public_url)
        raise SystemExit(0)

print("")
' "$PORT"
}

if [[ "$STOP_ONLY" -eq 1 ]]; then
  echo "Deteniendo procesos de servidor y ngrok..."
  pkill -f "python3 server.py" 2>/dev/null || true
  pkill -f "ngrok http" 2>/dev/null || true

  server_stopped=1
  ngrok_stopped=1
  curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && server_stopped=0
  curl -fsS "http://127.0.0.1:4040/api/tunnels" >/dev/null 2>&1 && ngrok_stopped=0

  if [[ "$server_stopped" -eq 1 && "$ngrok_stopped" -eq 1 ]]; then
    echo "Procesos detenidos correctamente."
    exit 0
  fi

  echo "No se pudieron detener todos los procesos."
  echo "Verifica con: ps aux | grep -E 'server.py|ngrok http'"
  exit 1
fi

if [[ "$FORCE_RESTART" -eq 1 ]]; then
  echo "Reinicio forzado: deteniendo procesos previos..."
  pkill -f "python3 server.py" 2>/dev/null || true
  pkill -f "ngrok http" 2>/dev/null || true

  for _ in $(seq 1 40); do
    local_ok=1
    curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && local_ok=0
    curl -fsS "http://127.0.0.1:4040/api/tunnels" >/dev/null 2>&1 && local_ok=0
    if [[ "$local_ok" -eq 1 ]]; then
      break
    fi
    sleep 0.2
  done
fi

if ! curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "Iniciando servidor en puerto $PORT..."
  env PORT="$PORT" python3 server.py > /tmp/app_server.log 2>&1 &
  SERVER_PID=$!
  SERVER_STARTED=1

  for _ in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done

  if ! curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    echo "No se pudo iniciar el servidor local en $PORT."
    echo "Revisa /tmp/app_server.log"
    exit 1
  fi
else
  echo "Servidor ya activo en puerto $PORT, se reutiliza."
fi

PUBLIC_URL="$(get_public_url || true)"

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Iniciando ngrok hacia 127.0.0.1:$PORT..."
  ngrok http "http://127.0.0.1:$PORT" > /tmp/app_ngrok.log 2>&1 &
  NGROK_PID=$!
  NGROK_STARTED=1

  for _ in $(seq 1 60); do
    PUBLIC_URL="$(get_public_url || true)"
    if [[ -n "$PUBLIC_URL" ]]; then
      break
    fi
    sleep 0.25
  done
fi

if [[ -z "$PUBLIC_URL" ]]; then
  echo "No se pudo obtener la URL publica de ngrok."
  echo "Revisa /tmp/app_ngrok.log"
  exit 1
fi

echo
echo "App local:   http://127.0.0.1:$PORT"
echo "App publica: $PUBLIC_URL"
echo

if [[ "$SERVER_STARTED" -eq 1 || "$NGROK_STARTED" -eq 1 ]]; then
  echo "Procesos iniciados por este script: server=${SERVER_PID:-reutilizado} ngrok=${NGROK_PID:-reutilizado}"
  echo "Presiona Ctrl+C para detener los procesos iniciados por este script."

  if [[ "$SERVER_STARTED" -eq 1 && "$NGROK_STARTED" -eq 1 ]]; then
    wait "$SERVER_PID" "$NGROK_PID"
  elif [[ "$SERVER_STARTED" -eq 1 ]]; then
    wait "$SERVER_PID"
  elif [[ "$NGROK_STARTED" -eq 1 ]]; then
    wait "$NGROK_PID"
  fi
else
  echo "Servidor y ngrok ya estaban activos; no se iniciaron procesos nuevos."
fi
