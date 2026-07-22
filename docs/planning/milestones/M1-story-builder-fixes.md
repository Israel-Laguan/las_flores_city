# M1: Story Builder Bug Fixes

> Status: **Pending** | Effort: 1-2 hours | Risk: Low

## Goal

Fix remaining bugs from `docs/NEXT_STEPS.md` that are still actionable.

## Tasks

### M1.1 — Verify & fix `.md` TODO stub race condition

**Problem**: The scaffold step in `admin-story-builder-generate.ts` may unconditionally write `TODO: Add lore content.` to `.md` and `.prompt.md` files after the async fill job has written real content.

**Action**:
1. Read `server/src/routes/admin-story-builder-generate.ts` around the scaffold logic
2. Confirm whether the unconditional overwrite still exists
3. If yes, remove the unconditional write so the fill job is the sole writer

**Files**:
- `server/src/routes/admin-story-builder-generate.ts`

**Verification**:
```bash
npm run build --workspace=server
```

---

### M1.2 — Expand `FILL_TARGETS` for `story` and `story_beat`

**Problem**: `ContentFillService.ts` has no LLM fill targets for `story` or `story_beat` types, so their descriptions are never auto-filled.

**Action**: Add entries to the `FILL_TARGETS` map in `server/src/services/ContentFillService.ts`:
```ts
story: ['description', 'title'],
story_beat: ['description'],
```

**Files**:
- `server/src/services/ContentFillService.ts:6-16`

**Verification**:
```bash
npm run build --workspace=server && npm run test --workspace=server
```

## Execution Order

M1.1 → M1.2 (independent tasks, can be done in either order)

## Done When

- [ ] `.md` TODO stubs no longer overwrite fill job output
- [ ] `story` and `story_beat` types have LLM fill targets
- [ ] Server builds and tests pass
