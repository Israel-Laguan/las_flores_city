# Sprint 03 exit demo: scene composition (SC-319)

Produced by `server/tests/integration/scene-composition.e2e.test.ts` against the real
`planning.*` tables. Each line is one observed value from the run.

- persisted scene `sc319_gate` and overlay `sc319_rain` (priority 10, gated on `sc319_pushed`)
- flag off -> active layers [], weather `overcast` (source: district)
- flag on -> active layers [sc319_rain], weather `rain` (source: overlay:sc319_rain)
- two overlays at priority 3 both set weather -> compile errors: SCENE_EXCLUSIVE_CONFLICT
- re-upsert of unchanged `sc319_gate` -> status `unchanged`, updated_at unchanged (2026-10-10T20:47:20.344Z)
- retired flag `sc319_pushed` and overlay `sc319_clear_b`; both rows kept (retired_at set)
