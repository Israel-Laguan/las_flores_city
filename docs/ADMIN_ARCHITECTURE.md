# Admin Architecture

> Permanent reference for the `admin` Next.js workspace: how the app is architected, how it talks to the Express server, and the conventions every page follows.
>
> Replaces the stale `docs/ADMIN_PANEL.md` (which still described the old `dashboard` workspace and a removed API proxy). The new doc reflects the current state after the multi-stage admin refactor.

## Overview

`admin/` is the content-management and operations panel for Las Flores 2077. It is a Next.js 16 (App Router) app that talks to the Express server (`server/`) for **all** data and auth.

What it does:
- **Browse & inspect** the content already migrated into Postgres (characters, dialogues, scenes, mysteries, etc.).
- **Run** validation, migration, content-quality, and analytics pipelines against the server.
- **Edit** select records (story beats, content linkages, YAML files).
- **Generate** art assets via the AKOOL pipeline and inspect lore-to-content coverage.

What it is **not**:
- It is **not** the primary content authoring tool — most game data lives as YAML under `content/` and is authored there, then migrated.
- It is **not** the player-facing UI — that is `client/` (Phaser). It runs on a different port and a different origin from the game.
- It is **not** an API proxy — pages call the Express server **directly**. The only Next.js route handlers are the two auth routes that need to set a cookie on the admin origin.

## Tech profile

| Aspect | Value |
|---|---|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19 |
| Bundler | Turbopack (`next dev --turbopack`) |
| Language | TypeScript (`strict: true`, `jsx: preserve`) |
| Styling | CSS Modules + shared `@las-flores/ui` classes (see [docs/UI_STYLE_SYSTEM.md](UI_STYLE_SYSTEM.md)) |
| Tests | Vitest + Testing Library + jsdom (7 files, 76 tests) |
| Lint | ESLint 8 (custom config in `admin/.eslintrc.json`) |
| Port | 3002 on the host (via `docker-compose.yml` or `start-stack.sh`), 3000 inside the container |

## Workspace contract

| File | Holds |
|---|---|
| `admin/package.json` | Scripts (`dev`, `build`, `start`, `lint`, `test`) + Next 16 / React 19 deps |
| `admin/tsconfig.json` | TS strict config; `paths` maps `@/*` → `./src/*`, `@las-flores/shared` → `../shared/src`, `@las-flores/ui` → `../ui/src` |
| `admin/next.config.ts` | `reactStrictMode: true`; `transpilePackages: ['@las-flores/shared', '@las-flores/ui']`; `rewrites()` to forward `/assets/:path*` to the Express container |
| `admin/vitest.config.ts` | Vitest + `@vitejs/plugin-react`; jsdom env; `setupFiles: ['./src/test/setup.ts']`; aliases for `@` and `@las-flores/shared` |
| `admin/Dockerfile` | `node:20-alpine`; copies all workspaces; builds `shared` + `admin`; runs `npm run dev --workspace=admin` |
| `admin/start.sh` | Resolves `*_FILE` env vars (Docker secrets) into real env vars, then execs the CMD |

Required env:
- `NEXT_PUBLIC_SERVER_URL` — base URL of the Express server. Default: `http://localhost:3000`. Used by both the `adminFetch` helpers.

## Top-level layout

```text
admin/
├── Dockerfile
├── start.sh
├── next.config.ts
├── next-env.d.ts
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── app/                  # App Router: layout, pages, route handlers
    │   ├── layout.tsx        # async server component, calls getAdminUser()
    │   ├── page.tsx          # / (home / dashboard)
    │   ├── globals.css       # (deprecated; styling now comes from @las-flores/ui)
    │   ├── home.module.css
    │   ├── api/              # only the 2 auth route handlers live here
    │   │   └── auth/
    │   │       ├── admin-login/route.ts
    │   │       └── logout/route.ts
    │   ├── <area>/           # one folder per top-level route
    │   │   ├── page.tsx
    │   │   ├── [id]/page.tsx         (where applicable)
    │   │   ├── new/page.tsx          (where applicable)
    │   │   ├── components/           (where applicable)
    │   │   ├── hooks/                (where applicable)
    │   │   ├── __tests__/            (where applicable)
    │   │   └── *.module.css
    │   └── __tests__/         # cross-page tests
    ├── components/           # shared primitives
    │   ├── AdminNav.tsx
    │   ├── ContentListPage.tsx
    │   ├── ContentDetailPage.tsx
    │   ├── Badge.tsx
    │   └── ui/PageHeader.tsx
    ├── lib/                  # cross-cutting helpers
    │   ├── api.ts            # server-side adminFetch
    │   ├── client-api.ts     # client-side adminFetch + serverAssetUrl
    │   └── (cn removed — now imported from @las-flores/ui)
    ├── middleware.ts         # auth guard
    └── test/
        └── setup.ts          # @testing-library/jest-dom
```

