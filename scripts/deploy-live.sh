#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TARGET_DIR=${1:-/var/www/mihai-live}

if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync is required to deploy this site." >&2
    exit 1
fi

mkdir -p "$TARGET_DIR"

rsync -av --delete \
    "$SOURCE_DIR/index.html" \
    "$SOURCE_DIR/style.css" \
    "$TARGET_DIR/"

rm -f "$TARGET_DIR/main.html"

for dir in about blogs images js misc photography vendor; do
    mkdir -p "$TARGET_DIR/$dir"
    rsync -av --delete "$SOURCE_DIR/$dir/" "$TARGET_DIR/$dir/"
done

mkdir -p "$TARGET_DIR/music"
rsync -av --delete \
    --exclude 'songs/' \
    --include '*/' \
    --include '*.json' \
    --exclude '*' \
    "$SOURCE_DIR/music/" "$TARGET_DIR/music/"

echo "Deploy sync complete: $TARGET_DIR"
echo "music/songs is preserved on the server and must be managed separately."