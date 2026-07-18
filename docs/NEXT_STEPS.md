# Next Steps

> Consolidated list of open **action items** across the admin panel, content intake, and story-progression areas. When an item is done, remove it here and update the relevant long-term reference doc.
>
> Open **design questions** (decisions, not tasks) live in `docs/STORY_BUILDER_DESIGN.md` §6. **Future extensions** (aspirational, not planned) live in `docs/STORY_BUILDER_DESIGN.md` §4.4.
>
> Last updated: 2026-07-17

---

## Completed

The following items have shipped and are documented in their respective reference files:

### Story progression
- **Dialogue-tree gating by beat** — scenes gate via `metadata.required_story_beat` in `location.ts:244-271`; dialogues mirror this pattern via `isStoryBeatAllowed` in `dialogue-helpers.ts`. See `docs/STORY_BUILDER_DESIGN.md` §7 for authoritative semantics.

### Admin panel
- **`cn` centralization** — thin `cn` helper removed; all admin imports use `@las-flores/ui`. See `docs/UI_STYLE_SYSTEM.md`.
- **Page-level `.module.css` migration** — login page uses shared `.input` and `.btn` classes. Pattern can be applied to other pages incrementally.
- **React wrappers in `@las-flores/ui`** — `Button`, `Input`, `Card`, `Badge` are opt-in thin wrappers around global CSS classes.

### Content pipeline refactor (M01-M08)
All eight milestones shipped and documented in `docs/STORY_BUILDER_DESIGN.md` §4 "Shipped state":
1. Colocated lore into per-entity folders under `content/` (self-contained character/scene/location folders)
2. Extended plan state machine (draft → proposed → approved → staged → migrated → verified → failed) with verification reporting
3. Added per-asset dev/staging/production cascade with server-side resolution via `AssetStageResolver`

---

## Pending Work

### Admin panel — Out of scope for current roadmap

- `/users` and `/settings` stubs remain as placeholder routes. These are intentionally
  deferred to a future milestone focused on user management features.

---

## Related docs

- `docs/STORY_BUILDER_DESIGN.md` — shipped implementation, open questions (§6), future extensions (§4.4)
- `docs/ADMIN_ARCHITECTURE.md` — admin panel structure and conventions
- `docs/DATA_INTAKE.md` — content intake paths
