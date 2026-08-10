#!/bin/bash

# Upload Existing Images to MinIO
# This script uploads existing image assets to MinIO and sets up the asset structure

set -e

# Usage / arg parsing happens before the mc availability check so --dry-run works without mc.
usage() {
    cat <<'USAGE'
Usage: upload-existing-images-to-minio.sh [--dry-run] [-h|--help]

Uploads image assets under content/ to MinIO using the server-canonical key
form las-flores/<assetType>/<name><ext>.

  --dry-run   Walk content/ and print the target MinIO keys without uploading.
  -h, --help  Show this help and exit.

Environment:
  MINIO_ENDPOINT    MinIO endpoint (default: localhost:9000)
  MINIO_ACCESS_KEY  MinIO access key (required for a real upload)
  MINIO_SECRET_KEY  MinIO secret key (required for a real upload)
  MINIO_BUCKET      MinIO bucket (default: las-flores)
USAGE
}

DRY_RUN=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "error: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

# Configuration
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-}"
BUCKET_NAME="${MINIO_BUCKET:-las-flores}"

# Derive repository root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONTENT_DIR="$REPO_ROOT/content"

# Map a content top-level dir to the server's assetType.
asset_type_for() {
    case "$1" in
        characters) echo "portrait" ;;
        districts | scenes | missions | stories | story_beats) echo "background" ;;
        overlays) echo "overlay" ;;
        *) echo "unknown" ;;
    esac
}

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "♻️  Dry-run: walking content/ and printing target keys (no upload)."
else
    if [[ -z "$MINIO_ACCESS_KEY" || -z "$MINIO_SECRET_KEY" ]]; then
        echo "error: MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required for a real upload." >&2
        echo "       Run with --dry-run to preview the uploads without MinIO access." >&2
        exit 2
    fi

    # Check if mc (MinIO client) is available
    if ! command -v mc &> /dev/null; then
        echo "MinIO client (mc) is required."
        echo "Command: sudo apt-get update && sudo apt-get install -y minio-client"
        echo "Expected result: installs the MinIO client for this system."
        read -r -p "Run this command now? [y/N] " confirm
        [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
        sudo apt-get update && sudo apt-get install -y minio-client
        command -v mc >/dev/null || { echo "mc installation failed"; exit 1; }
    fi

    # Configure MinIO client
    mc alias set lasflores http://$MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY

    # Create bucket if it doesn't exist
    if ! mc ls lasflores/$BUCKET_NAME &> /dev/null; then
        echo "📦 Creating bucket: $BUCKET_NAME"
        mc mb lasflores/$BUCKET_NAME
    else
        echo "✅ Bucket already exists: $BUCKET_NAME"
    fi
fi

# Track keys already emitted this run so flat-key collisions surface as warnings.
# The loop runs in the main shell (process substitution, not a pipeline subshell),
# so SEEN_KEYS survives across iterations.
SEEN_KEYS=()

# Upload any existing images
echo "🔍 Looking for image assets..."
while IFS= read -r image_file; do
    # Get relative path from content directory
    rel_path=$(realpath --relative-to="$CONTENT_DIR" "$image_file")

    # Build the server-canonical key: las-flores/${asset_type}/${name}${ext}.
    # The `las-flores/` prefix is part of the key (the bucket is separately
    # MINIO_BUCKET, default las-flores), so objects land at
    # las-flores/las-flores/<asset_type>/... exactly as the server writes them.
    base_name="$(basename "$image_file")"
    orig_ext="${base_name##*.}"
    ext=".$(printf '%s' "$orig_ext" | tr '[:upper:]' '[:lower:]')"
    name="${base_name%.*}"
    top_dir="$(dirname "$rel_path" | cut -d/ -f1)"
    asset_type="$(asset_type_for "$top_dir")"
    minio_path="las-flores/${asset_type}/${name}${ext}"

    if [[ " ${SEEN_KEYS[*]} " == *" $minio_path "* ]]; then
        echo "⚠️  Collision: $minio_path already emitted this run (flat keys can collide)"
    fi
    SEEN_KEYS+=("$minio_path")

    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "DRY-RUN $rel_path -> $BUCKET_NAME/$minio_path"
    else
        echo "  📁 Uploading $rel_path -> $minio_path"
        mc cp "$image_file" "lasflores/$BUCKET_NAME/$minio_path"
    fi
done < <(find "$CONTENT_DIR" -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp")

echo "✅ Image upload complete!"
echo ""
echo "📋 Uploaded assets to MinIO bucket: $BUCKET_NAME"
echo "🌐 MinIO Console: http://localhost:9001"
echo "🔐 Credentials: $MINIO_ACCESS_KEY/$MINIO_SECRET_KEY"
