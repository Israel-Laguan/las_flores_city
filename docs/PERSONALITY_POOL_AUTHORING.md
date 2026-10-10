# Authoring personality pools and slot lines

A **personality pool** is a named set of lines that many characters can share. Twenty vendors
can use one `street_vendor` pool; nobody copies it. A **slot line** is a line attached to a
role slot in a scene, so it follows whoever is cast there. Both use the same line shape and the
same resolution ladder.

Source of truth: `api/contracts/src/dialogue/` (pool, ladder) and `api/contracts/src/scene/line.ts`
(the shared line shape).

## A pool

```yaml
slug: street_vendor            # identifier: letters, digits, underscore; not digit-first
lines:                         # at least one
  - line_id: a_hello           # unique within the pool; also the final tie-break (see below)
    text: Fresh today!
    when: {}                   # {} = always eligible
  - line_id: b_rain
    text: Wet day, hot soup.
    when:
      weather: [rain, storm]   # each key is an allow-list: non-empty, or omit the key
  - line_id: c_rain_night
    text: Rain at night? Stay and eat.
    when:
      weather: [rain]
      time: [night]
```

- `time` is `day | sunset | night`. `weather` is the weather vocabulary (`clear`, `overcast`,
  `rain`, `storm`, `fog`, `smog`, `dust`).
- A pool carries **only** `slug` and `lines`. Traits, stats, relationship data or a list of
  characters are validation errors (`POOL_FIELD_UNKNOWN`). Which characters use a pool is a
  separate link, never a field on the pool.
- Linking is idempotent. A character can use any number of pools and a pool can serve any
  number of characters. Linking an unknown or retired pool fails. Retiring a pool silences it
  for every character that used it (the rows stay, for the audit trail).

## Slot lines

Scenes (schema v2) carry `slot_lines`, keyed by slot, never by character. See
[SCENE_OVERLAY_AUTHORING.md](SCENE_OVERLAY_AUTHORING.md) for the syntax and the `add_slot_lines`
overlay op. Recasting a slot (`cast_slot`) moves its lines to the new speaker.

## Which line does a character say? The ladder

For one character in one context (`time`, `weather`), candidates are gathered from every rung
and exactly one line wins. There is no randomness and no LLM, and the result does not depend on
the order candidates were listed in.

1. **Eligible.** A line applies only if every dimension its `when` constrains is **known** in
   the context and **listed**. An unknown value never satisfies a constraint: a rain-only line
   does not fire when the weather is unknown.
2. **Rung.** `scene` beats `relationship` beats `personality`. A higher rung that is not
   eligible falls through to the next one.
3. **Specificity.** Within a rung, the line that constrains more dimensions wins (`time` and
   `weather` both beats one of them beats none).
4. **Tie-break: `line_id` ascending.** If two eligible lines are still tied, the one whose
   `line_id` sorts first wins. This is why ids like `a_hello`, `b_rain` are a useful
   convention: the id is a deliberate priority knob among equally specific lines.
5. **Final tie-break: source ascending** (the pool slug or slot id). Only reached when two
   different sources use the same `line_id` at the same rung and specificity; it exists so the
   result is always fully determined.

Variety (a different greeting each visit) is **not** part of this rule and is not built. Two
equally good lines always resolve the same way; seeded variety is a later feature.

### Rungs in the planning-level resolver

- `scene`: the lines on the slot the character is cast in.
- `relationship`: supplied by the caller. The new backend has no relationship line model yet
  (the existing `*_relationship` dialogues are whole dialogue trees), so this rung is an input.
- `personality`: every line of every **active** pool the character is linked to.

Resolution today is **planning-level** (`resolveCharacterLine`, `resolveSlotLine` in
`api/planning/src/dialogue/`). Pools are not compiled into artifacts yet, so runtime cannot
serve them; that is the first task of the runtime milestone (SC-M3).
