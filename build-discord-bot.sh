#!/bin/sh
# Cross-compile qmanager_discord for RM520N-GL (ARMv7l, Linux)
set -eu

OUT="qmanager-build/bin/qmanager_discord"
mkdir -p qmanager-build/bin

echo "Building qmanager_discord for linux/arm7..."
cd discord-bot
GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 \
    go build -ldflags="-s -w" -o "../${OUT}" .
cd ..

SIZE=$(du -sh "$OUT" | cut -f1)
echo "Built: ${OUT} (${SIZE})"
