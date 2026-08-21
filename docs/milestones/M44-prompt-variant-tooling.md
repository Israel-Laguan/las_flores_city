# M44 — Prompt-Variant Tooling Reconciliation

> **Status:** Shipped · **Owner:** story-engine effort
> **Source record:** the prompt-variant tooling audit formerly documented by M37

## Goal

Remove prompt-generation drift and retire tooling that still emits or expects the superseded
two-stage image-to-image variant format.

## Scope

- Make `generate-prompt.mjs` emit the canonical `## Variations` and `## Expression Variants`
  structures.
- Retire dead two-stage variant scripts and update the runbook.
- Align prompt-length and variant validation with the canonical asset expression vocabulary.
- Verify existing scene prompt files are either intentionally historical or migrated to the
  canonical shape.

## Acceptance Criteria

- [x] Newly generated prompts use the canonical variation structure.
- [x] Dead variant scripts are removed or explicitly proven necessary.
- [x] The runbook and linter no longer require `**Edit prompt:**` or `portrait_base_url`.
- [x] Content validation and prompt checks pass with no unintended format drift.

## Verification

```bash
node scripts/asset-pipeline/scripts/check-prompt-lengths.mjs
npm run validate:content
```

Follow-up (not part of the shipped scope): focused tests for generator output
and validator behavior remain open.

## Relationship to Existing Records

M44 is the focused implementation milestone and does not own image generation or publication,
which remain covered by M40/M42.
