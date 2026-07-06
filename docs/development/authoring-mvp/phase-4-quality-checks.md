# Phase 4: Content Quality Checks

> **Goal:** Extend the validation pipeline with content quality checks (density, length, inconsistency, completeness) and build a quality dashboard in the admin UI so authors can see and fix content gaps.
>
> **Dependencies:** None (extends existing `validate.ts` patterns)
>
> **Prerequisites:** Phase 0 complete (server endpoints), Phase 2 (story flow validation)
>
> **Status:** ✅ Complete

---

## Tasks

### 4A — Quality Checks in validate.ts

**Files to modify:**
- `server/src/content/validate.ts` — add quality check functions

**Purpose:** Add content quality checks that warn about common issues without blocking migration (warnings, not errors).

#### Check Types

**1. Density Checks** — Too few of something in a content type

| Check | Logic | Severity |
|-------|-------|----------|
| Scene has ≥1 NPC | `scene.metadata.npcs` length < 1 | warning |
| District has ≥1 scene | Query scenes by district, count < 1 | warning |
| Character appears in ≥1 scene | Cross-reference character IDs with scene metadata.npcs | warning |
| Mystery has ≥1 vault item | Query vault_items by mystery_id | warning |
| Dialogue has ≥3 nodes | `Object.keys(dialogue.nodes).length < 3` | warning |

**2. Length Checks** — Content is too short or too long

| Check | Logic | Severity |
|-------|-------|----------|
| Dialogue node text length | 10–500 chars; warn if <10 or >500 | warning |
| Choice text length | 5–100 chars; warn if <5 or >100 | warning |
| Scene description length | 20–300 chars; warn if <20 or >300 | warning |
| Character description length | 20–300 chars; warn if <20 or >300 | warning |

**3. Inconsistency Checks** — Cross-reference mismatches

| Check | Logic | Severity |
|-------|-------|----------|
| Scene references non-existent NPC | Check `metadata.npcs[]` against `characters` IDs | error |
| Scene references non-existent dialogue | Check `available_dialogues[]` against `dialogue_trees` IDs | error |
| Dialogue references non-existent speaker | Check `nodes[].speaker_id` against `characters` IDs | error |
| Mystery ID referenced by vault/overlay exists | Check mystery_id exists in `mysteries` | error |
| Overlay target tree exists | Check `target_tree_id` against `dialogue_trees` IDs | error |

**4. Completeness Checks** — Missing optional but important fields

| Check | Logic | Severity |
|-------|-------|----------|
| Character has `portrait_urls` | `portrait_urls` is null/empty | warning |
| Scene has `background_url` | `background_url` is null/empty | warning |
| Scene has `mood` set | `mood` is null/empty | warning |
| Mystery has `aftermath_payload` | `aftermath_payload` is null/empty | warning |
| Dialogue has `metadata.scene_id` | `metadata.scene_id` is null/empty | warning |

#### Implementation

```typescript
// New functions in validate.ts

// Combined quality check that runs ALL checks and returns warnings
export async function checkContentQuality(contentDir: string): Promise<QualityReport> {
  const report: QualityReport = {
    density: [] as QualityIssue[],
    length: [] as QualityIssue[],
    inconsistency: [] as QualityIssue[],
    completeness: [] as QualityIssue[],
  };

  await Promise.all([
    checkDensity(contentDir, report),
    checkLength(contentDir, report),
    checkInconsistency(contentDir, report),
    checkCompleteness(contentDir, report),
  ]);

  return report;
}

interface QualityIssue {
  file?: string;
  contentId?: string;
  message: string;
  severity: 'warning' | 'error';
  checkType: 'density' | 'length' | 'inconsistency' | 'completeness';
}

interface QualityReport {
  density: QualityIssue[];
  length: QualityIssue[];
  inconsistency: QualityIssue[];
  completeness: QualityIssue[];
}
```

**Integration:**
- Add `POST /admin/content/quality` endpoint that runs `checkContentQuality()` and returns the report
- Include quality checks in the existing validation pipeline (CLI flag: `--quality`)
- Quality checks are **always warnings**, never blocking errors (authors can migrate with quality warnings)

**Verification:**
- [ ] Density checks detect scenes with no NPCs
- [ ] Density checks detect districts with no scenes
- [ ] Length checks detect too-short descriptions
- [ ] Inconsistency checks detect missing cross-references
- [ ] Completeness checks detect missing portrait_urls
- [ ] Quality checks don't block migration (warnings only)
- [ ] `npm run validate:content` includes quality checks with `--quality` flag

