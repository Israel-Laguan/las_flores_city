# MinIO Persistent Storage Setup for Las Flores City

## Overview

This guide explains how to set up MinIO for persistent image storage that survives container restarts and provides backup protection.

## Problem Solved

- **Images were being lost** when running `podman down --volumes`
- **No backup system** for MinIO content
- **Complex recovery** when images disappeared

## Solution: Persistent MinIO with Automatic Backups

### Architecture

```
┌───────────────────────────────────────────────────────┐
│                   Local Filesystem                    │
├─────────────────┬─────────────────┬─────────────────┐
│  MinIO Data Dir  │  Backup Dir     │  Project Dir   │
│  ~/minio_data    │  ~/backups      │  ~/code/...    │
└─────────────────┴─────────────────┴─────────────────┘
                    ▲                         ▲
                    │                         │
                    │                         │
┌───────────────────────────────────────────────────────┐
│                     Podman Containers                 │
├─────────────────┬─────────────────┬─────────────────┐
│  MinIO Server   │  Las Flores     │  Other Services │
│  (Persistent)   │  Server         │                │
└─────────────────┴─────────────────┴─────────────────┘
```

## Setup Instructions

### 1. Set Up Persistent MinIO

```bash
cd /path/to/las_flores_city
MINIO_ROOT_USER=your_username MINIO_ROOT_PASSWORD=your_strong_password ./scripts/setup-persistent-minio.sh
```

This script will:
- Create a persistent MinIO container with volume mapping to `~/las_flores_minio_data`
- Set up automatic daily backups to `~/las_flores_minio_backups`
- Create backup/restore scripts in your home directory
- Configure cron for automatic backups

### 2. Upload Existing Images

```bash
cd /path/to/las_flores_city
MINIO_ACCESS_KEY=your_username MINIO_SECRET_KEY=your_strong_password ./scripts/upload-existing-images-to-minio.sh
```

This will upload all existing tile images and any other images found in the content directory.

### 3. Configure Las Flores Server

Update your `.env` file:

```env
MINIO_ENDPOINT=localhost  # or use the container IP
MINIO_PORT=9000
MINIO_ACCESS_KEY=<your_username>
MINIO_SECRET_KEY=<your_strong_password>
```

## Usage

### Access MinIO Console

- **URL**: `http://localhost:9001`
- **Username**: Set via `MINIO_ROOT_USER` environment variable
- **Password**: Set via `MINIO_ROOT_PASSWORD` environment variable

### Manual Backup

```bash
~/backup-minio.sh
```

### Manual Restore

```bash
~/restore-minio.sh
```

### List MinIO Contents

```bash
mc ls lasflores/las-flores
```

## Directory Structure

```
~
├── las_flores_minio_data/       # MinIO persistent storage (mounted to container)
│   └── .minio.sys/              # MinIO system files
│   └── las-flores/             # Your bucket
│       ├── tiles/              # Tile assets
│       │   ├── sidewalk/       # Sidewalk tiles
│       │   ├── runway/         # Runway tiles
│       │   └── ...             # Other tile types
│       ├── portraits/          # Character portraits
│       ├── backgrounds/        # Scene backgrounds
│       └── overlays/           # Overlay images
│
├── las_flores_minio_backups/   # Automatic backups
│   ├── minio_backup_20260722_143022.tar.gz
│   ├── minio_backup_20260723_020000.tar.gz
│   └── ...                     # Last 5 backups kept
│
└── code/las_flores_city/        # Your project
```

## Backup Strategy

### Automatic Backups
- **Frequency**: Daily at 2:00 AM
- **Retention**: Last 5 backups kept
- **Location**: `~/las_flores_minio_backups/`
- **Format**: Compressed tar.gz archives

### Manual Backups
Run anytime with:
```bash
~/backup-minio.sh
```

## Recovery Procedures

### Scenario 1: Container Restart (Normal)
```bash
podman restart las-flores-minio-persistent
```
Data persists because it's mounted to `~/las_flores_minio_data`

### Scenario 2: Accidental Container Removal
```bash
# Recreate container (data is safe in ~/las_flores_minio_data)
./scripts/setup-persistent-minio.sh
```

### Scenario 3: Data Corruption or Loss
```bash
# Restore from latest backup
~/restore-minio.sh

# Restart container
podman start las-flores-minio-persistent
```

