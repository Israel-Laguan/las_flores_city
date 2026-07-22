#!/bin/bash

# Backup Content Assets
# Creates a compressed tarball of all content/**/assets/ directories

set -e

# Derive repository root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="$REPO_ROOT/backups"
TIMESTAMP=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/content-assets-$TIMESTAMP.tar.gz"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "📦 Backing up content assets..."

# Find all assets directories
ASSETS_COUNT=$(find "$REPO_ROOT/content" -type d -name "assets" | wc -l)

if [ "$ASSETS_COUNT" -eq 0 ]; then
    echo "⚠️  No assets directories found under content/"
    exit 0
fi

# Create tarball of all assets directories
cd "$REPO_ROOT"
tar -czf "$BACKUP_FILE" --exclude='.*' $(find content -type d -name "assets" | sed 's|^|./|')

# Report results
FILE_COUNT=$(tar -tzf "$BACKUP_FILE" | wc -l)
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo "✅ Backup complete!"
echo ""
echo "📁 Backup file: $BACKUP_FILE"
echo "📊 Files backed up: $FILE_COUNT"
echo "💾 Compressed size: $FILE_SIZE"
