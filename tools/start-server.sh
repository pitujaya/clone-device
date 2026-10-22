#!/data/data/com.termux/files/usr/bin/bash
# Jalankan server Clone Device sebagai proses latar yang bertahan setelah shell ditutup.
#   usage: ./start-server.sh [port] [mode]   mode: mock | proxy
set -u
DIR="/data/data/com.termux/files/home/opencode-hp/clone device"
PORT="${1:-8090}"
MODE="${2:-mock}"
LOG="/data/data/com.termux/files/usr/tmp/opencode/clone-server.log"
PIDF="/data/data/com.termux/files/usr/tmp/opencode/clone-server.pid"

cd "$DIR" || exit 1

# hentikan instance lama
if [ -f "$PIDF" ]; then
  OLD=$(cat "$PIDF")
  kill "$OLD" 2>/dev/null
  sleep 1
fi

case "$MODE" in
  proxy) ARGS="--port=$PORT --target=${3:?}" ;;
  *)     ARGS="--port=$PORT" ;;
esac

# setsid + nohup + full fd detach -> selamat dari shell yang ditutup
setsid nohup node server/index.js $ARGS < /dev/null > "$LOG" 2>&1 &
echo $! > "$PIDF"
disown 2>/dev/null

sleep 2
IP=$(node -e "const o=require('os');const n=o.networkInterfaces();for(const k in n)for(const a of n[k])if(a.family==='IPv4'&&!a.internal)console.log(a.address)" | head -1)

echo "server jalan  pid=$(cat "$PIDF")  mode=$MODE  port=$PORT"
echo "  web-client : http://$IP:$PORT"
echo "  localhost  : http://127.0.0.1:$PORT"
echo "  log        : $LOG"
