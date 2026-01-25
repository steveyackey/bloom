#!/usr/bin/env bash
# Generate demo recording and convert to SVG
# Usage: ./scripts/generate-demo.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "Recording demo with asciinema..."
TERM=xterm-256color asciinema rec assets/demo.cast \
    --command "bash scripts/record-demo.sh" \
    --overwrite

echo ""
echo "Converting to SVG..."
svg-term --in assets/demo.cast --out assets/demo.svg --window --width 100 --height 30

echo ""
echo "Copying to docs and web..."
cp assets/demo.svg docs/static/img/demo.svg
cp assets/demo.svg web/public/demo.svg

echo ""
echo "Done! Demo files updated:"
ls -la assets/demo.svg docs/static/img/demo.svg web/public/demo.svg
