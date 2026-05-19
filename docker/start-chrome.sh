#!/usr/bin/env bash
set -euo pipefail

HEADLESS_FLAG=""
if [ "${ASB_HEADLESS:-true}" = "true" ]; then
  HEADLESS_FLAG="--headless=new"
fi

if [ -z "${CHROME_BIN:-}" ]; then
  CHROME_BIN="$(find /ms-playwright -path '*/chrome-linux/chrome' -type f | head -n 1)"
fi

EXTENSION_FLAG=""
if [ -d /opt/asb/extensions/anti-fingerprint ]; then
  EXTENSION_FLAG="--load-extension=/opt/asb/extensions/anti-fingerprint"
fi

# VNC 支持
VNC_ENABLED="${ASB_VNC_ENABLED:-0}"
VNC_PORT="${ASB_VNC_PORT:-5900}"
NOVNC_PORT="${ASB_NOVNC_PORT:-6080}"

if [ "$VNC_ENABLED" = "1" ]; then
  export DISPLAY="${DISPLAY:-:99}"
  SCREEN_WIDTH="${SCREEN_WIDTH:-1440}"
  SCREEN_HEIGHT="${SCREEN_HEIGHT:-1000}"
  SCREEN_DEPTH="${SCREEN_DEPTH:-24}"

  # 启动 Xvfb
  Xvfb "$DISPLAY" -screen 0 "${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH}" &
  sleep 1

  # 启动 x11vnc
  x11vnc -display "$DISPLAY" -nopw -forever -quiet -rfbport "$VNC_PORT" &
  sleep 1

  # 启动 websockify (noVNC)
  websockify --web /usr/share/novnc "$NOVNC_PORT" "localhost:$VNC_PORT" &
  echo "noVNC available at http://localhost:$NOVNC_PORT/vnc.html?autoconnect=true&resize=remote"
fi

exec "$CHROME_BIN" \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9222 \
  --remote-allow-origins='*' \
  --user-data-dir=/home/pwuser/profile \
  --no-first-run \
  --no-default-browser-check \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-gpu \
  --disable-gpu-sandbox \
  --disable-gpu-compositing \
  --disable-accelerated-2d-canvas \
  --disable-accelerated-video-decode \
  --disable-dev-shm-usage \
  --disable-features=Translate,AutomationControlled,VizDisplayCompositor,UseSkiaRenderer,CanvasOopRasterization \
  ${EXTENSION_FLAG} \
  ${HEADLESS_FLAG} \
  about:blank
