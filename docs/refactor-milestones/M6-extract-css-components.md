# Milestone 6 — Extract reusable CSS component classes + global stylesheet

**Goal:** Now that many pages exist (M3–M5), reduce duplication by promoting repeated class patterns into shared component classes in the global stylesheet. Page-level CSS Modules then *compose* with these instead of redefining everything.

## Steps
1. `admin/src/styles/components.css`: define reusable classes (mirroring what `dashboard`'s `adminStyles.ts` provided, but as real CSS):
   - `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--danger`, `.btn--disabled`
   - `.input`, `.textarea`, `.select`
   - `.card`, `.card__header`, `.card__title`, `.card__meta`
   - `.table`, `.table__th`, `.table__td`
   - `.badge`, `.badge--info`, `.badge--success`, `.badge--danger`, `.badge--warning`
   - `.section`, `.section__heading`
   - `.error-box`, `.success-box`, `.warning-box`
   - `.muted`, `.subsection`
2. Import `components.css` after `global.css` in `layout.tsx`.
3. Refactor page-level `.module.css` files to drop duplicated declarations and apply the shared classes via `cn(styles.local, 'btn', 'btn--primary')`.
4. Delete now-redundant local style entries across `admin/src`.

## Notes
- This is the "component-ize the CSS" pass — purely mechanical once M5 is done.
- Keeps markup clean: shared look from global classes, page-specific layout from Modules.

## Verification
- `npm run build --workspace=admin`
- Visual diff vs `dashboard` to confirm no regressions in appearance.