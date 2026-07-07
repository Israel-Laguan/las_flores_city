# Media Pipeline Implementation Tiers

> **Purpose:** Track implementation work for adapting VN interface concepts to Phaser and completing the asset pipeline.
> **Branch:** `feat/media-pipeline-tier0` (Tier 0), subsequent branches for Tiers 1-3
> **Last updated:** 2026-07-02

---

## Tier 0 — DB, Pipeline, and Content Preparation (CURRENT)

**Goal:** Make the asset pipeline end-to-end functional so portraits/backgrounds can be authored, validated, and served to both DOM and Phaser consumers.

**Branch:** `feat/media-pipeline-tier0`

### Tasks

- [x] 0.1 — Create feature branch `feat/media-pipeline-tier0`
- [x] 0.2 — DB migration: add `portrait_urls` JSONB to `characters`
- [x] 0.3 — Shared schema: extend `YAMLCharacterSchema` with `portrait_urls`
- [x] 0.4 — Server upsert: persist `portrait_urls` in `upsertCharacter()`
- [x] 0.5 — Server route: read `portrait_urls` from DB, select by expression
- [x] 0.6 — Prompt library: add Consumer Intent Tags section
- [x] 0.7 — Prompt generator: fix undefined leaks, add consumer tags
- [x] 0.8 — Verify script: add MIME + dimension checks
- [x] 0.9 — Asset pipeline docs: add sprite atlas convention section
- [x] 0.10 — Content YAML: add `portrait_urls` to key character YAMLs
- [x] Verify: validate content, lint+build server, build shared, test prompt generator

### Deliverable
- Characters can have multiple portrait URLs tagged by expression/mood
- Server selects the correct portrait URL based on NPC mood
- Prompt generator produces clean prompts with consumer tags
- Verify script catches MIME mismatches and dimension errors
- Pipeline docs document the atlas convention for future tiers

---

## Tier 1 — Phaser VN Aesthetic Adaptation

**Goal:** Adapt the VN interface concept (`docs/lore/assets/ui-concepts/vn-interface/`) to Phaser rendering. Visual polish only — no new assets required.

**Branch:** `feat/media-pipeline-tier1-vn-aesthetic` (depends on Tier 0 merge)

### Tasks

- [ ] 1.1 — Create `client/src/scenes/location/atmosphere-effects.ts`
  - `addScanlines(scene, width, height)` — tiled canvas texture with horizontal scanline pattern
  - `addVignette(scene, width, height)` — Graphics-based radial darkening (concentric rects with increasing alpha)
  - `addNeonFlare(scene, width, height)` — horizontal gradient line at ~160px from bottom
  - All added once in `LocationScene.create()` at high depth, pointer-events none

- [ ] 1.2 — Enhance `client/src/scenes/location/npc-renderer.ts`
  - Add Graphics-drawn rounded rectangle frame behind each NPC portrait (matching CSS `border-radius: 16px 16px 4px 4px` with neon-blue border)
  - Add subtle glitch overlay rectangle with screen blend mode on the portrait
  - Apply saturate/contrast equivalent via `setPipeline` or `setTint` on the portrait image

- [ ] 1.3 — Enhance `client/src/scenes/LocationScene.ts` HUD blocks
  - Replace plain `locationNameText`/`moodText` with styled containers: rounded rect background + label + value text
  - Match the concept's `.hud-block` aesthetic using existing `--neon-cyan`/`--neon-blue` palette

### Deliverable
- LocationScene has scanlines, vignette, and neon flare atmosphere effects
- NPC portraits have styled frames and glitch overlays
- HUD blocks match the VN concept aesthetic

---

## Tier 2 — Sprite Atlas Loading Foundation

**Goal:** Make the Phaser client capable of loading animated sprite sheets/texture atlases when assets exist. Code-ready but not dependent on actual atlas assets.

**Branch:** `feat/media-pipeline-tier2-sprite-atlas` (depends on Tier 1 merge)

### Tasks