## App Router — page inventory

| Route | Archetype | Notes |
|---|---|---|
| `/login` | Auth | Client form → `POST /api/auth/admin-login` → cookie → redirect to `/` |
| `/` | Dashboard | Quick stats + recent activity; groups navigation links |
| `/dialogues` | List (Type A) | `ContentListPage` with custom columns |
| `/scenes` | List (Type A) | `ContentListPage` |
| `/characters` | List (Type A) | `ContentListPage` + `Badge` for portrait status |
| `/story-beats` | CRUD (Type B) | `useBeatHandlers` + `BeatForm` + `BeatTable` + `BeatUsagesTable` |
| `/story-arc` | Visualization | Beat timeline + reachability |
| `/missions` + `/[id]` + `/new` | CRUD (Type B) | `useMissionWizard` for new-mission flow |
| `/stories` + `/[id]` | List/Detail (Type A) | |
| `/overlays` + `/[id]` | List/Detail (Type A) | |
| `/locations` + `/[id]` | List/Detail (Type A) | |
| `/vault` + `/[id]` | List/Detail (Type A) | |
| `/gigs` + `/[id]` | List/Detail (Type A) | |
| `/shop` + `/[id]` | List/Detail (Type A) | |
| `/maps` + `/[id]` | List/Detail (Type A) | |
| `/mysteries` + `/[id]` | List/Detail (Type A) | |
| `/lore` | Browse (Type C-lite) | `useLoreTree` + `useLoreContent` + `TreePanel` + `MarkdownViewer` |
| `/editor` | Editor (Type B) | `useEditor` + `FileTree` + `EditorPanel` |
| `/content-linker` | Tool (Type B) | `useContentLinker` + `ScalarLink` + `ArrayLink` |
| `/migration` | Op (Type B) | `MigrationStatusView` + `MigrationResultView` |
| `/validation` | Op (Type B) | `ValidationSummary` + `ErrorsByFile` + `WarningsByFile` |
| `/quality` | Op (Type B) | `QualitySummaryCards` + `IssueList` |
| `/analytics` | Op (Type B) | Inline `AnalyticsSections` |
| `/assets` | Pipeline (Type B) | 8 sub-components: `BaseCard`, `BasesSection`, `CatalogView`, `GeneratorView`, `VariantCard`, `VariantForm`, `GeneratorHeader`, `PublishBaseSection` |
| `/asset-coverage` | Report (Type B) | `AssetTable` + `SummaryCards` |
| `/users` | Stub | Placeholder |
| `/settings` | Stub | Placeholder |
| `/diff` | Op | YAML-checksum diff viewer |
| `/story-builder` + `/plans` | Wizard (Type C) | 5-step orchestrator; see deep-dive below |


## Authentication

Three pieces:

1. **`src/middleware.ts`** — edge auth guard. The matcher skips `_next/static`, `_next/image`, and `favicon.ico`. For any other path that is not in the `publicRoutes` list (`/login` only), it checks for the `jwt_session` cookie. If absent, it redirects to `/login?from=<original-path>`.

2. **`src/app/api/auth/admin-login/route.ts`** — the only `POST` that sets the cookie. Accepts FormData (so the `useState` login form can submit naturally), forwards to Express `POST /auth/admin-login`, copies the `Set-Cookie` header from Express into a `303 See Other` response that points at `/`.

3. **`src/app/api/auth/logout/route.ts`** — clears the local `jwt_session`, forwards `Cookie` to Express `POST /auth/logout`, mirrors any `Set-Cookie` back to the browser, and redirects to `/login`.

