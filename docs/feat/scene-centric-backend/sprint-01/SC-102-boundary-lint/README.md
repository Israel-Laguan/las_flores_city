# SC-102 · Boundary lint rule

**Size:** S · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

Forbid `planning/` ↔ `runtime/` imports. Both may import `contracts/`; `contracts/`
imports neither. This is the architectural rule the whole sprint exists to make real —
per `architecture.md` §2, "an unenforced architectural rule is a comment."

## Data checked against the real repo

- `eslint.config.base.cjs` (the shared flat config required by `server`/`shared`/`infra`)
  has no import-boundary plugin installed today — no `eslint-plugin-import`,
  `eslint-plugin-boundaries`, or `dependency-cruiser`.
- Given ESLint flat config is already the house style, the cheapest fit is
  `eslint-plugin-import`'s `no-restricted-paths` rule, added either to
  `eslint.config.base.cjs` or a dedicated config the three new `api/*` workspaces
  require. Do not reach for `dependency-cruiser` for a single rule — it's a second tool
  for the same job.

## Dependencies

- **Blocked by:** SC-101 (needs the tree to lint against).
- **Blocks:** SC-105 (CI job wires this rule in).

## Acceptance criteria

- Concrete tool chosen and installed: `eslint-plugin-import-x` (see notes below; `eslint-plugin-import` is incompatible with ESLint ~10.8).
- Rule configured via `no-restricted-paths` (or equivalent) and passing on the empty
  tree from SC-101. **Coverage MUST include both relative-path and workspace package-name
  import forms** — the repo exposes `@las-flores/api-planning`, `@las-flores/api-runtime`,
  and `@las-flores/api-contracts` as package names (`api/*/package.json`). There are no
  TypeScript path aliases. If the ESLint resolver cannot forbid package-name imports,
  document that limitation explicitly in this README and in the lint config comment, and
  restrict the violation test to the supported (relative) form.
- A deliberate violation is committed on a scratch branch and CI is shown to fail with
  the **specific rule** named in the output (not just "lint failed"). Violations MUST be
  exercised in **all** forbidden directions and forms the config claims to cover:
  - `api/planning/**` → `api/runtime/**` and `api/runtime/**` → `api/planning/**`
  - `api/contracts/**` → `api/planning/**` and `api/contracts/**` → `api/runtime/**`
  - each direction tested via **both** a relative import (`../../runtime/...`,
    `../../planning/...`) **and** a package-name import (`@las-flores/api-runtime`,
    `@las-flores/api-planning`, `@las-flores/api-contracts`), unless the limitation
  note above applies (in which case test only the supported form and state the gap).
  Screenshot or CI run link for each exercised violation is recorded in the retro.
- The violation is removed before merge — the scratch branch/commit is never part of the
  real PR history.
- `contracts/` importing from either `planning/` or `runtime/` also fails the rule (the
  boundary is bidirectional in one direction and one-way in the other — contracts is a
  leaf).

## Prompt to execute

```
Add a boundary lint rule to this repo forbidding imports between api/planning and
api/runtime (in either direction). Both may import from api/contracts; api/contracts
must not import from either.

Steps:
1. Check whether eslint-plugin-import is already a devDependency anywhere in the repo
   (grep package.json files) before adding it — if it's absent, add it as a root
   devDependency.
2. Configure a no-restricted-paths rule (or the closest equivalent for this repo's
   ESLint flat-config setup — check eslint.config.base.cjs and how server/eslint.config.cjs
   / shared/eslint.config.cjs extend it) that:
   - blocks api/planning/** importing from api/runtime/**
   - blocks api/runtime/** importing from api/planning/**
   - blocks api/contracts/** importing from either api/planning/** or api/runtime/**
3. Run the rule against the empty tree from SC-101 and confirm it passes clean.
4. On a scratch branch, add one deliberate cross-import (e.g. a stub import from
   api/planning into api/runtime), run `npm run lint`, and capture the exact failure
   output — it must name the rule, not just say "lint error." Save that output/log
   for the sprint retro.
5. Remove the deliberate violation before this becomes a real PR — it must never land
   on the branch that gets merged.

Do not touch server/, client/, scripts/, or content/. Do not build the actual condition
grammar or contracts content in this pass — that's separate follow-on work.
```

## Implementation notes (completed)

- Chose `eslint-plugin-import-x@~4.17.1` (+ `eslint-import-resolver-node`) added to root `devDependencies` because the original `eslint-plugin-import` has peer dep on ESLint <=9 and will not install cleanly on the project's ESLint ~10.8.
- Boundary helper lives in `api/eslint.boundary.cjs`; each `api/*/eslint.config.cjs` pulls it in and supplies its zone + restrictedPackages.
- Zones use api/-relative paths + explicit `basePath` (computed from `__dirname` in helper) so `import-x/no-restricted-paths` is cwd-independent (works from repo root, editors, etc.). `no-restricted-imports` (paths + patterns) is also cwd-independent.
- Patterns added for subpath imports (e.g. `@las-flores/api-*/dist/...`, `@las-flores/api-*/**`) so deep imports are covered.
- All 8 required violation forms (plus subpath) proven in `lint-proof.txt`; clean allowlisted runs (planning/runtime → contracts) also captured.
- Verified: per-workspace lint clean; root-invoked via explicit config clean; full root lint clean; api/* typecheck + build succeed.
- The deliberate violations for proof were never committed to source.
