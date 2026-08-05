# Asset Expression Vocabulary & Scene Variants

Formal conventions for character portrait **expressions** and scene
background **environment variants** in Las Flores 2077. Grounded in the
working Adeyemi Ogunbiyi pipeline (5 expression variants live in
`content/characters/adeyemi_ogunbiyi/`).

## 1. Character portrait expressions

### File naming

```text
content/characters/<slug>/assets/
  <slug>__default.png          ← neutral / base (always required)
  <slug>__<expression>.png     ← expression variants
```

### Core expression vocabulary (borrowed from the VN industry)

| Tag | Meaning |
|---|---|
| `default` | Neutral / resting face (always required) |
| `happy` | Warm, open smile |
| `sad` | Downcast, grief |
| `angry` | Confrontational |
| `surprised` / `shocked` | Sudden revelation |
| `calculating` | Cold focus, thinking |
| `vulnerable` | Guard down, soft |
| `tender` | Intimate warmth |
| `smirk` | Sardonic, knowing |
| `afraid` | Fear, threat |
| `disgusted` | Moral rejection |
| `determined` | Resolve |

Characters do **not** need all expressions — the character's
`<slug>.prompt.md` "Variants" section specifies which to author.

### YAML (`portrait_urls[]`)

```yaml
portrait_urls:
  - url: s3://las-flores/portraits/<slug>/<slug>__default.png
    label: dev
  - url: s3://las-flores/portraits/<slug>/<slug>__shocked.png
    label: dev
    expression: shocked
```

The `default` entry may omit the `expression` tag (it is the fallback).

### Dialogue node reference

```yaml
visual:
  expression: shocked
  position: right
  transition: fade
```

Selection happens in `resolvePortraitUrl(speaker, expression)`
(`client/src/utils/resolvePortraitUrl.ts`):
1. Entry whose `expression` tag matches the node's `expression` (case-insensitive)
2. First usable URL (the default portrait)
3. Legacy `avatar_url`

## 2. Scene background environment variants

### File naming

```text
content/scenes/<slug>/assets/
  <slug>__default.png          ← required day / neutral shot
  <slug>__night.png            ← night version (darker palette, neon glow)
  <slug>__rain.png             ← rain version (wet surfaces, diffused light)
  <slug>__sunset.png           ← golden hour
  <slug>__interior.png         ← if the scene has interior/exterior states
```

### YAML (`background_urls[]`)

```yaml
background_urls:
  - url: https://cdn.../<slug>__default.png
    label: dev
  - url: https://cdn.../<slug>__night.png
    label: dev
    expression: night
  - url: https://cdn.../<slug>__rain.png
    label: dev
    expression: rain
  - url: https://cdn.../<slug>__sunset.png
    label: dev
    expression: sunset
```

### Two layers stay separate

| Layer | What it does | Lives in |
|---|---|---|
| **`mood`** | CSS/Canvas2D treatment *on top of* the background | `DialogueNodeVisual.mood` |
| **`expression`** (background) | Selects a different background image entirely | `background_urls[].expression` |

The two stack: a `night` background variant under `mood: tense` produces
a tense night confrontation.

### Background selection priority

`resolveBackgroundUrl(visualBackground, sceneBackground, hints, backgroundUrls)`
(`client/src/utils/resolvePortraitUrl.ts`) rejects by priority:

1. `visual.background` present → **authoritative** (URL or plain filename), returned directly — per-node authoring always wins over auto-suggestions
2. `hints` — an **ordered** list of expression tags, tried in sequence against
   `background_urls[].expression` (case-insensitive); first match wins.
   A single string is treated as a one-element list (backward compatible).
   The hint chain is built by `buildBackgroundHints(timeOfDay, weather?, mood?)`:
   **weather > time-of-day > node `mood`** (see below).
3. First usable entry in `background_urls[]` (the default variant)
4. Current scene backdrop fallback (`scene.backgroundUrl`)

### Game-driven environment hints (Phase 4)

