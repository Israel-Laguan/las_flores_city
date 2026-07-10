# Story Builder Roadmap

Phased implementation plan for refining the Story Builder admin panel intake and edit experience.

## Milestones

| # | Milestone | Focus | Effort |
|---|-----------|-------|--------|
| 1 | [Story Builder UX Refinement](./milestone-1-story-builder-ux.md) | Replace JSON editor with text + image cards | Medium |
| 2 | [YAML Path References & Lore Integration](./milestone-2-yaml-path-references.md) | Add `lore_path`/`narrative_path` to schemas, "View Lore" button | Medium |
| 3 | [Asset Path Unification](./milestone-3-asset-path-unification.md) | Store relative paths, server resolves local or MinIO | Medium |
| 4 | [Inline Markdown Editing](./milestone-4-inline-markdown-editing.md) | Edit lore MD directly from content cards | Medium |
| 5 | [Migration & Backfill](./milestone-5-migration-backfill.md) | Migrate existing content to path-based model | Medium |

## How to Use

Each milestone file is self-contained and can be implemented independently (though they build on each other). To implement a milestone:

1. Read the milestone markdown file
2. Follow the implementation steps in order
3. Run verification commands
4. Commit with the message format specified in the milestone

## Current State

- Story Builder exists at `admin/src/app/story-builder/page.tsx`
- 4-step wizard: Describe → Review Plan → Execute → Results
- Step 2 ("Review Plan") shows raw JSON editor for `fields`
- No lore integration, no image management in the plan UI
- Assets stored in MinIO, referenced by URL in YAML

## End State

- Text + image cards replace JSON editor
- YAML stores relative paths for lore and assets
- Admin can view/edit lore MD inline
- Server resolves assets from local filesystem or MinIO transparently
- Existing content migrated to new model