# SC-S5 — Where does a live weather value come from?

**Box:** 0.5 day · **Actual:** 0.5 day · **Date:** 2026-09-08
**Feeds:** A6 (`architecture.md` §9), SC-305; blocks SC-M2 exit criteria

## Question

`buildBackgroundHints(timeOfDay, weather?, mood?)` (`client/src/utils/resolvePortraitUrl.ts:157`)
has accepted a `weather` parameter since it was written, but every caller passes
`undefined` (`AGENTS.md:36`, `client/src/components/DialogueVisualLayer.ts:156`). There is
no live source for weather anywhere in the codebase. This blocked deciding how scene
weather is authored/derived (open decision **A6**, `architecture.md` §9) and how SC-305
(scene entity: location, time, weather, participants...) should model the field.

## What was run

- Read `AGENTS.md:36` for the current hook signature and documented precedence:
  `visual.background` (explicit) > `weather` > time-of-day > `visual.mood` (soft) > default
  variant > scene backdrop.
- Read `client/src/utils/time.ts` — the existing precedent for "derive a runtime value
  from game state": `getTimeOfDay(timeBlocks)` is a pure function over
  `phoneStore.timeBlocks`, banding the in-game clock into `day` / `dusk` / `night`. No
  polling, no store subscription inside the util — the caller (`DialogueVisualLayer.ts`)
  reads the store and passes the derived value in.
- Grepped `shared/src/schemas/`, `server/src/database/migrations/`, and
  `docs/feat/scene-centric-backend/` for `district` + `weather` to check whether
  district-level ambient state already exists.
  - Districts are a real, seeded entity: `districts` table
    (`server/src/database/migrations/033_district_travel_costs.sql`,
    `034_seed_districts.sql`, `035_seed_districts_extended.sql`), `district_id` on
    `map_tiles` (`shared/src/schemas/map.ts:6`) and on scenes/locations
    (`shared/src/schemas/location.ts:8`, `graph-delta.ts:309` `IN_DISTRICT` edge).
  - No `weather` column exists yet anywhere (districts, scenes, or locations) — it is
    referenced only as prose/prompt text (`server/src/services/MockProvider.ts`,
    `llmPromptsExtra.ts`), never as structured state.
- Read `docs/feat/scene-centric-backend/proposal.md` §2.2–2.3 (scene composition and
  weather resolution) and `brief-activity-and-assets.md` §7–8, which already contain a
  design decision for this exact question, written before this spike:
  - §2.2 classifies `weather` (with `background`) as an **exclusive** scene property —
    exactly one must win, needing explicit precedence — versus **additive** properties
    (participants, items, activities, dialogue) where all active scenes contribute.
  - §2.3, "Weather: inherit with deliberate override": *"Weather defaults from
    district/world state. A scene **may** override it as an authored intent — localized
    rain next to sunshine is a legitimate emotional tool. Because an override is
    something a writer typed on purpose, accidental incoherence still cannot occur."*
  - §4.2's Tier-3 hints example names the exact mechanism: *"scenes in this district
    usually set a weather default"* — i.e., district weather is a **default the
    validator/authoring tooling suggests**, not a value the client polls live.
  - `brief-activity-and-assets.md:371`: *"Weather is both. Scene exclusive property
    (`proposal.md §2.3` inherit-with-override — scene may override district default as
    authored intent) **and** asset-selection hint. Resolved `weather` feeds
    `buildBackgroundHints(weather, timeOfDay, mood)`... Weather is the strongest hint by
    construction (`AGENTS.md:36`)."*

## Raw results

Candidate evaluation against the documented precedence chain (`visual.background` >
`weather` > time-of-day > `mood` > default):

