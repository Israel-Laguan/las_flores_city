# Milestone 9: Final Verification

> **Depends on**: All previous milestones (M1–M8)
> **Next**: None — this is the final milestone

## Context

End-to-end verification of the Story Builder MVP. All milestones have been implemented; now we verify that everything works together: all builds pass, all tests pass, content validation still works, and the full flow works manually in the browser.

## Goals

- [ ] Run full lint, build, and test suite for all workspaces
- [ ] Run `npm run validate:content` to ensure no content validation regressions
- [ ] Rebuild server container and verify health
- [ ] Manual E2E: describe → plan → execute → verify in DB
- [ ] Verify no regressions in existing admin pages

## Files to Create/Modify

None (verification only).

## Implementation Details

### Step 1: Build Verification

Run from project root:

```bash
# Shared workspace
npm run lint --workspace=shared
npm run build --workspace=shared

# Server workspace
npm run lint --workspace=server
npm run build --workspace=server
npm run test --workspace=server

# Admin workspace
npm run lint --workspace=admin
npm run build --workspace=admin
```

### Step 2: Content Validation

```bash
npm run validate:content
```

This ensures the new Story Builder hasn't broken existing content validation.

### Step 3: Server Container Rebuild

```bash
docker compose build server && docker compose up -d server
```

Verify health (use in-container wget, not curl — see AGENTS.md):

```bash
docker exec las-flores-server wget -qO- http://localhost:3000/health
```

Expected response: `{"success":true,...}`

### Step 4: Manual E2E Test

1. Navigate to `/story-builder` in the admin panel
2. **Step 1 (Describe)**: Enter "Add a bartender named Diego at the Plaza"
3. Click "Generate Plan"
4. **Step 2 (Review)**: Verify plan items appear (character, scene update, dialogue)
5. Edit any fields if needed
6. Click "Approve & Execute"
7. **Step 3 (Execute)**: Click "Execute Plan"
8. Verify created files are listed
9. Verify no validation errors
10. **Step 4 (Assets)**: Verify asset needs are listed with links

### Step 5: Database Verification

After execution, verify new content exists in the database:

```sql
-- Check for new character
SELECT * FROM characters WHERE name = 'Diego';

-- Check for new dialogue
SELECT * FROM dialogue_trees WHERE name LIKE '%Diego%';

-- Check migration log
SELECT * FROM migration_log ORDER BY applied_at DESC LIMIT 10;
```

### Step 6: Regression Check

- [ ] Navigate to `/editor` — still works
- [ ] Navigate to `/content-linker` — still works
- [ ] Navigate to `/migration` — still works
- [ ] Navigate to `/missions` — still works
- [ ] Navigate to `/characters` — still works

## Completion Checklist

Before marking the Story Builder MVP as complete, verify:

- [ ] `npm run lint --workspace=shared` passes
- [ ] `npm run build --workspace=shared` passes
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes
- [ ] `npm run test --workspace=server` passes (including new tests)
- [ ] `npm run lint --workspace=admin` passes
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run validate:content` passes
- [ ] Server health check passes: `docker exec las-flores-server wget -qO- http://localhost:3000/health`
- [ ] Manual E2E test successful (describe → plan → execute → verify)
- [ ] New content appears in database after execution
- [ ] No regressions in existing admin pages

## Next Milestone

None — this is the final milestone. The Story Builder MVP is complete.

## Future Enhancements (Post-MVP)

These are out of scope for Phase 1 but documented for future work:

- **Phase 2**: Dependency graph in plan items, dry-run mode, plan validation, asset needs calculator, error recovery
- **Phase 3**: `content_plans` and `content_plan_items` tables, plan list page, background job execution, rollback support
- **Phase 4**: Tiered asset needs, LLM-generated content fill, clone existing content as template, collaborative editing, plan templates