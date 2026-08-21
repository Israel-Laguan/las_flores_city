# M42 — Content Assets and Migration Completion

> **Status:** Planned · **Owner:** story-engine effort
> **Source record:** M40 prompt/expression asset carryforward; also absorbs the remaining content-completeness work from the retired M35 exploration (no separate M35 archive exists)

## Goal

Finish the remaining content files and image assets, publish the assets to canonical storage,
and run the content migration and verification path so the file database and runtime database
agree.

## Scope

- Complete the missing mission and story-beat lore/prompt files identified by M35.
- Add missing dialogue/story asset directories where required by the content audit.
- Complete M40's G-M40-1 through G-M40-4 work, including Wen Zhao expressions and scene backgrounds.
- Clean stale asset URLs, publish local assets, and migrate the resulting YAML through the server.
- Tighten content-audit blind spots and preserve the server-only content write contract.

## Acceptance Criteria

- [ ] All content files identified by the retired M35 audit exist and pass the content audit.
- [ ] Required expression and scene background assets are published to MinIO with valid YAML/DB URLs.
- [ ] `verify-assets.mjs` reports no missing published assets and no visual-expression gaps.
- [ ] `migrateContent` completes successfully and the migrated rows match the authored files.
- [ ] No direct file write bypasses the established migration path.

## Verification

```bash
npm run content:audit
npm run validate:content
node scripts/asset-pipeline/scripts/verify-assets.mjs
```

Run the relevant migration/integration tests against the development databases and record the
migration result, asset counts, and any unrelated pre-existing failures.

## Relationship to Existing Records

M40 remains a live source record and the backlog definition for G-M40-1 through
G-M40-4; M42 is the execution and end-to-end completion milestone for that work.
The M35 reference above is historical only — that exploration record was retired
without an archive and has no separate live document.
