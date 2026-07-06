# MVP Authoring Experience — Milestone Documents

> **Goal:** Create a complete authoring workflow in the admin panel so that content creators can see lore, create content, link assets, organize stories, and validate quality — all from the admin UI.
>
> **Last updated:** 2026-07-06

---

## Overview

This directory contains the phased plan for building the MVP authoring experience. Each phase document contains detailed tasks, file paths, and verification steps.

### The 3-Layer Data Architecture

```
LORE (markdown)    →    CONTENT (yaml)    →    DB (postgres)
  docs/lore/              content/               tables
  
  Figures (128)          Characters (160)       characters
  Landmarks (~70)        Scenes (10)            scenes
  Districts (11)         Dialogues (8)          dialogue_trees
  Stories (40)           Mysteries (1)          mysteries
                         Vault items            vault_items
                         Gigs                   gigs
                         Story beats (7)        story_beats
```

### Network Architecture

File operations go through the server, not the admin directly:

```
Admin UI  →  Next.js API proxy  →  Server Express API  →  Filesystem / DB
```

- Admin container has NO filesystem access to `content/` or `docs/`
- Server has read-write access to `content/` and read-only access to `docs/`
- All file operations proxy through server endpoints

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| [Phase 0](phase-0-foundation.md) | ✅ Complete | Server foundation: lore/coverage/file endpoints |
| [Phase 1](phase-1-base-world.md) | 🔲 Planned | Base world: lore browser, coverage, asset linking |
| [Phase 2](phase-2-main-story.md) | 🔲 Planned | Main story: story arc, flow validation |
| [Phase 3](phase-3-mission-authoring.md) | 🔲 Planned | Missions: YAML editor, mission wizard |
| [Phase 4](phase-4-quality-checks.md) | 🔲 Planned | Quality: density, length, inconsistency checks |

---

## Dependency Chain

```
Phase 0 (server endpoints)
    ↓
Phase 1 (admin UI: lore browser, coverage, asset linking)
    ↓
Phase 2 (story arc + validation)
    ↓
Phase 3 (YAML editor + mission wizard)
    ↓
Phase 4 (quality checks)
```

---

## New npm Dependencies

| Package | Phase | Size | Purpose |
|---------|-------|------|---------|
| `react-markdown` + `remark-gfm` | Phase 1 | ~50KB | Render lore markdown in admin |
| `@monaco-editor/react` | Phase 3 (optional) | ~5MB (lazy) | YAML syntax highlighting |
| `reactflow` | Phase 3 (optional) | ~200KB | Story arc visualization |

Phase 0, 2, and 4 require zero new dependencies.

---

## Technical Constraints

1. **`docs/` is mounted read-only** in the server container (`:ro`). The admin cannot write to `docs/lore/`. Lore markdown must be edited externally (or the Docker mount changed).
2. **Admin has no filesystem access** to `content/` or `docs/`. All file I/O must proxy through server endpoints.
3. **Prompt files** are currently only scanned from `docs/lore/assets/ui-concepts/`. Phase 0E expands scanning to `docs/lore/figures/` and `docs/lore/landmarks/`.
4. **`react-markdown`** is safe to add — it's a mature, well-maintained library that does not execute arbitrary HTML.

---

## Quick Start

To begin implementing:

1. Read the Phase document you're implementing
2. Follow the tasks in order
3. Verify each task before moving to the next
4. Update the status table above