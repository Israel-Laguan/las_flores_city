# Dependency Policy

## Pinning strategy

All dependencies use **tilde (`~`)** version ranges. This locks to patch versions only, preventing minor/major bumps from sneaking in via `npm ci`. Rationale: reproducible builds and fewer surprises in CI.

## Update workflow

- **Dependabot** is configured at `.github/dependabot.yml`:
  - Patches and minors are grouped into single PRs (weekly, Mondays).
  - Major updates get individual PRs for manual review.
  - GitHub Actions are also tracked weekly.

- **Review cadence**: Check dependabot PRs weekly. Patch groups are generally safe to merge after CI passes. Minor groups warrant a quick changelog scan. Majors need a migration plan.

## Known issues

| Package | Issue | Status |
|---------|-------|--------|
| `next@16.2.10` | Depends on `postcss@8.4.31` (< 8.5.10), moderate XSS vuln | Waiting for Next.js 16.3.x stable release. Not exploitable at runtime — affects CSS stringification only. |

## Current pinned versions (as of 2026-07-14)

| Package | Version | Workspace |
|---------|---------|-----------|
| react | ~19.2.7 | client, admin, ui |
| next | ~16.2.10 | admin |
| vite | ~7.3.6 | client |
| vitest | ~4.1.10 | admin |
| @vitejs/plugin-react | ~5.2.0 | admin |
| typescript | ~5.9.3 | all |
| phaser | ~3.90.0 | client |
| eslint | ~8.57.1 | root, admin, ui |
| jest | ~29.7.0 | server, shared |
| zod | ~3.25.76 | server, shared |