```text
┌──────────┐     POST FormData       ┌─────────────────────────────┐
│ /login   │ ───────────────────────▶│ app/api/auth/admin-login    │
│ (client) │                         │ (Next route handler)         │
└──────────┘                         │   fetch + Set-Cookie relay  │
                                     └──────────────┬──────────────┘
                                                    │ POST
                                                    ▼
                                     ┌──────────────────────────────┐
                                     │ Express /auth/admin-login    │
                                     │   sets jwt_session cookie    │
                                     └──────────────────────────────┘
                                                    ▲
                                                    │ Set-Cookie (relayed)
                                                    │
                                     ┌──────────────┴──────────────┐
                                     │ 303 → /  (browser stores    │
                                     │ jwt_session on admin origin)│
                                     └─────────────────────────────┘
```

The cookie is `SameSite=None; Secure` so the admin app (different origin from the game) can read it back on subsequent requests.

**`getAdminUser()`** in `src/lib/api.ts` is a server-side helper called by `app/layout.tsx` (async server component). It reads `cookies()` and calls Express `GET /auth/admin-me`, returning `null` on any failure. The result is passed to `<AdminNav user={...}/>`.

## Data fetching — the two `adminFetch` flavors

There are **two** `adminFetch` exports with deliberately different semantics:

| File | Marker | When to use | How it sends auth |
|---|---|---|---|
| `src/lib/api.ts` | no `'use client'` (server-only) | Server components, `layout.tsx`, anywhere `await fetch(...)` happens in a server context | Reads `cookies()` and explicitly sets the `Cookie: jwt_session=...` request header |
| `src/lib/client-api.ts` | `'use client'` at the top | Every `'use client'` page, every client hook | Uses `credentials: 'include'`; the browser attaches the cookie automatically because it was set on the admin origin |

Both share the same shape:

```ts
adminFetch<T>(url: string, options?: RequestInit): Promise<T>
```

- `url` is **relative to the server** — e.g. `/admin/characters` (no host).
- The function prepends `SERVER_URL` internally.
- It defaults `Content-Type: application/json` for non-FormData bodies.
- It throws an `Error` with a `status` field on non-2xx; the error message is `API request failed: <status>`.
- It returns `response.json()` directly — call sites either type-annotate `<T>` or branch on `data.success`.

`client-api.ts` also exports `serverAssetUrl(path: string)` which builds a signed asset URL: `${SERVER_URL}/admin/asset?path=${encodeURIComponent(path)}`.

### No API proxy

There are **zero** `/api/admin/*` route handlers. Pages and hooks do not call any Next.js route to reach Express; they call Express directly. The only `app/api/` route handlers are the two auth routes that need to relay `Set-Cookie` to the browser on the admin origin. This replaced the old `dashboard` workspace's ~30 proxy routes.


## Shared components

| Component | File | Purpose |
|---|---|---|
| `AdminNav` | `src/components/AdminNav.tsx` | Top bar (logo, user area, logout/login button) + a nav-links row grouped by Content / Tools / System. Stateless; receives `user` from the layout server component. Uses the shared `.btn--danger` and `.badge--success` classes. |
| `ContentListPage<T>` | `src/components/ContentListPage.tsx` | Generic paginated table primitive. Props: `title`, `heading`, `endpoint`, `detailPath`, `columns: Column<T>[]`. Owns its own `useState` + `useEffect` + `AbortController` so callers don't have to. Renders a `.table` with clickable rows that route to `${detailPath}/${id}`. **This is the building block for most "Type A" list pages** — see below. |
| `ContentDetailPage` | `src/components/ContentDetailPage.tsx` | Generic detail view that reads `params.id`, fetches `/admin/{area}/{id}`, and renders the JSON. Most areas opt for a hand-rolled detail page instead (e.g. `characters/[id]/page.tsx`) so they can show typed fields. |
| `Badge` | `src/components/Badge.tsx` | `<span className={cn(styles.badge, styles[variant])}>` for the 5 variants (`success` / `warning` / `danger` / `info` / `muted`). Used by `ContentListPage` columns and by detail pages. |
| `PageHeader` | `src/components/ui/PageHeader.tsx` | Tiny `<header><h1>…</h1>{description && <p>…</p>}</header>`. Optional helper; not used by every page. |

## Page archetypes

The 28 pages above are all instances of three archetypes. Knowing the archetype is the fastest way to predict what a new page in that area should look like.

### Type A — list via `ContentListPage`

The simplest pattern. The page file is **~25 lines** of column definitions plus a JSX call to the primitive. Example (`characters/page.tsx`):

```tsx
'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', render: (item) => item.description?.slice(0, 80) },
  {
    key: 'portraitStatus', label: 'Portrait Status',
    render: (item) => item.portraitStatus === 'ready'
      ? <Badge variant="success">ready</Badge>
      : <Badge variant="warning">missing</Badge>,
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function CharactersPage() {
  return (
    <ContentListPage
      title="Characters"
      heading="Character Browser"
      endpoint="/admin/characters"
      detailPath="/characters"
      columns={columns}
    />
  );
}
```

The primitive handles:
- `useState` for items, loading, error, page, pageSize, total.
- A `useCallback` fetch that aborts the previous in-flight request when the page changes (`AbortController`).
- Routing via `useRouter().push()` on row click.
- Pagination UI.

Used by: `dialogues`, `scenes`, `characters`, `stories`, `overlays`, `locations`, `vault`, `gigs`, `shop`, `maps`, `mysteries`.


### Type B — list via custom hook + custom components

For pages that need server-side actions (POST/PUT/DELETE), filters, edit state, or rendering beyond a table. The page is a thin shell that calls a `useXxxHandlers` hook and forwards state to dumb sub-components. Example (`story-beats/page.tsx`):

```tsx
'use client';

import { useState } from 'react';
import BeatForm from './components/BeatForm';
import BeatTable from './components/BeatTable';
import { useBeatHandlers } from './hooks/useBeatHandlers';

export default function StoryBeatsPage() {
  const h = useBeatHandlers();
  // local form state...
  return (
    <main className={styles.main}>
      <h1>Beat Registry</h1>
      <BeatForm ... submitting={h.submitting} onSubmit={handleAddSubmit} />
      {h.error && <div className={styles.errorBox}>...</div>}
      <BeatTable beats={h.beats} loading={h.loading} ... onDelete={h.handleDelete} />
    </main>
  );
}
```

The hook owns: `useState` for the list, edit state, submitting flag, error, and exposes `handleAddSubmit`, `handleEditStart`, `handleEditSave`, `handleDelete`. It calls Express via `adminFetch` and refetches on success.

Used by: `story-beats`, `missions`, `missions/new`, `editor`, `content-linker`, `migration`, `validation`, `quality`, `analytics`, `asset-coverage`, `assets`, `users` (stub), `settings` (stub).

### Type C — multi-step orchestrator

For pages that have a stateful, multi-step interaction. The story-builder is the only full example; the lore browser is a smaller read-only variant.

## Story Builder deep-dive (`/story-builder`)

The 5-step wizard: **Describe → Review → Stage → Migrate → Results**. This is the only Type C page and the most complex one in the app.

```text
app/story-builder/
├── page.tsx                          # thin wrapper: <Suspense> + reads ?planId
├── StoryBuilder.tsx                  # orchestrator: switch on step, render active step
├── StoryBuilder.module.css
├── types.ts                          # local types (Step, etc.)
├── components/                       # dumb step components
│   ├── StepIndicator.tsx             # progress dots
│   ├── DescribeStep.tsx              # step 1: text input + template picker
│   ├── ReviewStep.tsx                # step 2: plan editor (items, links, asset paths)
│   ├── StageStep.tsx                 # step 3: dry-run preview + stage to server
│   ├── MigrateStep.tsx               # step 4: apply migration
│   ├── ResultsStep.tsx               # step 5: final report
│   ├── ContentCard.tsx               # reusable card used in step 2
│   ├── PlanSummary.tsx               # step 2 sidebar
│   ├── LoreViewer.tsx                # step 2 lore cross-reference
│   ├── JsonViewer.tsx, PreviewItem.tsx, LinksSection.tsx, RefineSection.tsx
│   └── FieldDefinitions.ts           # pure data (form-field metadata for steps)
├── hooks/
│   ├── useStoryBuilder.ts            # state + state transitions (no fetch)
│   ├── useStoryPlanApi.ts            # API callbacks wired to setState
│   ├── useStoryBuilderApi.ts         # lower-level: loadPlanFromDb, fetchTemplates
│   └── useStoryBuilderMutations.ts   # pure plan transforms (updateItemField, addLink, …)
├── plans/
│   └── page.tsx                      # /story-builder/plans — list of saved plans
└── __tests__/
    ├── ContentCard.test.tsx
    ├── FieldDefinitions.test.ts
    └── PlanSummary.test.tsx
```