---

### 4B — Quality Dashboard (`/quality`)

**Files to create:**
- `admin/src/app/quality/page.tsx` — quality dashboard page
- `admin/src/app/api/admin/content/quality/route.ts` — Next.js API proxy

**Files to modify:**
- `admin/src/app/components/AdminNav.tsx` — add `/quality` link

**Server endpoint:**
- Add to `admin-content.ts`: `POST /admin/content/quality` — runs quality checks

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│ Content Quality                   [Run Check]│
├─────────────────────────────────────────────┤
│ Summary:                                     │
│ ┌──────────┬──────┬──────────┬────────────┐ │
│ │ Category │ Total│ Warnings │ Errors     │ │
│ ├──────────┼──────┼──────────┼────────────┤ │
│ │ Density  │   5  │    3     │    0       │ │
│ │ Length   │   4  │    2     │    0       │ │
│ │ Inconsist│   3  │    1     │    1       │ │
│ │ Complete │   5  │    4     │    0       │ │
│ └──────────┴──────┴──────────┴────────────┘ │
│                                              │
│ Filter: [All ▼]  [Density ▼]  [Run Again]   │
│                                              │
│ Results — Density:                           │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚠ Scene "Old Town Café" has 0 NPCs     │ │
│ │   File: scenes/scene_cafe.yaml          │ │
│ │   [Fix: Link NPCs]                      │ │
│ ├─────────────────────────────────────────┤ │
│ │ ℹ District "Far South" has 0 scenes     │ │
│ │   [Fix: Create scene]                   │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Results — Inconsistency:                     │
│ ┌─────────────────────────────────────────┐ │
│ │ ❌ Dialogue "welcome" references        │ │
│ │    speaker "char_nonexistent" not found │ │
│ │   File: dialogues/welcome_dialogue.yaml  │ │
│ │   [Fix: Edit dialogue]                   │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Implementation notes:**
- Fetch data from `POST /admin/content/quality`
- Show summary cards per check type
- Filter by check type (density, length, inconsistency, completeness)
- Filter by severity (warning, error)
- Group results by check type with collapsible sections
- Each issue shows:
  - Severity icon (⚠ warning, ❌ error, ℹ info)
  - Message describing the issue
  - File path (clickable, links to `/editor?path=...`)
  - "Fix" action button if applicable
- "Run Check" button re-executes quality checks
- Color coding: green (pass), yellow (warnings), red (errors)

**Verification:**
- [ ] `/quality` page shows quality check results
- [ ] Summary cards show correct counts
- [ ] Filtering by check type works
- [ ] Filtering by severity works
- [ ] "Fix" links navigate to the correct editor/file
- [ ] "Run Check" re-executes and refreshes results
- [ ] Quality link appears in admin nav

---

## 4C — (Optional) Migration with Quality Gate

**Files to modify:**
- `server/src/content/migrate.ts` — add optional quality gate

**Purpose:** Optionally block migration if quality checks produce errors (not warnings). This is opt-in — default behavior remains unchanged (migration always proceeds).

**Implementation:**

```typescript
// Add optional quality gate to migrateContent()
export async function migrateContent(
  contentDir: string,
  options?: { qualityGate?: boolean }
): Promise<MigrationResult> {
  // ... existing validation ...
  
  if (options?.qualityGate) {
    const qualityReport = await checkContentQuality(contentDir);
    const hasErrors = qualityReport.inconsistency.length > 0;
    if (hasErrors) {
      result.success = false;
      result.errors.push('Quality gate failed: inconsistency errors found');
      return result;
    }
  }
  
  // ... continue with migration ...
}
```

**Verification:**
- [ ] Quality gate blocks migration when inconsistency errors exist
- [ ] Quality gate allows migration when only warnings exist
- [ ] Default behavior (no quality gate) always migrates

---

## Verification Checklist

- [ ] Quality checks detect density issues
- [ ] Quality checks detect length issues
- [ ] Quality checks detect inconsistency issues
- [ ] Quality checks detect completeness issues
- [ ] `/quality` page shows all check results
- [ ] Filtering and sorting work correctly
- [ ] "Fix" links navigate to relevant content
- [ ] Quality checks are non-blocking (warnings only)
- [ ] `npm run validate:content --quality` includes quality checks
- [ ] `npm run lint --workspace=admin` passes
- [ ] `npm run build --workspace=admin` passes
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes