# Asset Expression Vocabulary & Scene Variants

Formal conventions for character portrait **expressions** and scene
background **environment variants** in Las Flores 2077. Grounded in the
working Adeyemi Ogunbiyi pipeline (5 expression variants live in
`content/characters/adeyemi_ogunbiyi/`).

## 1. Character portrait expressions

### File naming

```
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

```
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

`resolveBackgroundUrl(visualBackground, sceneBackground, expression, backgroundUrls)`
(`client/src/utils/resolvePortraitUrl.ts`):

1. `visual.background` present → authoritative (URL or plain filename), returned directly
2. A `background_urls[]` entry whose `expression` matches the hint (case-insensitive)
3. First usable entry in `background_urls[]` (the default variant)
4. Current scene backdrop fallback (`scene.backgroundUrl`)

The dialogue node drives the variant through `visual.mood` (a *soft* hint):
`mood: rain` prefers a `background_urls[expression=rain]` pre-painted wet
variant over the dry default with rain particles on top. CSS-only moods
(`tense`, `soft_bloom`, `alert`) match nothing in the pool and fall back
gracefully.

```yaml
visual:
  background: central_plaza
  mood: rain       # prefers background_urls[expression=rain], else dry bg + rain canvas
```

## 3. Data flow (server → client)

```
scenes.background_urls (JSONB)
  → assembleScenePayload()  (server/src/routes/location.ts)
      ├─ scene.backgroundUrl   ← resolveAssetUrl(pool)  — map-view default
      └─ scene.backgroundUrls  ← raw variant pool        — VN-layer selection
  → ScenePayloadSchema.scene.backgroundUrls  (shared/src/schemas/player.ts)
  → LocationScene 'location:background' event  (carries both)
  → DialogueVisualLayer.sceneBackgroundUrls  (client/src/components/DialogueVisualLayer.ts)
  → resolveBackgroundUrl(visual?.background, sceneBackground, visual?.mood, pool)
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