**State ownership**: `useStoryBuilder` owns the 10 `useState` slots (`step`, `description`, `plan`, `loading`, `error`, `planId`, `refineFeedback`, `showRefine`, `stagingResult`, `migrationResult`, `previewData`, `templates`). It composes three sibling hooks:
- `useStoryPlanApi` — wraps the 6 API actions (generate / refine / preview / stage / migrate / retry) with the state setters.
- `useStoryBuilderApi` — load a saved plan by id, fetch templates.
- `useStoryBuilderMutations` — pure functional transforms on the `ContentPlan` (e.g. `updateItemField`, `addLink`, `removeItem`).

`useStoryBuilder` returns a flat bag of state + handlers that `StoryBuilder.tsx` just spreads into the step components.

**Keyboard shortcut**: Ctrl/Cmd+Enter on step 1 triggers plan generation when the description is non-empty and not loading.

**URL routing**: `/story-builder?planId=<uuid>` loads an existing plan and jumps to step 2. `/story-builder/plans` lists saved plans.

## Lore Browser deep-dive (`/lore`)

A smaller Type C-lite read-only page that demonstrates the URL-as-state pattern:

```text
app/lore/
├── page.tsx                # uses ?path=... in the URL
├── lore.module.css
├── components/
│   ├── TreePanel.tsx       # left pane: file tree grouped by type
│   ├── SearchBar.tsx       # filter the tree
│   ├── MarkdownViewer.tsx  # right pane: renders markdown + cross-links
│   └── MarkdownComponents.tsx  # custom remark components for the viewer
└── hooks/
    ├── useLoreTree.ts      # fetches /admin/lore/tree, groups by type
    └── useLoreContent.ts   # fetches /admin/lore/file?path=... for the selected path
```

The selected file is **not** in component state — it is the `?path=...` query param. This makes the view bookmarkable and reload-safe.

## Styling contract

The admin app uses **CSS Modules** for layout + **shared classes from `@las-flores/ui`** for look. The composition pattern:

```tsx
<button className={cn(styles.submit, 'btn', 'btn--primary')}>Save</button>
```

Page-level `.module.css` files contain only the layout / positioning. The look-and-feel (`.btn`, `.card`, `.table`, `.badge--success`, `.error-box`, …) comes from `ui/src/styles/components.css`.

For the full contract — the shared class vocabulary, the theme-variable namespace gotcha (admin `--accent`/`--background` vs client `--color-*`), and verification commands — see **[docs/UI_STYLE_SYSTEM.md](UI_STYLE_SYSTEM.md)**. Do not "unify" the two theme namespaces in a single PR; they coexist deliberately.


## Testing

Vitest + jsdom + Testing Library. Run with `npm run test --workspace=admin` (7 files, 76 tests at handoff).

| File | What it tests |
|---|---|
| `src/app/__tests__/badgeRendering.test.tsx` | `<Badge>` renders the right variant class. Uses `fast-check` for property-based invariants: across 100 random arrays of `name` + `beatAssociation`, the badge `<span>` always gets the right variant class. |
| `src/app/__tests__/contentListViews.test.tsx` | `ContentListPage` end-to-end with mocked `adminFetch`: loading, error, empty, populated. |
| `src/app/story-builder/__tests__/ContentCard.test.tsx` | `<ContentCard>` renders all expected fields and slots. |
| `src/app/story-builder/__tests__/PlanSummary.test.tsx` | `<PlanSummary>` summary counts. |
| `src/app/story-builder/__tests__/FieldDefinitions.test.ts` | Pure data sanity: every field def has a key, label, and type. |
| `src/app/story-beats/__tests__/storyBeatsPage.test.tsx` | `<StoryBeatsPage>` end-to-end with mocked `adminFetch`: add / edit / delete flows. |
| `src/app/story-beats/__tests__/beatDetailPage.test.tsx` | The detail view of a single beat. |

The setup file is one line: `import '@testing-library/jest-dom';`. There is no global mock layer; tests that need to mock `adminFetch` use `vi.mock('@/lib/client-api', ...)`.

The Vitest config (`admin/vitest.config.ts`) resolves `@` and `@las-flores/shared` aliases so tests can import with the same paths as the source.

## Docker / runtime

```text
admin/
├── Dockerfile
└── start.sh
```

