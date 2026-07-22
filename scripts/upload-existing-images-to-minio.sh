#!/bin/bash

# Upload Existing Images to MinIO
# This script uploads existing tile images to MinIO and sets up the asset structure

set -e

echo "🔄 Uploading existing images to MinIO..."

# Configuration
MINIO_ENDPOINT="localhost:9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
BUCKET_NAME="las-flores"

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
TILES_DIR="/home/anthony/code/las_flores_city/content/lore/shared/tiles"

for tile_dir in "$TILES_DIR"/*/; do
    if [ -d "$tile_dir" ]; then
        tile_name=$(basename "$tile_dir")
        assets_dir="$tile_dir/assets"
        
        if [ -d "$assets_dir" ]; then
            echo "  📦 Uploading $tile_name tiles..."
            mc cp --recursive "$assets_dir/" lasflores/$BUCKET_NAME/tiles/$tile_name/
        fi
    fi
done

# Upload any other existing images
echo "🔍 Looking for other image assets..."
find /home/anthony/code/las_flores_city/content -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp" | while read -r image_file; do
    # Get relative path from content directory
    rel_path=$(realpath --relative-to=/home/anthony/code/las_flores_city/content "$image_file")
    
    # Create MinIO path
    minio_path="las-flores/$(dirname "$rel_path")"
    
    echo "  📁 Uploading $rel_path..."
    mc cp "$image_file" lasflores/$minio_path/
    
done

echo "✅ Image upload complete!"
echo ""
echo "📋 Uploaded assets to MinIO bucket: $BUCKET_NAME"
echo "🌐 MinIO Console: http://localhost:9001"
echo "🔐 Credentials: $MINIO_ACCESS_KEY/$MINIO_SECRET_KEY"