The VN layer derives a *game-driven* auto hint from **real game state** — the
in-game clock (`phoneStore.timeBlocks → getTimeOfDay()` in
`client/src/utils/time.ts`), the same source that drives the phone status-bar
clock. Time-of-day bands: `day` 08:00–17:59, `sunset`/dusk 18:00–19:59,
`night` 20:00–07:59. `buildBackgroundHints()` maps `dusk` → the asset
vocabulary tag `sunset` so golden-hour auto-picks a `__sunset.png` variant.

`weather` is a *forward-compatible hook*: there is no weather source of truth
in the game yet, so callers pass nothing (`undefined`) and only the
time-of-day band participates. When a real weather source lands (server → game
state), pass it first — it outranks time-of-day by construction of the ordered
hint list.

```text
getTimeOfDay(phoneStore.getState().timeBlocks)   // real game clock
  → buildBackgroundHints(timeOfDay, weather?, visual?.mood)
  → [weather?, timeOfDayTag?, mood?]             // ordered, de-duped
  → resolveBackgroundUrl(visual?.background, scene.backgroundUrl, hints, pool)
```

The chain therefore behaves like:

| Scenario | Resolved variant |
|---|---|
| raining at night, `__rain` + `__night` exist | `__rain` (weather ranks first) |
| clear night, `__night` exists | `__night` (time-of-day) |
| golden hour (`dusk`), `__sunset` exists | `__sunset` |
| day, node `mood: rain`, `__rain` exists | `__rain` (mood soft-hint still works) |
| node sets `visual.background` explicitly | that exact backdrop, always |

### Mood vs environment hint

`mood` values partially overlap with environment tags (`rain`, `night`
overlap; `tense`/`soft_bloom`/`alert` are CSS-only). The two layers stay
**separate**: `mood` = CSS/Canvas2D treatment *on top of* the background;
`expression` = selects a pre-painted variant *below*. The dialogue node drives
the variant through `visual.mood` as the **last, soft** hint — only consulted
when the game-driven environment chain matched nothing:

```yaml
visual:
  background: central_plaza
  mood: rain       # soft hint: prefers background_urls[expression=rain],
                   # but only if the game clock/weather didn't already match
```

CSS-only moods (`tense`, `soft_bloom`, `alert`) match nothing in the pool and
fall back gracefully.

## 3. Data flow (server → client)

```text
scenes.background_urls (JSONB)
  → assembleScenePayload()  (server/src/routes/location.ts)
      ├─ scene.backgroundUrl   ← resolveAssetUrl(pool)  — map-view default
      └─ scene.backgroundUrls  ← raw variant pool        — VN-layer selection
  → ScenePayloadSchema.scene.backgroundUrls  (shared/src/schemas/player.ts)
  → LocationScene 'location:background' event  (carries both)
  → DialogueVisualLayer.sceneBackgroundUrls  (client/src/components/DialogueVisualLayer.ts)
  → phoneStore.timeBlocks → getTimeOfDay()   (client/src/utils/time.ts)  ← real clock
  → buildBackgroundHints(timeOfDay, weather?, visual?.mood)  (game-driven chain)
  → resolveBackgroundUrl(visual?.background, sceneBackground, hints, pool)
```

## 4. Content authoring quick reference

### Adding an expression to a character

1. Generate the image into `content/characters/<slug>/assets/<slug>__<expression>.png`
2. Publish via `AssetPublishService` → URL added to MinIO
3. Add a `portrait_urls[]` entry with the `expression` tag
4. Reference it in dialogue nodes via `visual.expression`
5. List it in the character `.prompt.md` "Variants" section

### Adding an environment variant to a scene

1. Generate the image into `content/scenes/<slug>/assets/<slug>__<variant>.png`
2. Publish → MinIO URL
3. Add a `background_urls[]` entry with the `expression` tag
4. Author per-node (`visual.background` + `visual.mood`) or rely on the
   mood-as-expression hint — the variant pool resolves automatically