`Dockerfile` (`FROM node:20-alpine`):
- Copies every workspace's `package*.json` first for layer caching.
- Runs `npm ci` once at the workspace root.
- Copies the rest of the source (`client/`, `admin/`, `server/`, `shared/`, `tsconfig.json`, `.eslintrc.json`).
- Builds `shared` then `admin` (`npm run build --workspace=shared && npm run build --workspace=admin`).
- Exposes 3000.
- `CMD ["npm", "run", "dev", "--workspace=admin"]` — Turbopack dev server in the container.

`start.sh`:
- `resolve_file_env <FILE_VAR> <REAL_VAR>` — if `<REAL_VAR>` is empty and `<FILE_VAR>` points to an existing file, read it and export the contents. This is the Docker-secrets pattern (`POSTGRES_PASSWORD_FILE` → `POSTGRES_PASSWORD`).
- If `DATABASE_URL` contains a `${POSTGRES_PASSWORD}` placeholder, substitute it from the loaded env.
- `exec "$@"` — hand off to the CMD.

`next.config.ts` `rewrites()` forwards `/assets/:path*` to `http://las-flores-server:3000/assets/:path*` so static asset paths in the admin UI can use a relative URL.

**Health-check gotcha** (also in `AGENTS.md`): the `node:20-alpine` image does **not** include `curl`. From the host, `curl http://localhost:3000/health` may return exit 56 (failure to receive data) due to stale docker-proxy state on shared hosts even when the server is healthy. Authoritative check from **inside** the container:

```bash
docker exec las-flores-server wget -qO- http://localhost:3000/health
```

A `{"success":true,...}` response from that command is the source of truth.


## Conventions

When contributing to `admin/`, follow these rules. They are the result of the multi-stage admin refactor and the shared `@las-flores/ui` package cleanup.

