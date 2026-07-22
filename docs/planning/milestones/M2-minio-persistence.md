# M2: MinIO Data Persistence

> Status: **Pending** | Effort: 2-3 hours | Risk: Medium

## Goal

Ensure uploaded images survive `docker compose down --volumes`. Currently, `minio-data` is a Docker named volume that gets wiped on `down --volumes`.

## Tasks

### M2.1 — Switch MinIO volume to host-bind mount

**Problem**: `docker-compose.yml` defines `minio-data:/data` as a named volume. Running `docker compose down --volumes` destroys all uploaded images.

**Action**:
1. Add `.minio-data/` to `.gitignore`
2. Update `docker-compose.yml` line 72: replace `minio-data:/data` with `./.minio-data:/data`
3. Optionally remove `minio-data:` from the named volumes block (Docker ignores orphaned defs)

**Files**:
- `docker-compose.yml:72`
- `.gitignore`

**Verification**:
```bash
docker compose down --volumes && docker compose up -d minio
# Upload a test image, then repeat — data should persist
```

---

### M2.2 — Fix `upload-existing-images-to-minio.sh` double-bucket-prefix bug

**Problem**: Lines 66-69 set `minio_path="$BUCKET_NAME/$asset_type/$name.$ext"` then upload to `lasflores/$minio_path/` — effectively `lasflores/las-flores/...`. Also uses hardcoded `/home/anthony/code/...` paths.

**Action**:
1. Fix the path construction so it doesn't double-prefix
2. Replace hardcoded paths with relative or env-based paths

**Files**:
- `scripts/upload-existing-images-to-minio.sh`

**Verification**:
```bash
bash scripts/upload-existing-images-to-minio.sh --dry-run
# Inspect generated mc cp commands for correct paths
```

---

### M2.3 — Add local asset backup script

**Problem**: No automated backup of `content/**/assets/` before destructive operations.

**Action**: Create `scripts/backup-content-assets.sh` that:
1. Creates `backups/` directory
2. Tars all `content/**/assets/` to `backups/content-assets-YYYY-MM-DD.tar.gz`
3. Reports size and file count

**Files**:
- `scripts/backup-content-assets.sh` (new)
- `.gitignore` (add `backups/`)

**Verification**:
```bash
bash scripts/backup-content-assets.sh
ls backups/  # should contain timestamped tar.gz
```

---

### M2.4 — Document volume-wipe rule in AGENTS.md

**Problem**: No documentation warning about data loss from `docker compose down --volumes`.

**Action**: Add to the "Clean shutdown pattern" section in AGENTS.md:
> **MinIO data safety**: `docker compose down --volumes` destroys all named volumes. The MinIO volume uses a host-bind mount (`.minio-data/`) so MinIO data survives normal `down` commands. For extra safety, run `scripts/backup-content-assets.sh` before any operation that might affect volumes — this script backs up local `content/**/assets/` staging only, not objects stored exclusively in MinIO.

**Files**:
- `AGENTS.md`

## Execution Order

M2.1 → M2.2 → M2.3 → M2.4 (sequential: fix volume first, then scripts, then docs)

## Done When

- [ ] MinIO uses host-bind mount (`.minio-data/`)
- [ ] Upload script paths are correct and portable
- [ ] Backup script exists and works
- [ ] AGENTS.md documents the volume-wipe rule