| Candidate | Verdict | Reasoning |
|---|---|---|
| In-game clock (`phoneStore.timeBlocks` → `getTimeOfDay()`) | **Rejected as the weather source** | This precedent derives *time*, a continuous game-clock function. Weather is not a function of the clock — two scenes at the same time-of-day can have different weather (rain in one district, clear in another). Reusing this pattern for weather would collapse the district/scene distinction the design already requires. |
| District-level state | **Adopted (as the default layer)** | Districts already exist as a real entity with seeded rows and a `district_id` FK path from scene/location. Nothing currently stores weather on it, but it is the natural place for a "world default" per §2.3 — one row per district, one field to add. |
| Authored per-scene | **Adopted (as the override layer)** | §2.3 already requires this: a scene must be able to override the district default as deliberate authorial intent (e.g., a rain scene inside an otherwise clear district). This is a content-authoring value (`scene.yaml`), not runtime-derived. |
| Mix of the above | **This is the actual answer** | District default + scene-level override, exactly as proposal.md §2.3 already specifies. Not a new design — this spike confirms the existing design decision and ties it to the specific `buildBackgroundHints` call site. |

## Answer

**It's a mix, already decided in `proposal.md` §2.3 — this spike converts that decision
into the concrete answer for A6: weather comes from district-level state, with an
optional per-scene override.**

- **Source of truth**: a `weather` field on the `districts` table (new column,
  analogous to the existing seeded district metadata in
  `034_seed_districts.sql`/`035_seed_districts_extended.sql`) is the **default**.
- **Override**: a scene's own `weather` field (part of SC-305's scene entity: location,
  time, weather, participants...) wins when a writer sets it, per §2.3's
  inherit-with-override rule.
- **Resolution at the call site**: resolve `weather` **before** calling
  `buildBackgroundHints`, the same way `DialogueVisualLayer.ts:156` already resolves
  `timeOfDay` before the call:
  ```
  const resolvedWeather = scene.weather ?? district.weather ?? undefined;
  const hints = buildBackgroundHints(timeOfDay, resolvedWeather, visual?.mood);
  ```
  This does not touch `buildBackgroundHints`'s own internal chain (weather > time-of-day
  > mood, `resolveBackgroundUrlHints.test.ts:51`) — it only fixes what value flows into
  the `weather` argument. The `visual.background` explicit override
  (`DialogueVisualLayer.ts`'s existing `visual?.background` handling) still takes
  precedence over all of this, unchanged, since it never enters `buildBackgroundHints`.
- **Not the in-game clock.** Time-of-day already comes from `phoneStore.timeBlocks`;
  weather is a separate axis and must not be derived from the same source or collapsed
  into it.

This settles open decision **A6** in `architecture.md` §9 (due by SC-M2): the weather
source is **district default (new `districts.weather` column) with scene-level author
override**, resolved by the caller before invoking `buildBackgroundHints`.

## What it changes

- **SC-305** (scene entity: location, time, weather, participants, items, dialogue refs)
  implements the scene-side half: `scene.weather` as an optional authored override field,
  validated against the same environment-tag vocabulary `buildBackgroundHints` expects
  (`night`, `rain`, `sunset`, etc. — `docs/ASSET_EXPRESSION_VOCABULARY.md`).
- **A new ticket (not yet in the backlog) is needed for the district side**: add a
  `weather` column to `districts` (migration, in the style of `033`–`035`), a default
  seed value per district, and admin/content tooling to set it. This spike does not
  create that ticket's code — it is a decision spike, no code artifact — but SC-305 or
  its follow-up should account for reading `district.weather` as the fallback.
- **`architecture.md` §9's open-decisions table**: A6 moves from *open* to *resolved*,
  citing this file. Text to record: *"Weather source: `districts.weather` (default) +
  `scene.weather` (author override, wins when set) — resolved into a single value by the
  caller before `buildBackgroundHints`, per `proposal.md` §2.3."*
- **`AGENTS.md:36`'s "forward-compatible hook with no live source yet" note becomes
  stale** once the district column + scene field land and a caller resolves them — that
  sentence should be updated (by SC-305 or its follow-up) to describe the resolved
  chain instead of the current "callers pass `undefined`" state.
- No client-side runtime polling is introduced — same shape as the existing
  `getTimeOfDay()` precedent, where the derivation happens once per render/entry, not on
  a live subscription.
