# Sprint 03 — Scene Model and Composition

**Milestone:** SC-M2 (Scene model + compile) · **Dates:** TBD (after Sprint 02 completion)
· **Status:** READY (unblocked by SC-204 landing)

**Sprint goal:** The scene entity exists as a first-class authored object with base + overlay
composition, providing the stable input the compile step needs. This is the foundation for
SC-M3 (runtime resolver). Artifacts, revision pointers, and the compile step itself are owned
by SC-E4 (see §4).

**Why this next.** Scene model sits at rung 2 of the critical path (`features.md` §3):
`F10 → F1 → F2 → F3 → F7 → F4 → F5`, with F6 (player state) also a prerequisite of F5. The
condition grammar (F2, Sprint 02) is now complete, so the scene entity can be built against a
stable interface. Scene model and composition are prerequisites for compile (F4, which also
depends on F7) which is in turn a prerequisite for runtime resolution (F5).

**Capacity.** ~6 days planned across 10 calendar days, matching the Sprint 02 cadence.

---

## 1. Committed tickets

### SC-301 · Scene entity · M · `planning`

Define the scene as the primary unit of interactive content. A scene has location, time,
weather, role slots, items, and dialogue references.

**Acceptance**
- Schema defines: `id`, `slug`, `title`, `description`, `location` (district + scene reference),
  `time` (time-of-day tag), `weather` (override or inherit from district),
  `role_slots` (role slots with character references),
  `items` (inventory/props visible in the scene),
  `dialogue_refs` (dialogue trees/chunks available in this scene).
- Weather resolution: if scene.weather is set, it overrides district.weather (A6 decision).
- Time-of-day is a tag from the existing set (`day`, `sunset`, `night`).
- Location references a district + a specific location within that district.

### SC-302 · Role slots as a scene attribute · M · `planning`

Participants in a scene are assigned to role slots, not directly to characters. This
allows the same scene to be reused with different casts.

**Acceptance**
- Scene defines `role_slots` array, each with: `slot_id`, `cast` (character_id or null for
  unassigned), `position` (visual placement in the scene).
- Slot IDs are unique within a scene.
- A null cast means the slot is available for assignment at runtime or via overlay.

### SC-303 · Base + overlay composition with priority ordering · M · `planning`

Scenes support overlays that modify or extend the base scene. Overlays can add dialogue,
change participant casts, or modify properties.

**Acceptance**
- Overlay defines `base_scene_slug` to identify the scene it modifies.
- Composition rules:
  - **Additive properties** (dialogue_refs, role_slots): base + overlay values are merged.
  - **Exclusive properties** (weather, time): not merged — the overlay value replaces the base
    value. Because there is only one surviving value, two overlays assigning the same exclusive
    property is a conflict, not a merge.
  - **Conflicting assignments** (same role slot with a different cast, or two overlays
    assigning the same exclusive property): resolved by priority order. The equal-priority
    case is **out of scope for SC-303** and deferred to SC-304, which owns failing the compile
    (see the "Equal-priority conflict on an exclusive property fails the compile" row in §4's
    exit-criteria table).
- Overlay is applied at compile time, not at runtime — the compiled artifact is the resolved
  result.

### SC-309 · `districts.weather` column + seed defaults · S · `planning`

The district-level weather default that SC-301's scene-over-district resolution inherits from.
Small scope, and a commitment rather than stretch because SC-301's acceptance criteria cannot be
met without the weather source it reads.

**Acceptance**
- Migration adds a `weather` column to `districts`, seeded with a default per district.
- Content/admin tooling reads and writes the new column.

---

## 2. Stretch — only if the committed set lands early

No stretch tickets remain: SC-309 was promoted from stretch to a committed ticket (SC-301
depends on it), which leaves this section empty.

Do not pull SC-E4 (compile & publish) stories forward. The compile step depends on the scene
entity being stable and tested.

---

## 3. Dependencies

All tickets in this sprint depend on SC-204 (condition evaluator) being complete and
verified. SC-301 through SC-303 have internal dependencies:
- SC-302 depends on SC-301 (role slots are a scene attribute)
- SC-303 depends on SC-301 and SC-302 (composition operates on scenes with role slots)
- SC-301 depends on SC-309 for the district weather source it inherits from when
  `scene.weather` is unset

---

## 4. Definition of Done

**In scope for this sprint (SC-301, SC-302, SC-303, SC-309):**
- The scene entity is a first-class authored object with location, time, weather,
  role slots, items, and dialogue references, weather resolving scene-over-district, with
  the district default supplied by SC-309's `districts.weather` column.
- Participants are assigned to role slots (`slot_id`, `cast`, `position`), slot ids unique
  within a scene, a null cast meaning unassigned.
- Base + overlay composition applies the documented merge/replace rules with priority
  ordering, and is resolved at compile time rather than at runtime.

**Out of scope for this sprint — required for the SC-M2 exit criteria but owned by other
sprints.** SC-M2 cannot close until these land; they are *not* sprint-03 commitments:

| Exit criterion | Owning story | Sprint |
|---|---|---|
| A base and a flag-gated overlay compile to artifacts that resolve differently as the flag flips | SC-401, SC-402 | SC-E4 (compile & publish) |
| Equal-priority conflict on an exclusive property fails the compile | SC-304 | follow-on to sprint 03 |
| The revision pointer flips atomically and rolls back by re-flipping | SC-404 | SC-E4 (compile & publish) |
| A personality pool shared by two characters resolves correctly for both | SC-306 | follow-on to sprint 03 |

(`backlog.md` lists SC-304 and SC-306 as `Blocked: SC-301` — they unblock once this sprint's
scene entity lands.)

---

## 5. Open questions (to be resolved during sprint)

None identified at sprint planning. SC-S1 through SC-S5 spike answers are now committed and
reproducible, providing the necessary datastore assumptions. SC-S6 is the exception: its
committed harness is a stub, so its numbers remain a historical record — see
`spikes/SC-S6-serving-baseline.md`.

---

## 6. Notes

This sprint promotes the scene model from a concept in `proposal.md` to a real, implemented
entity. The key design decisions from Sprint 01 (A1-A7) and the spike answers (SC-S1 through
SC-S6) inform the shape of these tickets. Specifically:
- SC-S1 confirms entity_edges can be projected naturally from existing content
- SC-S2 establishes reachability cost baselines for the graph
- SC-S3 proves array-aware merge is needed for MODIFY deltas
- SC-S4 provides the pg_trgm alias detection baseline
- SC-S5 resolves weather source (scene overrides district)
- SC-S6 provides serving baseline numbers (historical only — the committed harness is a stub,
  see `spikes/SC-S6-serving-baseline.md`)

All of these answers are now committed, and SC-S1 through SC-S5 are reproducible from their
committed harnesses, unblocking SC-M2. SC-S6's numbers are uncommitted historical results and
must not be treated as a re-runnable baseline.
