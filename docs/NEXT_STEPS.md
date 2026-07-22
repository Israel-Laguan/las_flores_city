# Next Steps

> Open action items only. Completed work and key learnings have been moved to `docs/STORY_BUILDER_DESIGN.md` and `docs/planning/milestones/M3-content-unification.md`.

## Remaining Action Items

### 1. Expand `FILL_TARGETS` in ContentFillService (MEDIUM)

**Problem**: `FILL_TARGETS` only covers `description`, `metadata.personality`, and `title`. Fields like `faction` remain as `TODO: Add faction` in YAML metadata.

**Fix**: Expand `FILL_TARGETS` to include all fillable metadata fields.

**Files**: `server/src/services/ContentFillService.ts`
