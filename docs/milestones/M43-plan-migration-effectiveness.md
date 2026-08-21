# M43 — Plan-to-Migration Effectiveness

> **Status:** Planned · **Owner:** story-engine effort
> **Source record:** the scoped-intake findings from the former M39 exploration
> (that record was retired without a separate archive; M43 is now its owner)

## Goal

Confirm that the current story-builder plan pipeline reliably turns an authored plan into
validated, migrated content, without reviving the retired direct-YAML wizard path.

## Scope

- Exercise the complete flow: template or description → plan → review/refine → solidify → file
  write → `migrateContent` → `PlanVerificationService`.
- Add or finish the smallest useful scoped templates, beginning with mission and location.
- Verify generated IDs, slugs, links, and migrated database rows are server-owned.
- Remove or guard any remaining authoring path that writes entity YAML without migration.
- Test failure, retry, and idempotent re-run behavior so migration effectiveness is measurable.

## Acceptance Criteria

- [ ] Mission and location inputs produce plans that solidify into migrated rows with correct links.
- [ ] The flow uses `StoryBuilderFileWriter`, `migrateContent`, and `PlanVerificationService`.
- [ ] Re-running the same plan is safe and does not create ghost files or duplicate rows.
- [ ] Invalid or partially generated plans fail verification without mutating canon.
- [ ] Server and admin tests cover the successful and rejected paths.

## Verification

```bash
npm run test --workspace=server
npm run test --workspace=admin
npm run build --workspace=server
npm run build --workspace=admin
npm run validate:content
```

Perform one manual mission and location flow and record the plan ID, migrated row, and
verification result.

## Relationship to Existing Records

M43 owns the implementation and evidence for the plan-to-migration effectiveness question;
the superseded M39 exploration record is no longer a separate active milestone.