1. **Page markers**: every interactive page declares `'use client'` at the top. The only server components are `app/layout.tsx` and a few pure-render pages (rare).
2. **No API proxy**: pages and hooks call Express directly via `adminFetch`. New API proxy routes under `app/api/admin/*` are **not** added.
3. **No inline `style={{...}}` for layout**: use page-level `.module.css` for positioning and shared classes for look. The `Suspense` fallback in `story-builder/page.tsx` is the only acceptable exception (and it's a one-liner placeholder).
4. **Compose shared classes via `cn()`**:
   ```tsx
   import { cn } from '@las-flores/ui';
   <button className={cn(styles.submit, 'btn', 'btn--primary')}>Save</button>
   ```
5. **Server components use `lib/api.ts`**, **client components use `lib/client-api.ts`**. Never import `cookies()` from a client module.
6. **Abort in-flight requests** when the page changes (see `ContentListPage` for the pattern).
7. **Detail pages read `useParams().id as string`** — type-assert because Next's param types are `string | string[]` in older versions and `string` in Next 16.
8. **Type the API response** at the call site:
   ```ts
   const data = await adminFetch<{ success: boolean; data?: StoryBeat[]; error?: string }>('/admin/story-beats');
   if (data.success) { ... } else { setError(data.error); }
   ```
9. **Local form state** in the page when the hook needs to defer the mutation (e.g. `story-beats` keeps `formSlug`/`formLabel`/etc. locally and passes them to the hook on submit).
10. **Add the nav link** in two places when adding a new area: `src/components/AdminNav.tsx` `NavLinksRow`, and `src/app/page.tsx` `sections` array.
11. **Tests** for the new page live in `app/<area>/__tests__/`. Follow the `ContentListPage` or `storyBeatsPage` patterns for the boilerplate.

## Adding a new CRUD page (recipe)

1. Pick the archetype (Type A, B, or C) by analogy with the closest existing page.
2. Create the folder: `admin/src/app/<area>/`.
3. For Type A, write `page.tsx` with a `columns` array and call `<ContentListPage />`. Done.
4. For Type B:
   - `page.tsx` — thin shell that calls `useXxxHandlers()` and forwards state to sub-components.
   - `hooks/useXxxHandlers.ts` — owns all `useState` and `adminFetch` calls. Returns a flat bag of state + handlers.
   - `components/<X>.tsx` + `<X>.module.css` — one or more dumb sub-components, each with its own `.module.css`.
   - `__tests__/<area>.test.tsx` — `vi.mock('@/lib/client-api', ...)`, `render`, `waitFor`, assert on visible text.
5. For Type C, model it on `story-builder/` (state-owning hook + orchestrator + dumb step components).
6. Wire navigation: add a `<Link>` in `AdminNav.tsx` `NavLinksRow` and a `{ href, label }` in `app/page.tsx` `sections` array.
7. If the new page needs a server endpoint, add it under `server/src/routes/admin/<area>.ts`. (Out of scope for this doc; see `server/` and `AGENTS.md` for backend conventions.)
8. Verify:
   ```bash
   npm run lint --workspace=admin
   npm run test --workspace=admin
   npm run build --workspace=admin
   ```

## Open follow-ups

These are tracked in `docs/UI_STYLE_SYSTEM.md`; they are not blockers:

1. **Page-level `.module.css` migration** — not every page module composes the shared classes yet. The pattern is established; the rest is mechanical.
2. **Optional React wrappers** — `Button` / `Input` / `Card` / `Badge` are now available in `@las-flores/ui` as opt-in conveniences. Adoption across admin pages is a follow-up — pages that compose classes directly with `cn()` keep working unchanged.

The only known "real" gap is that **`/users` and `/settings` are stubs** (placeholders, not implemented). They are not on the active roadmap.

### Dependency note

`next@16.2.10` depends on `postcss@8.4.31` (< 8.5.10), which has a moderate XSS vuln (GHSA-qx2v-qp2m-jg93). This is waiting on a stable Next.js 16.3.x release — no action needed on our side. See `docs/DEPENDENCIES.md` for the full dependency policy.


## Verification commands

Run from the repo root after any admin change:

```bash
# Lint
npm run lint --workspace=admin

# Tests
npm run test --workspace=admin          # 7 files, 76 tests at handoff

# Build
npm run build --workspace=admin         # Next build; surfaces route / TS errors
```

All three must exit `0` before merging.

## File map (quick reference)

| Path | Holds |
|---|---|
| `admin/src/middleware.ts` | Cookie-based auth guard |
| `admin/src/app/layout.tsx` | Async server component; renders `<AdminNav>` + children |
| `admin/src/app/page.tsx` | Home: quick stats + recent activity + nav grid |
| `admin/src/app/login/page.tsx` | Client login form; POSTs to `/api/auth/admin-login` |
| `admin/src/app/api/auth/admin-login/route.ts` | Login route handler: relays `Set-Cookie` from Express |
| `admin/src/app/api/auth/logout/route.ts` | Logout route handler: clears cookie + relays to Express |
| `admin/src/components/AdminNav.tsx` | Top bar + nav-links row (Content / Tools / System) |
| `admin/src/components/ContentListPage.tsx` | Generic paginated table primitive (Type A) |
| `admin/src/components/ContentDetailPage.tsx` | Generic JSON-viewer detail shell |
| `admin/src/components/Badge.tsx` | 5-variant badge span |
| `admin/src/components/ui/PageHeader.tsx` | `<header><h1>{title}</h1>{description?}</header>` |
| `admin/src/lib/api.ts` | Server-side `adminFetch` + `getAdminUser()` (reads `cookies()`) |
| `admin/src/lib/client-api.ts` | Client-side `adminFetch` + `serverAssetUrl()` (uses `credentials: 'include'`) |
| `admin/src/lib/cn.ts` | **Removed** — now imported from `@las-flores/ui` |
| `admin/src/test/setup.ts` | `@testing-library/jest-dom` side-effect import |
| `admin/src/app/<area>/page.tsx` | One folder per top-level route (28 areas) |
| `admin/src/app/<area>/[id]/page.tsx` | Detail page (where applicable) |
| `admin/src/app/<area>/components/` | Area-specific sub-components |
| `admin/src/app/<area>/hooks/` | Area-specific `useXxx` hooks (Type B/C pages) |
| `admin/src/app/<area>/__tests__/` | Area-specific Vitest tests |
| `admin/src/app/__tests__/` | Cross-page tests (Badge, ContentListPage) |
| `admin/Dockerfile` | `node:20-alpine`; builds shared + admin |
| `admin/start.sh` | Docker-secrets resolution (`*_FILE` → real env) |
| `admin/next.config.ts` | `transpilePackages` + `/assets/*` rewrite |
| `admin/vitest.config.ts` | Vitest config (jsdom, aliases, setup) |
| `admin/tsconfig.json` | TS strict + path aliases |

