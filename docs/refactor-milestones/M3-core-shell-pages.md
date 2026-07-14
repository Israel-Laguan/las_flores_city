# Milestone 3 — Rebuild core shell pages (CSS-based)

**Goal:** Port the foundational pages/components from `dashboard` using the CSS-first convention (global classes + CSS Modules). No inline styles.

## Steps
1. **Login page** (`/login`): port `dashboard/src/app/login/page.tsx`. Uses `api.ts` direct fetch to `/auth/admin-login`. Styled with `login.module.css` (ported from `client/src/styles/login.css` aesthetic).
2. **Home/dashboard page** (`/`): port `dashboard/src/app/components/HomePage.tsx` into `app/page.tsx`.
3. **`AdminNav`** (`app/components/AdminNav.tsx`): receives `user` from layout server component. Styled with `AdminNav.module.css`.
4. **`ContentListPage`** (`app/_components/ContentListPage.tsx`): the shared table + pagination primitive. Replace `adminStyles` object with `cn()` + `ContentListPage.module.css`. Generic `<T>` API preserved.
5. **`ContentDetailPage`** (`app/_components/ContentDetailPage.tsx`): shared detail view primitive.
6. Document each page's data flow (which Express endpoint it hits via `api.ts`).

## Notes
- These shell pieces are the building blocks for M4/M5 — get them right first.
- Reference: `dashboard/src/app/login/page.tsx`, `dashboard/src/app/components/`, `dashboard/src/app/_components/`.

## Verification
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- Manual: login → redirected to home → nav renders → list page loads data from Express.