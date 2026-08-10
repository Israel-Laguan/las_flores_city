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
    mc alias set lasflores "http://${MINIO_ENDPOINT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

    # Create bucket if it doesn't exist
    if ! mc ls "lasflores/$BUCKET_NAME" &> /dev/null; then
        echo "📦 Creating bucket: $BUCKET_NAME"
        mc mb "lasflores/$BUCKET_NAME"
    else
        echo "✅ Bucket already exists: $BUCKET_NAME"
    fi
fi

# Pass 1: discover every asset and resolve its canonical key WITHOUT uploading.
#
# Canonical keys are flat (las-flores/<assetType>/<name><ext>), so two files in
# different entity folders can resolve to the same key. Rather than letting the
# later upload silently replace the earlier object — or aborting the whole run —
# colliding keys are auto-renamed with a numeric suffix before the extension
# (e.g. far_south__default.png -> far_south__default_2.png). Doing this as a
# full pre-scan means every final key is known before the first `mc cp`, so a
# run never lands in a partially-renamed, ambiguous state.
#
# The loop runs in the main shell (process substitution, not a pipeline
# subshell), so these arrays survive across iterations.
declare -A KEY_SOURCES=()
declare -a UPLOAD_FILES=()
declare -a UPLOAD_KEYS=()
declare -a UPLOAD_RELS=()
COLLISIONS=0

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

    if [[ -n "${KEY_SOURCES[$minio_path]:-}" ]]; then
        COLLISIONS=$((COLLISIONS + 1))
        # Auto-rename by inserting a numeric suffix before the extension so the
        # colliding file still uploads under a unique key instead of overwriting
        # the earlier object. Keep probing upward until we find a free key.
        suffix=2
        stem="las-flores/${asset_type}/${name}"
        while [[ -n "${KEY_SOURCES[${stem}_${suffix}${ext}]:-}" ]]; do
            suffix=$((suffix + 1))
        done
        minio_path="${stem}_${suffix}${ext}"
        echo "⚠️  Key collision: '$minio_path' already taken by ${KEY_SOURCES[las-flores/${asset_type}/${name}${ext}]}" >&2
        echo "   Renaming ${rel_path} -> ${minio_path} to avoid overwrite." >&2
    fi
    KEY_SOURCES[$minio_path]="$rel_path"

    UPLOAD_FILES+=("$image_file")
    UPLOAD_KEYS+=("$minio_path")
    UPLOAD_RELS+=("$rel_path")
done < <(find "$CONTENT_DIR" -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp")

if [[ "$COLLISIONS" -gt 0 ]]; then
    echo "   $COLLISIONS collision(s) auto-renamed; every file will still upload." >&2
fi

# Pass 2: upload (or preview) every file under its resolved key.
for i in "${!UPLOAD_FILES[@]}"; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "DRY-RUN ${UPLOAD_RELS[$i]} -> $BUCKET_NAME/${UPLOAD_KEYS[$i]}"
    else
        echo "  📁 Uploading ${UPLOAD_RELS[$i]} -> ${UPLOAD_KEYS[$i]}"
        mc cp "${UPLOAD_FILES[$i]}" "lasflores/$BUCKET_NAME/${UPLOAD_KEYS[$i]}"
    fi
done

echo "✅ Image upload complete!"
echo ""
echo "📋 Uploaded assets to MinIO bucket: $BUCKET_NAME"
echo "🌐 MinIO Console: http://localhost:9001"
echo "🔐 Credentials: $MINIO_ACCESS_KEY/$MINIO_SECRET_KEY"
