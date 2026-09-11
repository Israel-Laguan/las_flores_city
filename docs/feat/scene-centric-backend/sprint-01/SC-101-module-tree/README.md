# SC-101 · Create the module tree

**Size:** S · **Type:** setup · **Milestone:** SC-M1 · **Feature:** F10

## Context

`api/{contracts,planning,runtime}` per `architecture.md` §1. This must land as a
build-level fact (separate workspaces/tsconfig projects), not a folder convention, because
SC-102's lint rule and SC-103's schema split both assume the module boundary already
exists as something CI can check.

## Data checked against the real repo

- Root `package.json` currently lists workspaces `client, server, admin, shared, ui,
  infra`. There is no `api` entry yet, and root `tsconfig.json` is a plain (non-composite)
  config that only includes `shared/src/**/*` — it is not a references/solution file.
- Every existing module (`server`, `shared`, `infra`, ...) is its own npm workspace with
  its own `package.json` (`typecheck`/`lint`/`test` scripts) and its own `tsconfig.json`.
  That is the pattern to copy — **not** a single `api/tsconfig.json` with TS project
  references, which would be a new build mechanism this repo doesn't otherwise use.

## Dependencies

- **Blocks:** SC-102 (lint needs a tree to lint), SC-105 (CI needs workspaces to run
  against), SC-103/SC-501 downstream (schema split assumes the module boundary exists).
- **Blocked by:** nothing. First ticket to start.

## Acceptance criteria

- `api/contracts`, `api/planning`, `api/runtime` exist with the subfolders from
  `architecture.md` §1.
- Each is registered as its own entry in root `package.json`'s `"workspaces"` array,
  alongside the existing six.
- Each has its own `package.json` with `typecheck`/`lint`/`test` scripts matching the
  shape of `server/package.json`'s equivalents, and its own `tsconfig.json` matching the
  conventions in `server/tsconfig.json` (strict, `ES2022`, `moduleResolution: bundler`).
- Each has its own `eslint.config.cjs` that spreads the repo-root `eslint.config.base.cjs`
  (same pattern as `server/eslint.config.cjs` / `infra/eslint.config.cjs`). ESLint 10
  flat config errors if a workspace has no config file — `npm run lint --workspaces`
  will fail without this.
- `npm run typecheck --workspaces` and `npm run lint --workspaces` at the repo root pick
  up all three with **zero changes to root scripts** — the workspace mechanism is what
  wires them in, not a new root command.
- All three pass with a placeholder `index.ts` only — no real contracts/planning/runtime
  code yet (that's later tasks in SC-M1/SC-M2).
- Nothing under `server/`, `scripts/`, `client/`, or `content/` is modified.

## Prompt to execute

```
Create three new npm workspaces at api/contracts, api/planning, api/runtime in this
repo, following the exact pattern of the existing server/ workspace — read
server/package.json and server/tsconfig.json first and match their shape; do not
invent a new build mechanism.

Requirements:
- Add api/contracts, api/planning, api/runtime to the root package.json "workspaces"
  array (currently: client, server, admin, shared, ui, infra).
- Each new workspace gets its own package.json with typecheck/lint/test scripts
  matching server/package.json's equivalents in spirit.
- Each gets its own tsconfig.json matching server/tsconfig.json's conventions
  (strict: true, target ES2022, moduleResolution: bundler, skipLibCheck, etc).
- Each gets its own eslint.config.cjs that spreads ../../eslint.config.base.cjs
  (api/* is one level deeper than server/infra — use ../../ not ../).
- Subfolders per architecture.md §1:
  - api/contracts/{condition,artifact,revision,flags}
  - api/planning/{intake,plan,validate,edges,compile,canon}
  - api/runtime/{resolve,state,effects,serve}
- Put one placeholder index.ts per module (not per subfolder) so the workspace
  typechecks and lints clean with no real code yet.
- Do NOT touch anything under server/, scripts/, client/, or content/.
- Verify: `npm run typecheck --workspaces` and `npm run lint --workspaces` pass at
  the repo root with no changes to the root package.json scripts themselves (only
  the workspaces array changes).

Do not add the boundary lint rule (no planning<->runtime imports) in this pass —
that is a separate ticket (SC-102) so the rule change and its CI-failure proof stay
isolated and reviewable on their own.
```
