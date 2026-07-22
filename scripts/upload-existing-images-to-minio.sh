#!/bin/bash

# Upload Existing Images to MinIO
# This script uploads existing tile images to MinIO and sets up the asset structure

set -e

echo "🔄 Uploading existing images to MinIO..."

# Configuration
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY environment variable is required}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:?MINIO_SECRET_KEY environment variable is required}"
BUCKET_NAME="las-flores"

# Derive repository root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONTENT_DIR="$REPO_ROOT/content"

# Check if mc (MinIO client) is available
if ! command -v mc &> /dev/null; then
    echo "❌ MinIO client (mc) not found. Installing..."
    sudo apt-get update && sudo apt-get install -y minio-client
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

# Upload tile images
echo "📁 Uploading tile images..."
TILES_DIR="$CONTENT_DIR/lore/shared/tiles"

for tile_dir in "$TILES_DIR"/*/; do
    if [ -d "$tile_dir" ]; then
        tile_name=$(basename "$tile_dir")
        assets_dir="$tile_dir/assets"
        
        if [ -d "$assets_dir" ]; then
            echo "  📦 Uploading $tile_name tiles..."
            mc cp --recursive "$assets_dir/" "lasflores/$BUCKET_NAME/tiles/$tile_name/"
        fi
    fi
done

# Upload any other existing images
echo "🔍 Looking for other image assets..."
find "$CONTENT_DIR" -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp" | while read -r image_file; do
    # Get relative path from content directory
    rel_path=$(realpath --relative-to="$CONTENT_DIR" "$image_file")
    
    # Derive asset_type from path for canonical key: las-flores/${assetType}/${name}${ext}
    base_name="$(basename "$image_file")"
    ext="${base_name##*.}"
    name="${base_name%.*}"
    asset_type="$(dirname "$rel_path" | cut -d/ -f1)"
    
    minio_path="$BUCKET_NAME/$asset_type/$name.$ext"
    
    echo "  📁 Uploading $rel_path -> $minio_path"
    mc cp "$image_file" "lasflores/$minio_path"
    
done

echo "✅ Image upload complete!"
echo ""
echo "📋 Uploaded assets to MinIO bucket: $BUCKET_NAME"
echo "🌐 MinIO Console: http://localhost:9001"
echo "🔐 Credentials: $MINIO_ACCESS_KEY/$MINIO_SECRET_KEY"
