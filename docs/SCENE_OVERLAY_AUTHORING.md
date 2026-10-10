# Authoring scene overlays

A **scene** is a base definition (location, time, weather, cast slots, dialogue refs).
An **overlay** layers flag-gated changes onto one base scene. The compiler resolves each
player's view from the base plus every overlay whose availability condition holds.

Source of truth: `api/contracts/src/scene/` (vocabulary and validation) and the golden
fixtures in `api/planning/test-fixtures/scene-composition/`.

## Base scene

```yaml
slug: vq_airport_gate          # identifier: letters, digits, underscore; not digit-first
id: c3000000-0000-4000-8000-0000000000f1
title: Airport gate
description: The public concourse at the airport gate.
location: f007b9f2-7e50-48ee-9133-4ba2cb27af12
time: night                    # day | sunset | night | (omit for none)
weather: null                  # a weather tag, or null to use the district's weather
availability:
  type: true                   # always available
priority: 0
items: []
dialogue_refs: [dialogue_vq_endings]
role_slots:
  - slot_id: valentina
    cast: valentina_quan
    position: left             # left | center | right
  - slot_id: bystander
    cast: null                 # open slot, cast by an overlay
    position: right
slot_lines:                    # schema v2: lines keyed by SLOT, never by character
  - slot_id: valentina
    line_id: greet_night       # unique within the slot
    text: You came back.
    when:                      # optional filter; {} = always. Each key is an allow-list
      time: [night]            #   (non-empty; omit the key to leave it unconstrained)
      weather: [rain, fog]
```

A slot line follows the slot, not the character: recasting `valentina` to someone else
keeps the line. Every `slot_id` must name a slot in `role_slots`. Scene JSON is schema
version 2 (`slot_lines` is required, `[]` when there are none); version 1 payloads are
rejected, not migrated, because none were ever stored outside tests.

## Overlay

```yaml
slug: vq_pushed_away_rain
base_scene_slug: vq_airport_gate
priority: 10                   # higher wins among active overlays
availability:
  type: flag
  flag: vq_pushed_away         # a registered flag slug
  expected: true
ops: [ ... ]                   # applied in list order
```

Availability is either `{type: true}` (always) or `{type: flag, flag, expected}`. It uses
the same condition grammar as dialogue and missions.

## Ops

The op set is closed. There is no free-form patch language.

| Op | Merge kind | YAML | Effect |
| --- | --- | --- | --- |
| `set_weather` | exclusive | `{op: set_weather, weather: rain}` | Replaces the scene's weather. Highest priority wins. |
| `set_time` | exclusive | `{op: set_time, time: night}` | Replaces the scene's time. Highest priority wins. |
| `add_items` | additive | `{op: add_items, items: [umbrella]}` | Adds items. Merged by identity, never by position. |
| `add_dialogue_refs` | additive | `{op: add_dialogue_refs, refs: [dialogue_x]}` | Adds dialogue references. |
| `add_role_slot` | additive | `{op: add_role_slot, slot: {slot_id: gate_agent, cast: ana_castillo, position: center}}` | Adds a slot. The `slot_id` must be new. |
| `add_slot_lines` | additive | `{op: add_slot_lines, lines: [{slot_id: bystander, line_id: gasp, text: Oh!, when: {}}]}` | Adds slot lines. Merged by identity (`slot_id` + `line_id`, first wins). The target slot must exist when composed. |
| `cast_slot` | conflicting | `{op: cast_slot, slot_id: bystander, cast: carlos_mendoza}` | Casts an existing slot. `cast: null` clears it. |

## Conflicts

- **Equal-priority exclusive ops conflict.** Two overlays on one base that both set
  `weather` at the same priority fail compilation with `SCENE_EXCLUSIVE_CONFLICT`.
- **Mutually exclusive conditions are fine.** If the two availability conditions can never
  hold together, the overlays never co-apply and compilation passes. The near-miss golden
  fixture (`exclusive-conflict-and-near-miss.json`) does this by narrowing one condition to
  `vq_gave_space` true and `vq_pushed_away` false, so it cannot co-apply with an overlay
  gated on `vq_pushed_away` true.
- **Within one overlay**, two `set_weather` ops (or two `cast_slot` on one slot, or two
  `add_role_slot` with one `slot_id`) are rejected by validation.

## Worked example

The rain-and-cast golden fixture (`flag-gated-rain-and-cast.json`) combines both kinds:

- `vq_pushed_away_rain` (priority 10): when `vq_pushed_away` holds, sets weather to rain
  and adds an umbrella.
- `vq_gave_space_cast` (priority 5): when `vq_gave_space` holds, adds a `gate_agent` slot
  and casts `carlos_mendoza` into the open `bystander` slot.

With both flags off the player sees the district's weather and the base slots. Flipping a
flag changes only the layer it gates, which is the point of the design.

## Checking your work

- The golden fixtures in `api/planning/test-fixtures/scene-composition/` run through
  `composeScene` in CI (`golden-fixtures.test.ts`). Add a fixture when you add a new
  pattern, and it must compile to the stated expectation.
- Run the contract tests for `api/contracts` and `api/planning` before publishing.

## What compile produces

`compileScenes` (`api/planning/src/compile/`) turns a scene and its active overlays into one
**content-addressed artifact** per scene:

- The artifact is the base plus the ordered flag-gated layers plus a snapshot of the
  district weather at compile time. It is one artifact per scene, not one per flag
  combination: the same artifact resolves differently as a flag flips.
- Its id is the lowercase hex sha256 of its canonical JSON bytes. Nothing else goes into the
  hash (no timestamp), so unchanged canon recompiles to the identical id and storing it is a
  no-op. Editing the scene, any overlay, or the district weather changes the id.
- A compile is all-or-nothing. If any scene fails, no artifacts are returned for any scene.
- The report (`CompileReport`) is machine-readable and lists every issue with its scene and
  path. Besides the composition codes above it can say `COMPILE_LOCATION_MISSING`,
  `COMPILE_CAST_CHARACTER_MISSING`, `COMPILE_DIALOGUE_REF_MISSING`, and the hint
  `COMPILE_DIALOGUE_REFS_UNVERIFIED`. That hint means dialogue refs were **not** checked,
  because legacy dialogues have no slug to resolve; it is a gap to know about, not a pass.
- A character is "missing" until it has a `characters.slug` (the content migration backfills
  it).
