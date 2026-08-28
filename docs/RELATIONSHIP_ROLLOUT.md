# Relationship Rollout

The relationship contract is the canonical content interface for character
relationships. Dialogue uses `required_relationship`, `hidden_if_relationship`,
and `effects.relationship_effect`; persisted relationship state lives in
`user_relationships`.

## Authoring Rules

- Keep relationship gates and effects in the canonical relationship contract.
- Add `state_set: { last_<slug>_encounter_at: NOW }` beside every relationship effect.
- Keep at least one ungated choice on every entry node.
- Put every positive romance delta behind a relationship gate.
- Keep arc flags and non-relationship statistics in their existing state systems.
- Use `neutral_default: true` only when a first-contact choice must remain visible
  without an existing relationship row.

## Completed Rollout

The converted arcs have per-arc `AUDIT.md` records under their dialogue folders.
Those records document mappings, conflicts, backfills, and validation results.
The integration coverage is in `server/tests/integration/arcBatchGates.test.ts`.

## Future Work

- Extend relationship-aware date and intimacy mechanics without bypassing the
  canonical contract.
- Add new relationship arcs through the reusable checklist in
  `docs/relationship_template.md`.
- Re-run the audit when new dialogue content introduces relationship stats or gates.
- Keep backfill migrations idempotent and scoped to the affected character.
