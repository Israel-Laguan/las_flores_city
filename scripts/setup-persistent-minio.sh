#!/bin/bash

# Setup Persistent MinIO for Las Flores City
# This script creates a MinIO setup that survives container restarts and provides backup protection

set -e

echo "🚀 Setting up Persistent MinIO for Las Flores City..."

# Configuration
MINIO_DATA_DIR="$HOME/las_flores_minio_data"
BACKUP_DIR="$HOME/las_flores_minio_backups"
CONTAINER_NAME="las-flores-minio-persistent"
NETWORK_NAME="las-flores-net"

# Require credentials via environment variables
if [ -z "${MINIO_ROOT_USER:-}" ] || [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
    echo "❌ MINIO_ROOT_USER and MINIO_ROOT_PASSWORD environment variables are required."
    echo "   Example: MINIO_ROOT_USER=myuser MINIO_ROOT_PASSWORD=mypassword ./scripts/setup-persistent-minio.sh"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$MINIO_DATA_DIR"
mkdir -p "$BACKUP_DIR"

# Check if MinIO is already running
if podman ps -a --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
    echo "⚠️  MinIO container already exists: $CONTAINER_NAME"
    read -p "Do you want to remove and recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Removing existing MinIO container..."
        podman rm -f "$CONTAINER_NAME" || true
    else
        echo "🛑 Aborting setup."
        exit 1
    fi
fi

# Check/create network
echo "🌐 Setting up network..."
if ! podman network exists "$NETWORK_NAME"; then
    podman network create "$NETWORK_NAME"
    echo "✅ Created network: $NETWORK_NAME"
else
    echo "✅ Network already exists: $NETWORK_NAME"
fi

# Run MinIO with persistent volume mapping
echo "🐳 Starting MinIO container with persistent storage..."
podman run -d \
    --name "$CONTAINER_NAME" \
    --network "$NETWORK_NAME" \
    -p 127.0.0.1:9000:9000 \
    -p 127.0.0.1:9001:9001 \
    -v "$MINIO_DATA_DIR:/data" \
    -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
    -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
    docker.io/minio/minio:latest \
    server /data --console-address ":9001"

echo "✅ MinIO container started: $CONTAINER_NAME"

# Get container IP
MINIO_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER_NAME")
echo "📡 MinIO IP: $MINIO_IP"
echo "🌐 MinIO Console: http://localhost:9001"
echo "🔐 Credentials: $MINIO_ROOT_USER/$MINIO_ROOT_PASSWORD"

# Create backup script
echo "🛡️  Creating backup script..."
cat > "$HOME/backup-minio.sh" << 'EOF'
#!/bin/bash
# MinIO Backup Script for Las Flores City

MINIO_DATA="$HOME/las_flores_minio_data"
BACKUP_DIR="$HOME/las_flores_minio_backups"
CONTAINER_NAME="las-flores-minio-persistent"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
echo "📦 Creating MinIO backup: $DATE"
mkdir -p "$BACKUP_DIR"

# Stop MinIO for consistent backup
if podman ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
    echo "🛑 Stopping MinIO for consistent backup..."
    podman stop "$CONTAINER_NAME"
    STOPPED=true
fi

tar -czf "$BACKUP_DIR/minio_backup_$DATE.tar.gz" -C "$MINIO_DATA" .

# Restart MinIO if we stopped it
if [ "${STOPPED:-false}" = true ]; then
    echo "🐳 Restarting MinIO..."
    podman start "$CONTAINER_NAME"
fi

# Keep only last 5 backups
echo "🧹 Cleaning up old backups..."
ls -t "$BACKUP_DIR"/minio_backup_*.tar.gz | tail -n +6 | xargs rm -f 2>/dev/null || true

echo "✅ Backup complete: $BACKUP_DIR/minio_backup_$DATE.tar.gz"
EOF

chmod +x "$HOME/backup-minio.sh"
echo "✅ Backup script created: $HOME/backup-minio.sh"

# Create restore script
echo "🔄 Creating restore script..."
cat > "$HOME/restore-minio.sh" << 'EOF'
#!/bin/bash
# MinIO Restore Script for Las Flores City

MINIO_DATA="$HOME/las_flores_minio_data"
BACKUP_DIR="$HOME/las_flores_minio_backups"

# Find latest backup
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/minio_backup_*.tar.gz | head -n 1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "❌ No backups found in $BACKUP_DIR"
    exit 1
fi

echo "🔄 Restoring from backup: $LATEST_BACKUP"

# Stop MinIO container if running
if podman ps -a --format '{{.Names}}' | grep -q "las-flores-minio-persistent"; then
    echo "🛑 Stopping MinIO container..."
    podman stop las-flores-minio-persistent
fi

# Restore backup
echo "📦 Extracting backup..."
mkdir -p "$MINIO_DATA"
rm -rf "$MINIO_DATA"/*
tar -xzf "$LATEST_BACKUP" -C "$MINIO_DATA"

echo "✅ Restore complete!"
echo "🐳 You can restart MinIO with: podman start las-flores-minio-persistent"
EOF

chmod +x "$HOME/restore-minio.sh"
echo "✅ Restore script created: $HOME/restore-minio.sh"

# Set up automatic backups (idempotent — remove existing entry first)
echo "⏰ Setting up automatic backups..."
crontab -l 2>/dev/null | grep -v 'backup-minio.sh' | { cat; echo "0 2 * * * $HOME/backup-minio.sh"; } | crontab -
echo "✅ Daily backup scheduled at 2:00 AM"

echo ""
echo "🎉 MinIO Persistent Storage Setup Complete!"
echo ""
echo "📋 Summary:"
echo "  • MinIO data stored at: $MINIO_DATA_DIR"
echo "  • Backups stored at: $BACKUP_DIR"
echo "  • Backup script: $HOME/backup-minio.sh"
echo "  • Restore script: $HOME/restore-minio.sh"
echo "  • Automatic daily backups enabled"
echo ""
echo "💡 To use with Las Flores Server:"
echo "  MINIO_ENDPOINT=$MINIO_IP"
echo "  MINIO_PORT=9000"
echo "  MINIO_ACCESS_KEY=$MINIO_ROOT_USER"
echo "  MINIO_SECRET_KEY=$MINIO_ROOT_PASSWORD"