- [ ] 2.1 — Extend `client/src/scenes/LocationScene.ts` `loadDynamicAsset`
  - Add `loadSpriteAtlas(key, textureUrl, atlasUrl)` method
  - Cache by URL, not just key (fixes the report's "E. Phaser loading guard" issue)
  - Fallback: if atlas loading fails, fall back to `loadDynamicAsset(key, textureUrl, 'image')`

- [ ] 2.2 — Extend `NPCData` and `client/src/scenes/location/npc-renderer.ts`
  - Add to `NPCData`: `expression?: string` (e.g., `'neutral'`, `'blink'`), `atlasUrl?: string` (optional JSON atlas URL)
  - In `createNPCVisual()`: if `atlasUrl` exists and loads successfully, create a `Phaser.GameObjects.Sprite` and play the expression animation; otherwise fall back to the current `this.add.image()` static portrait
  - Register a default blink animation in `LocationScene.create()` via `this.anims.create()`

- [ ] 2.3 — Extend `shared/src/index.ts` + `server/src/routes/location.ts`
  - Add optional `atlasUrl` and `expression` to `ScenePayloadSchema.npcs[]`
  - In `buildNpcPayload()`, if the character has an atlas URL configured, include it; otherwise omit (backwards-compatible)

### Deliverable
- Phaser can load texture atlases for NPC portraits when `atlasUrl` is present
- Animated sprites (blink, mouth-flap) can play via `this.anims.create()` + `sprite.play()`
- Static portrait fallback works when no atlas is configured

---

## Tier 3 — Pipeline Documentation and Tooling

**Goal:** Finalize the asset pipeline documentation and tooling so content creators can generate, verify, and upload assets independently.

**Branch:** `feat/media-pipeline-tier3-docs` (depends on Tier 2 merge)

### Tasks

- [ ] 3.1 — Prompt library: add Consumer Intent Tags section (if not done in Tier 0)
- [ ] 3.2 — Verify script: add MIME + dimension checks (if not done in Tier 0)
- [ ] 3.3 — Asset pipeline docs: add sprite atlas convention section (if not done in Tier 0)
- [ ] 3.4 — Create `docs/lore/assets/workflows/asset-generation-checklist.md`
  - Pre-generation checklist (lore written, prompt reviewed, consumer tag set)
  - Generation settings per tool (MidJourney, Stable Diffusion, DALL-E 3)
  - Post-generation checklist (MIME verified, dimensions checked, uploaded to MinIO, content YAML updated, verify-assets passes)

### Deliverable
- Content creators have a complete guide for generating assets
- All pipeline tooling is documented and tested

---

## Cleanup — Dev Artifact Sweep

**Goal:** Remove temporary/dev artifacts accumulated during exploration and concept work, keeping only production-ready content.

**Branch:** `feat/media-pipeline-cleanup` (after all tiers merge)

### Tasks

- [ ] Remove `docs/lore/assets/ui-concepts/` directory (HTML/CSS mockups — served their purpose)
- [ ] Remove `docs/lore/assets/style-exploration/` directory (if exists)
- [ ] Remove `docs/lore/assets/akool-test/` directory (test outputs)
- [ ] Review `docs/lore/figures/*.prompt.md` — keep only prompts for characters that have content YAMLs; remove orphaned prompts
- [ ] Review `docs/lore/landmarks/**/*.prompt.md` — keep only prompts for locations that have scene YAMLs; remove orphaned prompts
- [ ] Ensure `.gitignore` covers `docs/lore/assets/**/*.png`, `*.jpg`, `*.jpeg` (binary assets should never be committed)
- [ ] Verify no binary assets are in the working tree: `git status --short | grep -E '\.(png|jpg|jpeg|mp3|wav)$'`
- [ ] Commit cleanup with message: `chore(media-pipeline): remove dev artifacts after tier 0-3 completion`

### Deliverable
- Working tree contains only source content (markdown, YAML, code)
- No binary assets or concept mockups in the repo
- `.gitignore` prevents future binary commits

---

## Biometric Pipeline Tier — `feat/biometric-asset-pipeline`

**Goal:** Implement the biometric isolation phase as the foundation for all character asset generation. This tier creates the registries, prompt generator extensions, schema updates, and documentation.

**Branch:** `feat/biometric-asset-pipeline`

### Tasks

- [x] Create registry YAML files (style_prefix, body_shapes, ethnicities, personality_poses, poses, expressions)
- [x] Add `biometric`, `expression`, `outfit-pose` prompt types to `generate-prompt.mjs`
- [x] Extend `YAMLCharacterSchema` with `biometric_refs` and `asset_manifest` in both `shared/src/schemas/yaml-content.ts` and `shared/src/index.ts`
- [x] Generate Diego Huamán biometric prompts (MVP pilot)
- [x] Update `asset_pipeline.md` with biometric phase + two-track delivery
- [ ] Create `scripts/generate-character-assets.mjs` — reads character YAML + registries → generates all biometric/expression/outfit prompts
- [ ] Create `docs/lore/assets/scripts/compose-sprite.mjs` — layers body + face + hair → final sprite
- [ ] Create `docs/lore/assets/scripts/validate-biometric.mjs` — validates biometric images have correct dimensions/anchor points
- [ ] Add biometric fields to content migration pipeline (`server/src/content/migrate.ts`)
- [x] Update existing prompt types (`tile`, `overlay`, `background`, `portrait`, `phone-wallpaper`, `app-icon`) with new style prefix
- [x] Create non-character asset registries (`tiles.yaml`, `landmarks.yaml`, `backgrounds.yaml`, `app_icons.yaml`, `phone_wallpapers.yaml`)
- [x] Archive legacy assets to `docs/lore/assets/references/` with migration README

### Deliverable
- Character YAMLs can reference biometric sheets and asset manifests
- Prompt generator can produce biometric, expression, and outfit-pose prompts
- Documentation covers the full biometric isolation workflow

---

## Quick Reference: Branch Strategy

```
main
  └── feat/biometric-asset-pipeline        ← Biometric isolation + registries
        └── feat/media-pipeline-tier0          ← Tier 0: DB + pipeline + content
              └── feat/media-pipeline-tier1-vn-aesthetic   ← Tier 1: Phaser VN aesthetic
                    └── feat/media-pipeline-tier2-sprite-atlas  ← Tier 2: Atlas loading
                          └── feat/media-pipeline-tier3-docs     ← Tier 3: Docs + tooling
                                └── feat/media-pipeline-cleanup   ← Cleanup dev artifacts
```

Each tier branch is rebased off the previous tier's merge to main.

---

## Quick Reference: File Changes by Tier

### Tier 0
| File | Action |
|---|---|
| `server/src/database/migrations/038_character_portrait_urls.sql` | Create |
| `shared/src/index.ts` | Modify — add `portrait_urls` to `YAMLCharacterSchema` |
| `server/src/content/upsert.ts` | Modify — persist `portrait_urls` |
| `server/src/routes/location.ts` | Modify — select portrait by expression |
| `docs/lore/guides/prompt_library.md` | Modify — add Consumer Intent Tags |
| `docs/lore/assets/scripts/generate-prompt.mjs` | Modify — fix undefined leaks, add tags |
| `docs/lore/assets/scripts/verify-assets.mjs` | Modify — add MIME + dimension checks |
| `docs/lore/assets/workflows/asset_pipeline.md` | Modify — add atlas convention |
| `content/characters/char_alex_garcia.yaml` | Modify — add `portrait_urls` |
| `content/characters/char_miguel_jhonson.yaml` | Modify — add `portrait_urls` |
| `content/characters/char_ana_kim.yaml` | Modify — add `portrait_urls` |
| `content/characters/char_isabella_vargas.yaml` | Modify — add `portrait_urls` |
| `content/characters/char_carlos_lacan.yaml` | Modify — add `portrait_urls` |

### Tier 1
| File | Action |
|---|---|
| `client/src/scenes/location/atmosphere-effects.ts` | Create |
| `client/src/scenes/location/npc-renderer.ts` | Modify — portrait frame, glitch overlay |
| `client/src/scenes/LocationScene.ts` | Modify — atmosphere effects, HUD blocks |

### Tier 2
| File | Action |
|---|---|
| `client/src/scenes/LocationScene.ts` | Modify — `loadSpriteAtlas()`, anims registration |
| `client/src/scenes/location/npc-renderer.ts` | Modify — sprite atlas support |
| `shared/src/index.ts` | Modify — add `atlasUrl`, `expression` to `ScenePayloadSchema` |
| `server/src/routes/location.ts` | Modify — include atlas fields in payload |

### Tier 3
| File | Action |
|---|---|
| `docs/lore/guides/prompt_library.md` | Modify — finalize consumer tags |
| `docs/lore/assets/scripts/verify-assets.mjs` | Modify — finalize checks |
| `docs/lore/assets/workflows/asset_pipeline.md` | Modify — finalize atlas docs |
| `docs/lore/assets/workflows/asset-generation-checklist.md` | Create |

### Cleanup
| Path | Action |
|---|---|
| `docs/lore/assets/ui-concepts/` | Remove |
| `docs/lore/assets/style-exploration/` | Remove (if exists) |
| `docs/lore/assets/akool-test/` | Remove (if exists) |
| `docs/lore/figures/*.prompt.md` | Prune orphaned |
| `docs/lore/landmarks/**/*.prompt.md` | Prune orphaned |
| `.gitignore` | Update — block binary assets |