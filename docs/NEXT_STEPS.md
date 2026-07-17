# Next Steps

> Consolidated list of open **action items** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Open **design questions** (decisions, not tasks) live in `docs/STORY_BUILDER_DESIGN.md` §6. **Future extensions** (aspirational, not planned) live in `docs/STORY_BUILDER_DESIGN.md` §4.4.
>
> Last updated: 2026-07-17

---

## Story progression

Items 1 (dialogue-tree gating) and 2 (beat-semantics doc) are **done**:
- Dialogue trees now gate by `metadata.required_story_beat`, mirroring scene gating in `location.ts:244-271`. The runtime gate is `isStoryBeatAllowed` in `server/src/routes/dialogue-helpers.ts`, and the `DialogueResolver` cache key includes a `beat:` segment so a beat change invalidates correctly.
- Authoritative beat semantics live in `docs/STORY_BUILDER_DESIGN.md` §7 (authoring model, read/write paths, the "forward-only? no" answer, last-write-wins for branching, gating contracts, server-side beats).

| # | Item | Key files |
|---|---|---|
| ~~1~~ | ~~Dialogue-tree gating by beat~~ — **shipped**; see `isStoryBeatAllowed` and `validateDialogueTreeBeatSlugs`. | `server/src/routes/dialogue-helpers.ts` |
| ~~2~~ | ~~Document beat semantics~~ — **shipped**; see `docs/STORY_BUILDER_DESIGN.md` §7. | `docs/STORY_BUILDER_DESIGN.md` §7 |

## Admin panel (low-risk, not blockers)

Items 3, 4, and 5 are **done**; item 6 is intentionally out of scope.
- **`cn` centralization** — `admin/src/lib/cn.ts` is gone; all 20 admin imports of `cn` come from `@las-flores/ui`. See `docs/UI_STYLE_SYSTEM.md`.
- **Page-level `.module.css` migration** — the `admin/src/app/login/` page was migrated to use the shared `.input` and `.btn`/`btn--primary` classes (`admin/src/app/login/page.tsx` + slimmed `login.module.css`). The pattern is now applied to at least one page; the rest is mechanical and can be picked up incrementally.
- **Optional React wrappers in `@las-flores/ui`** — `Button`, `Input`, `Card`, `Badge` are now available from `@las-flores/ui`. They are thin `React.forwardRef` wrappers that apply the global CSS classes; consumers can opt in or stick with the CSS-first contract (the wrappers' source is the same as a manual `className={cn('btn', 'btn--primary')}`).

| # | Item | Key files |
|---|---|---|
| ~~3~~ | ~~`cn` centralization~~ — **shipped**. | `ui/src/lib/cn.ts`, `ui/src/index.ts` |
| ~~4~~ | ~~Page-level `.module.css` migration~~ — **pattern shipped**; login page migrated as the first consumer. | `admin/src/app/login/` |
| ~~5~~ | ~~React wrappers in `@las-flores/ui`~~ — **shipped**; `Button`, `Input`, `Card`, `Badge` available as opt-in. | `ui/src/components/` |
| 6 | **`/users` and `/settings` stubs** — placeholder routes, explicitly out of scope for the current roadmap. | `admin/src/app/users/`, `admin/src/app/settings/` |

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` §6 — open design questions (not action items)
- `docs/STORY_BUILDER_DESIGN.md` §4.4 — future extensions (aspirational, not planned)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths

---

## Content pipeline refactor (completed)

The content authoring pipeline refactor has shipped. All eight milestones are complete
and documented in `docs/STORY_BUILDER_DESIGN.md` §4 "Shipped state":

1. ✅ Colocated lore into per-entity folders under `content/` (every character/scene/location
   is one self-contained folder).
2. ✅ Extended the plan state machine (draft → proposed → approved → staged → migrated →
   verified → failed) with verification reporting.
3. ✅ Added per-asset dev/staging/production cascade with server-side resolution via
   `AssetStageResolver`.

The shipped implementation covers: Story Builder wizard (Describe → Review → Stage →
Migrate), asset drafts generation (local files first, MinIO upload on approve),
verification cross-reference checks, and the `/asset-promotion` admin page.
