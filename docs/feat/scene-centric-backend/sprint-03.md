# Sprint 03 — Scene Model and Composition

**Milestone:** SC-M2 (Scene model + compile) · **Dates:** TBD (after Sprint 02 completion)
· **Status:** READY (unblocked by SC-204 landing)

**Sprint goal:** The scene entity exists as a first-class authored object with base + overlay
composition, and the compile step produces content-addressed artifacts with atomic revision
pointers. This is the foundation for SC-M3 (runtime resolver).

**Why this next.** Scene model sits at rung 2 of the critical path (`features.md` §3):
`F10 → F1 → F2 → F3 → F4 → F5`. The condition grammar (F2, Sprint 02) is now complete,
so the scene entity can be built against a stable interface. Scene model and composition
are prerequisites for compile (F4) which is in turn a prerequisite for runtime resolution (F5).

**Capacity.** ~6 days planned across 10 calendar days, matching the Sprint 02 cadence.

---

## 1. Committed tickets

### SC-301 · Scene entity · M · `planning`

Define the scene as the primary unit of interactive content. A scene has location, time,
weather, participants, items, and dialogue references.

**Acceptance**
- Schema defines: `id`, `slug`, `title`, `description`, `location` (district + scene reference),
  `time` (time-of-day tag), `weather` (override or inherit from district),
  `participants` (role slots with character references),
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
  - **Additive properties** (dialogue_refs, participants): base + overlay values are merged.
  - **Exclusive properties** (weather, time): overlay value replaces base value.
  - **Conflicting assignments** (same role slot with different cast): resolved by priority
    order; equal priority fails compile (SC-304).
- Overlay is applied at compile time, not at runtime — the compiled artifact is the resolved
  result.

---

## 2. Stretch — only if the committed set lands early

| ID | Story | Why stretch |
|---|---|---|
| SC-309 | `districts.weather` column + seed defaults + admin/content tooling | Needed by SC-305, small scope |

Do not pull SC-E4 (compile & publish) stories forward. The compile step depends on the scene
entity being stable and tested.

---

## 3. Dependencies

All tickets in this sprint depend on SC-204 (condition evaluator) being complete and
verified. SC-301 through SC-303 have internal dependencies:
- SC-302 depends on SC-301 (role slots are a scene attribute)
- SC-303 depends on SC-301 and SC-302 (composition operates on scenes with role slots)

---

## 4. Definition of Done

For this sprint, DoD is the SC-M2 exit criteria:
- Two hand-authored scenes at one location — a base and a flag-gated overlay — compile to
  artifacts and resolve to different results as the flag flips.
- Equal-priority conflict on an exclusive property fails the compile.
- The revision pointer flips atomically and rolls back by flipping it again.
- A personality pool shared by two characters resolves correctly for both.

---

## 5. Open questions (to be resolved during sprint)

None identified at sprint planning. SC-S1 through SC-S6 spike answers are now committed
and reproducible, providing the necessary datastore assumptions.

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
- SC-S6 provides serving baseline numbers

All of these answers are now committed and reproducible, unblocking SC-M2.
