# Draft Generation Findings — UI Assets

Outcome: 145/145 variants generated.

## Prompt fixes (NIM CONTENT_FILTERED)
Sensitive negative-prompt text triggered NIM's filter (HTTP 200 with `finishReason: content_filtered`).
Removed or rewrote `## Negative Prompt` blocks in:
- `isometric-map/assets/lm_teatro_nacional.prompt.md`
- `isometric-map/assets/tile_desert_sand.prompt.md`
- `phone-terminal/assets/app_misiones.prompt.md`
- `vn-interface/assets/portrait_alex.prompt.md`

## Script fixes
- `generate-nim-drafts.mjs`: draftDir now matches `.prompt.md` basename; `CONTENT_FILTERED` falls through to failed so Pollinations can retry; added response-body debug logging.
- `generate-pollinations-drafts.mjs`: same `promptBase` path fix.
- `generate-drafts.sh`: `cmd_init` builds `draft_path_abs` from `$draft_path_rel`, fixing prior `dirname`-based path loss.

## Path convention
- Prompt: `<asset>/name.prompt.md`
- Drafts: `<asset>/name.prompt/drafts/name__variant.png`

## Rate limits / behavior
- NIM client-side ~35 RPM; 2s delay between requests.
- Pollinations fallback kept at 30s delay per request.