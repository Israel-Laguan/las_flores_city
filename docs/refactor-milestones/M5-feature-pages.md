# Milestone 5 — Rebuild remaining feature pages (CSS-based)

**Goal:** Port the rest of the admin pages from `dashboard`, one area at a time, each using CSS (global classes + CSS Modules). No inline styles.

## Pages to rebuild (all reference `dashboard/src/app/...`)
- Editor (`/editor`) + `EditorApp` style components
- Lore browser (`/lore`) + `TreePanel`, `SearchBar`, `MarkdownViewer`, `MarkdownComponents`
- Assets (`/assets`) + `BaseCard`, `BasesSection`, `CatalogView`, `GeneratorView`, `VariantCard`, `VariantForm`, `GeneratorHeader`, `PublishBaseSection`
- Coverage (`/coverage`) + `CoverageDashboard`, `CoverageDashboardUI`
- Quality (`/quality`)
- Migration (`/migration`)
- Settings (`/settings`)
- Users (`/users`)
- Maps (`/maps`, `/maps/[id]`)
- Scenes (`/scenes`, `/scenes/[id]`)
- Dialogues (`/dialogues`, `/dialogues/[id]`)
- Missions (`/missions`, `/missions/[id]`, `/missions/new`)
- Characters (`/characters`, `/characters/[id]`)
- Shops (`/shop`, `/shop/[id]`)
- Vault (`/vault`, `/vault/[id]`)
- Overlays (`/overlays`, `/overlays/[id]`)
- Stories (`/stories`, `/stories/[id]`)
- Story-beats (`/story-beats`, `/story-beats/[slug]`) + `BeatTable`, `BeatForm`, `BeatUsagesTable`, `useBeatHandlers`
- Story-arc (`/story-arc`)
- Content-linker (`/content-linker`)
- Analytics (`/analytics`) + `AnalyticsSections`
- Validation (`/validation`)
- Diff (`/diff`) + `DiffPage`

## Approach
- Most list/detail pages reuse `ContentListPage` / `ContentDetailPage` from M3 — only the `columns` config + page wrapper differ.
- Complex pages (editor, lore, assets) get their own `.module.css` + sub-component CSS Modules.
- Use `api.ts` direct fetch (no proxy).

## Notes
- This milestone is large; tackle alphabetically or by dependency. Each sub-page is independently verifiable.
- Keep `dashboard` running in parallel for diff-checking behavior.

## Verification
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- Manual smoke test of each route against Express.