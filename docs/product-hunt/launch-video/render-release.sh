#!/usr/bin/env bash
set -euo pipefail

output="${1:-../assets/collabhub-product-hunt.mp4}"
frames="$(mktemp -d /tmp/collabhub-product-hunt.XXXXXX)"
trap 'rm -rf "$frames"' EXIT

npx hyperframes render \
  --output "$frames" \
  --format png-sequence \
  --quality high \
  --fps 30 \
  --workers 1 \
  --experimental-fast-capture=false \
  --video-frame-format png \
  --no-browser-gpu

# Chromium can return alternating partial paint tiles when a captured page
# contains a video layer. Keep the complete frames, duplicate them back to
# 30 fps, and encode each output frame independently so a damaged paint tile
# cannot propagate through H.264 prediction frames.
ffmpeg -hide_banner -loglevel error -y \
  -framerate 30 \
  -start_number 1 \
  -i "$frames/frame_%06d.png" \
  -vf "select='not(mod(n,2))',setpts=N/(15*TB),fps=30" \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 26 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$output"
