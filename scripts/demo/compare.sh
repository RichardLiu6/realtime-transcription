#!/usr/bin/env bash
# Demo video: the same scripted meeting on main (left) and the working tree
# (right), side by side, as an mp4 — a before/after reference for each update.
#
#   scripts/demo/compare.sh [out.mp4] [base ref, default origin/main]
#
# Needs a production build of the working tree (npm run build) and ffmpeg
# with libx264 (FFMPEG=…, or `pip install imageio-ffmpeg`). Uses ports 3100
# (working tree) and 3101 (base); both servers are stopped at the end.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${1:-$ROOT/demo-compare.mp4}
BASE=${2:-origin/main}
# Next to the repo (same filesystem, so node_modules can be hard-linked —
# Turbopack refuses a node_modules symlink pointing outside the project)
WORK=$(mktemp -d "$(dirname "$ROOT")/.demo-XXXX")
# A Python with Pillow (and imageio-ffmpeg when there is no ffmpeg)
PYTHON=${PYTHON:-python3}
FFMPEG=${FFMPEG:-$(command -v ffmpeg || "$PYTHON" -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")}
FONT=${FONT:-$(fc-match -f '%{file}' 'WenQuanYi Zen Hei:lang=zh' 2>/dev/null || true)}
export JWT_SECRET=demo-secret
PIDS=()
cleanup() {
  # Each server runs in its own process group (npx forks the real server)
  for p in "${PIDS[@]}"; do kill -- "-$p" 2>/dev/null || true; done
  git -C "$ROOT" worktree remove --force "$WORK/base" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_up() { for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$1/login" && return 0; sleep 1; done; return 1; }

echo "Building $BASE…"
git -C "$ROOT" worktree add --detach "$WORK/base" "$BASE" >/dev/null
cp -al "$ROOT/node_modules" "$WORK/base/node_modules"
(cd "$WORK/base" && npx next build >"$WORK/base-build.log" 2>&1) || { tail -20 "$WORK/base-build.log"; exit 1; }

for port in 3100 3101; do
  if curl -s -o /dev/null "http://localhost:$port/"; then echo "port $port is in use"; exit 1; fi
done
(cd "$WORK/base" && exec setsid npx next start -p 3101 >"$WORK/base.log" 2>&1) & PIDS+=($!)
(cd "$ROOT" && exec setsid npx next start -p 3100 >"$WORK/head.log" 2>&1) & PIDS+=($!)
wait_up 3101 && wait_up 3100

# One at a time: two recordings at once would slow each other down
node "$ROOT/scripts/demo/record.mjs" http://localhost:3101 "$WORK/before.webm"
node "$ROOT/scripts/demo/record.mjs" http://localhost:3100 "$WORK/after.webm"

BASE_LABEL="线上版本 $(git -C "$ROOT" rev-parse --short "$BASE")"
HEAD_LABEL="本次更新 $(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD || echo '+')"
# A title bar over each half (an image: this ffmpeg may lack drawtext)
"$PYTHON" - "$FONT" "$WORK" "$BASE_LABEL" "$HEAD_LABEL" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
font_path, work, *labels = sys.argv[1:]
font = ImageFont.truetype(font_path, 26) if font_path else ImageFont.load_default()
for name, text in zip(("before", "after"), labels):
    img = Image.new("RGB", (960, 48), "white")
    ImageDraw.Draw(img).text((16, 10), text, fill="black", font=font)
    img.save(f"{work}/{name}-title.png")
PY
"$FFMPEG" -loglevel error -y -i "$WORK/before.webm" -i "$WORK/after.webm" \
  -loop 1 -i "$WORK/before-title.png" -loop 1 -i "$WORK/after-title.png" -filter_complex \
  "[0:v]scale=960:-2[v0];[1:v]scale=960:-2[v1];[2:v][v0]vstack=shortest=1[a];[3:v][v1]vstack=shortest=1[b];[a][b]hstack=inputs=2:shortest=1,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 26 -preset veryfast -movflags +faststart "$OUT"
echo "wrote $OUT"
