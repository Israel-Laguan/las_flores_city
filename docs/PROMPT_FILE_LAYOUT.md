# Prompt File Layout

Conventions for where `.prompt.md` files live and how they are named across
`content/`, per the per-folder entity layout (see AGENTS.md).

> **Note:** This project does not use MidJourney. Aspect ratio is recorded in
> frontmatter (`aspect_ratio:`) only — never hard-coded into prompt prose or
> emitted as a `--ar` flag in body metadata.

## Primary prompt file

Every entity folder has one primary asset prompt file:

```text
content/<type>/<slug>/<slug>.prompt.md
```

Example: `content/characters/carlos_lopez/carlos_lopez.prompt.md`

This is the file that `content-audit.mjs` expects and that drives the primary
asset (portrait for characters, background for scenes/locations, etc.). It
carries YAML frontmatter as the single source of truth for metadata:

```yaml
---
name: <Display Name>
type: <portrait | background | ...>
size: WxH
source: content/<type>/<slug>/<slug>.md
target: description of the YAML field
consumer: <portrait | html-background | ...>
---
```

## Secondary / typed prompt files (dot-separated)

When an entity needs more than one asset family (e.g. a character also needs
biometric sheets and a character sheet; a location needs a map), secondary
prompt files are named `<slug>.<type>.prompt.md`:

```text
content/characters/diego_huaman/diego_huaman.biometric.prompt.md
content/characters/diego_huaman/diego_huaman.character-sheet.prompt.md
```

Rules:

- The **dot** separator (`<slug>.<type>.prompt.md`) is canonical. The older
  underscore form (`<slug>_<type>.prompt.md`) is legacy; new files must use the
  dot form.
- `assets/` is reserved for **images only** — never place `.prompt.md` files
  (or any non-image) inside `assets/`.
- `content-audit.mjs` treats *any* `*.prompt.md` in the entity folder as
  satisfying the "expects a prompt file" requirement, so typed variants count.

## Metadata location

All machine-readable metadata lives in the frontmatter block. The body must
**not** restate `[CONSUMER:]`, `**Type:**`, `**Source:**`, `**Target field:**`,
or `**Dimensions:**` (those are duplicate of frontmatter). Human-reference
lines (`**Tool:**`, `**Pipeline stage:**`) may remain in the body.

The authoring loop: generate drafts into `assets/` → pick the best as
`<slug>__default.png` → `AssetPublishService` uploads to MinIO and writes
`portrait_urls[]` / `background_urls[]` back to YAML. See
`docs/ASSET_EXPRESSION_VOCABULARY.md` for expression-tagged variants.

## Cleanup tool

`scripts/asset-pipeline/scripts/normalize-prompt-frontmatter.mjs` removes the
legacy body metadata block and enforces frontmatter-only metadata
(dry-run by default, `--apply` to write).