### Scenario 4: Full System Recovery
1. Install Podman and MinIO
2. Run setup script: `./scripts/setup-persistent-minio.sh`
3. Copy backups from external storage to `~/las_flores_minio_backups/`
4. Restore: `~/restore-minio.sh`

## Asset Management Workflow

### Adding New Images

1. **Generate/Place images** in appropriate directories
2. **Upload to MinIO**:
   ```bash
   mc cp /path/to/image.png lasflores/las-flores/path/in/minio/
   ```
3. **Update YAML files** to reference MinIO paths

### Example: Adding a Character Portrait

```bash
# 1. Place image in content directory (temporary)
cp character_portrait.png /path/to/las_flores_city/content/characters/joe/assets/

# 2. Upload to MinIO
mc cp /path/to/las_flores_city/content/characters/joe/assets/character_portrait.png "lasflores/las-flores/portrait/character_portrait.png"

# 3. Update YAML
# content/characters/joe/char_joe.yaml
asset_paths:
  portrait: portrait/character_portrait.png

# 4. (Optional) Remove local copy if not needed
# rm /path/to/las_flores_city/content/characters/joe/assets/character_portrait.png
```

## Maintenance

### Check MinIO Status
```bash
podman ps | grep minio
mc admin info lasflores
```

### Check Backup Status
```bash
ls -lah ~/las_flores_minio_backups/
```

### Clean Up Old Backups
```bash
# Keep only last 5 backups (already automated, but manual cleanup possible)
ls -t ~/las_flores_minio_backups/minio_backup_*.tar.gz | tail -n +6 | xargs rm -f
```

## Troubleshooting

### MinIO Container Won't Start
```bash
# Check logs
podman logs las-flores-minio-persistent

# Check port conflicts
podman ps -a
netstat -tuln | grep 9000
```

### Can't Connect to MinIO
```bash
# Check if container is running
podman ps

# Check network
podman network inspect las-flores-net

# Try accessing via IP
MINIO_IP=$(podman inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' las-flores-minio-persistent)
echo "Try: http://$MINIO_IP:9000"
```

### Backups Not Working
```bash
# Check cron jobs
crontab -l

# Test backup manually
~/backup-minio.sh

# Check cron logs
grep CRON /var/log/syslog
```

## Security Considerations

### Change Default Credentials
Edit the setup script and change:
```bash
MINIO_ROOT_USER=your_username
MINIO_ROOT_PASSWORD=your_strong_password
```

### Restrict Access
- Use firewall rules to limit access to MinIO ports
- Consider using Podman's `--userns=keep-id` for better permission management
- For production, use TLS and proper authentication

## Migration from Old Setup

If you have an existing MinIO setup:

1. **Backup old data**:
   ```bash
   podman cp old-minio-container:/data ~/old_minio_backup
   ```

2. **Set up new persistent MinIO** (as described above)

3. **Restore data**:
   ```bash
   cp -r ~/old_minio_backup/* ~/las_flores_minio_data/
   podman restart las-flores-minio-persistent
   ```

## Best Practices

1. **Regularly test restores** - Don't wait for an emergency to find out backups don't work
2. **Monitor disk space** - MinIO data and backups can grow large
3. **Document your setup** - Keep this file updated with any customizations
4. **Consider external backups** - Copy backups to cloud storage or external drives
5. **Use meaningful bucket structure** - Organize assets logically (tiles/, portraits/, etc.)

## Alternative: Local Directory with Symlinks

If you prefer not to use MinIO during development:

```bash
# Create a local assets directory
mkdir -p ~/las_flores_assets

# Create symlinks to use local assets during development
ln -s ~/las_flores_assets/tiles ~/code/las_flores_city/content/lore/shared/tiles/assets

# Add to .gitignore
echo "~/las_flores_assets/" >> .gitignore
```

Then use the existing backup scripts to periodically back up this directory.

## Conclusion

This persistent MinIO setup provides:
- ✅ **Data persistence** across container restarts
- ✅ **Automatic backups** with retention policy
- ✅ **Easy recovery** from accidents
- ✅ **Local storage** without git pollution
- ✅ **Scalable** for production use

The system is designed to be robust yet simple, ensuring your valuable image assets are protected while keeping them out of git history.