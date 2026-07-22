# M5: Verification & Guardrails

> Status: **Pending** | Effort: 1-2 hours | Risk: Low

## Goal

Automated checks to prevent content completeness regressions and document the unified workflow.

## Tasks

### M5.1 — Add `npm run content:audit` script

**Problem**: No automated way to verify content completeness across all entity types.

**Action**: Create `scripts/content-audit.mjs` that:
1. Scans all entity folders under `content/`
2. Reports a table: type | folders | YAML | `.md` | `.prompt.md` | `assets/` | `__default.png`
3. Exits non-zero if any folder has a YAML but is missing `.md` or `.prompt.md` (errors)
4. Warns (exit 0) for missing `assets/` directories
5. Add `"content:audit": "node scripts/content-audit.mjs"` to root `package.json`

**Output format**:
```text
Content Audit
=============

| Type       | Folders | YAML | .md  | .prompt.md | assets/ | __default.png |
|------------|---------|------|------|------------|---------|---------------|
| characters | 203     | 193  | 203  | 203        | 1       | 1             |
| scenes     | 21      | 21   | 3    | 3          | 0       | 0             |
| locations  | 80      | 65   | 56   | 55         | 1       | 1             |
| overlays   | 2       | 2    | 0    | 0          | 0       | 0             |
| missions   | 1       | 1    | 0    | 0          | 0       | 0             |
| stories    | 1       | 1    | 1    | 1          | 1       | 1             |

Errors: 5 folders missing .md or .prompt.md
Warnings: 283 folders missing assets/
```

**Files**:
- `scripts/content-audit.mjs` (new)
- `package.json` (add `content:audit` script)

**Verification**:
```bash
npm run content:audit
# Should produce the completeness table
# Exit code non-zero only if there are real gaps (missing .md/.prompt.md)
```

---

### M5.2 — Update AGENTS.md with unified workflow

**Problem**: AGENTS.md doesn't document the content pipeline workflow.

**Action**: Add a "Content workflow" section to AGENTS.md describing:
1. **Unify**: `node scripts/unify-content.mjs` — ensures all entity folders have required files
2. **Generate**: `bash scripts/asset-pipeline/scripts/generate-drafts.sh run` — generates images from prompts
3. **Verify**: `node scripts/asset-pipeline/scripts/verify-assets.mjs` — checks asset integrity
4. **Audit**: `npm run content:audit` — reports completeness status

Also document the backup workflow:
```bash
bash scripts/backup-content-assets.sh     # backup before destructive ops
docker compose down --volumes             # destructive to named volumes — MinIO uses host-bind mount
```

**Files**:
- `AGENTS.md`

## Execution Order

M5.1 → M5.2 (script first, then document the full workflow)

## Done When

- [ ] `npm run content:audit` exists and produces the completeness table
- [ ] AGENTS.md documents the unified content workflow
- [ ] AGENTS.md documents the backup/restore workflow
