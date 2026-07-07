# Continue Asset Generation — Next Chat Prompt

## Context
This branch explored prompt-driven UI asset generation for Las Flores 2077. We generated **145/145 draft variants** across `isometric-map`, `phone-terminal`, and `vn-interface` using text-to-image for every variant.

We discovered an important workflow mistake: **variants should be generated from a chosen base image via image-to-image**, not as independent text-to-image generations. This ensures visual consistency across variants (night, rain, alt-color, etc.).

## Goal for Next Chat
Build an **admin-side asset pipeline** where:
1. **Multiple base proposals** are generated per asset from the same seed-range or prompt family
2. **User selects the best base** via a review interface
3. **Variants are generated via image-to-image** using the selected base as input
4. All outputs are stored and tracked, ready for Step 3 client integration

## What to Preserve
- `docs/lore/assets/ui-concepts/UI_ASSET_INVENTORY.md` — full inventory, client integration map, NIM settings
- `docs/lore/assets/scripts/DRAFT_GENERATION_FINDINGS.md` — what worked, what failed, rate limits, path conventions
- `docs/lore/assets/scripts/generate-drafts.sh` and mjs helpers — NIM/Pollinations wrappers
- All generated draft PNGs under `docs/lore/assets/ui-concepts/*/assets/*.prompt/drafts/`
- All `.prompt.md` files with cleaned negative prompts

## What Was Missing
- No image-to-image path: every variant was generated text-to-text via NIM/Pollinations
- No admin review UI to choose a base before variant generation
- No branching: all variants are orphans instead of children of a selected base

## Proposed Next Architecture
- Admin endpoint or UI page: `admin/src/app/assets/page.tsx`
- Backend route: `server/src/routes/assets.ts` with:
  - `POST /assets/generate-bases` — generates N base proposals for a prompt
  - `POST /assets/generate-variants` — image-to-image using chosen base + variant prompt
  - `GET /assets/list` — lists assets by prompt with base selection
  - `POST /assets/approve-base` — marks a base as canonical for variant generation
- State schema additions:
  - `asset_bases` table: `id, prompt_rel, proposal_index, image_path, seed, chosen`
  - `asset_variants` table: `id, base_id, variant_name, image_path, i2i_strength`
- Client workflow:
  - Render grid of base proposals for a prompt
  - Click to select base, then render variant list with sliders for i2i strength
  - Save approved assets to MinIO paths documented in `UI_ASSET_INVENTORY.md`

## Suggested First Step in Next Chat
Pick ONE prompt file, e.g. `phone-terminal/assets/app_misiones.prompt.md`, and implement:
1. Admin UI to generate 4 base proposals via NIM
2. Image-to-image variant generation from the selected base using Pollinations or NIM `image` input
3. MinIO upload with the existing path conventions

Then generalize.

## Commands to Resume
```bash
# Verify current state
bash docs/lore/assets/scripts/generate-drafts.sh status

# Review findings
cat docs/lore/assets/scripts/DRAFT_GENERATION_FINDINGS.md
cat docs/lore/assets/ui-concepts/UI_ASSET_INVENTORY.md
```

## Commit Message from This Branch
```text
feat(ui-assets): generate 145/145 draft variants via NIM + Pollinations