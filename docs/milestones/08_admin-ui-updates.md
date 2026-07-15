# Milestone 08 — Admin UI updates

## Goal

Update the admin UI to surface the new state machine, the local drafts,
and the env-stage promotion flow. This is the last milestone because it
depends on every backend change being in place.

The UI changes are:

1. **Story Builder wizard** — collapse from 5 steps to 2 (Describe, Results).
   The Review step is preserved (with the asset drafts section) but the
   user does not need to click "Stage" or "Migrate" — that's now
   automatic on Approve.

2. **Asset drafts panel** in the Review step — show the local drafts as
   thumbnails, let the user click to choose one. The first draft is
   auto-chosen so the user can see what was picked.

3. **Asset promotion page** (`/asset-promotion`) — new page that shows
   per-entity the current state of all three stages (dev/staging/production)
   and lets the user promote or rollback.

4. **Verification report** in the Results step — show the report from
   Milestone 05 prominently. Per-item pass/fail/warning icons.

5. **Plan list page** — show the new `verified` status with a distinct
   color and a "view verification report" link.

## Pre-requisites

- Milestones 01-07.

## Files to change

### Modified admin pages

| File | Change |
|---|---|
| `admin/src/app/story-builder/StoryBuilder.tsx` | Update to 2-step wizard (Describe, Results). Remove the Stage, Migrate, and intermediate Review-buttons. The Approve button calls `/approve-and-solidify` (from Milestone 04). |
| `admin/src/app/story-builder/components/StepIndicator.tsx` | Render 2 steps instead of 5. |
| `admin/src/app/story-builder/components/ReviewStep.tsx` | Add the asset drafts panel (from Milestone 03). Show draft thumbnails, click-to-choose. The first draft is auto-chosen. |
| `admin/src/app/story-builder/components/ResultsStep.tsx` | Add the VerificationReport component. Show per-item pass/fail. Link to the asset promotion page. |
| `admin/src/app/story-builder/plans/page.tsx` | Add `verified` to the status color map. Add a "View verification report" link per plan row. |
| `admin/src/app/story-builder/hooks/useStoryBuilderApi.ts` | Add `generateDrafts(planId)`, `listDrafts(planId)`, `chooseDraft(planId, needId, filename)`, `approveAndSolidify(planId)`, `getVerification(planId)`. |

### New admin pages

- `admin/src/app/asset-promotion/page.tsx` — new page. Lists all entities
  with asset needs, grouped by content type. Per entity, shows the three
  stage states and Promote/Rollback buttons.

### New admin components

- `admin/src/app/story-builder/components/AssetDraftsPanel.tsx` — new
  component. Renders the draft thumbnails for one item. Used inside
  ReviewStep.
- `admin/src/app/story-builder/components/VerificationReport.tsx` — new
  component. Renders a VerificationReport (from Milestone 05) as a
  collapsible list.
- `admin/src/app/asset-promotion/components/PromotionRow.tsx` — new
  component. Renders one row in the promotion page.

### Modified admin navigation

- `admin/src/app/page.tsx` (or the dashboard) — add a link to
  `/asset-promotion`.

## Implementation outline

### The wizard (2 steps)

```tsx
// admin/src/app/story-builder/StoryBuilder.tsx
export default function StoryBuilder({ initialPlanId }: StoryBuilderProps) {
  const { step, description, setDescription, plan, ... } = useStoryBuilder(initialPlanId);

  return (
    <main>
      <StepIndicator step={step} />
      {step === 1 && <DescribeStep ... />}
      {step === 2 && plan && (
        <ReviewStep
          plan={plan}
          onApproveAndShip={handleApproveAndShip}  // calls /approve-and-solidify
        />
      )}
      {step === 3 && <ResultsStep plan={plan} verification={verification} />}
    </main>
  );
}
```

The Review step has an inner "Review" tab and an "Asset Drafts" tab.
The user can switch between them, edit the plan fields, choose drafts,
and finally click "Approve & Ship".

### The asset drafts panel

The panel renders **every valid asset file** in the per-entity
`assets/` folder, regardless of name. It calls the new server route
`GET /admin/story-builder/plans/:id/drafts` (added in M03) which uses
`LocalDraftService.listLocalAssets()` to read the directory and filter
by `VALID_ASSET_EXTENSIONS`. The component does not care where the
files came from — pre-existing default, in-app generator, or
file-manager drop-in.

```tsx
// admin/src/app/story-builder/components/AssetDraftsPanel.tsx
export function AssetDraftsPanel({ item, onChoose, onRefresh }: {
  item: ContentPlanItem;
  onChoose: (needId: string, filename: string) => void;
  onRefresh: () => void;
}) {
  const { data: assets, isLoading } = useAssets(item.planId, item.id);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await generateDrafts(item.planId);   // POST /generate-drafts
      onRefresh();                          // re-reads the assets folder
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <div className="header">
        <h4>Image assets ({assets?.length ?? 0})</h4>
        <button onClick={onRefresh}>Refresh</button>
        <button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate 3 Drafts'}
        </button>
      </div>
      <p className="hint">
        Drop your own image files (any name) into the per-entity
        <code>assets/</code> folder via the OS file manager, then click
        Refresh. Only the file you choose is published to MinIO when
        you approve the plan.
      </p>
      <div className="grid">
        {assets?.map(a => (
          <button
            key={a.filename}
            onClick={() => onChoose(item.assetNeeds[0]?.promptType ?? 'portrait', a.filename)}
            className={a.chosen ? 'asset chosen' : 'asset'}
            title={a.filename}
          >
            <img src={`/local/${a.fullPath}`} alt={a.filename} />
            <span className="filename">{a.filename}</span>
            {a.chosen && <span className="check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
```

The `/local/<path>` URL is served by a new server route that streams
files from `content/` to the admin UI for preview. This is a small,
hermetic change.

**Key UX points:**

- The hint text tells the user they can drop files in by hand.
- The "Refresh" button re-reads the folder (so external file-manager
  drops appear without a page reload).
- The "Generate 3 Drafts" button calls the in-app generator, which
  writes files using the timestamp convention
  (`<slug>__<ISO-timestamp>.png`). After generation, the panel
  refreshes.
- Every valid file is shown, regardless of name. The user can
  differentiate "generated vs. hand-dropped" by the filename
  (generated = `__<timestamp>` suffix, hand-dropped = arbitrary).
- The component does not assume any particular filename pattern.
  Files named `from_midjourney_v3.png`, `Untitled-1.png`, and
  `aisha_al_sayed__2026-07-15T01-30-12.png` all render the same way.

### The promotion page

```tsx
// admin/src/app/asset-promotion/page.tsx
export default function AssetPromotionPage() {
  const { data: entities } = useEntitiesWithAssets();

  return (
    <main>
      <h1>Asset Promotion</h1>
      {entities?.map(e => (
        <PromotionRow key={`${e.type}-${e.id}`} entity={e} />
      ))}
    </main>
  );
}
```

```tsx
// admin/src/app/asset-promotion/components/PromotionRow.tsx
export function PromotionRow({ entity }: { entity: EntityWithAssets }) {
  return (
    <div className="row">
      <h3>{entity.name} <small>({entity.type})</small></h3>
      {entity.assets.map(asset => (
        <div key={asset.field} className="asset-stages">
          <div className="stage">
            <strong>dev</strong>
            <span>{asset.devTimestamp ?? '—'}</span>
            {asset.devUrl && <a href={asset.devUrl}>View</a>}
            {asset.devUrl && <button>Rollback</button>}
          </div>
          <div className="stage">
            <strong>staging</strong>
            <span>{asset.stagingTimestamp ?? '—'}</span>
            {!asset.stagingUrl && asset.devUrl && <button>Promote</button>}
            {asset.stagingUrl && <a href={asset.stagingUrl}>View</a>}
          </div>
          <div className="stage">
            <strong>production</strong>
            <span>{asset.productionTimestamp ?? '—'}</span>
            {!asset.productionUrl && asset.stagingUrl && <button>Promote</button>}
            {asset.productionUrl && <a href={asset.productionUrl}>View</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Tests to add or update

- `admin/src/app/story-builder/__tests__/StoryBuilder.test.tsx` — update
  for the 2-step wizard.
- `admin/src/app/story-builder/__tests__/ReviewStep.test.tsx` — add a
  test that the asset drafts panel renders and choosing a draft calls
  `chooseDraft()`.
- `admin/src/app/story-builder/__tests__/ResultsStep.test.tsx` — add a
  test that the verification report renders.
- `admin/src/app/asset-promotion/__tests__/PromotionRow.test.tsx` — new
  file. Test the three-stage UI.

## Validation gate

1. The wizard is 2 steps (Describe, Results) for the happy path.
2. The Review step shows asset drafts as thumbnails.
3. Clicking a thumbnail marks it as chosen (visual checkmark).
4. Clicking "Approve & Ship" runs the full solidify flow and shows the
   verification report.
5. The `/asset-promotion` page shows all entities with their three stages.
6. Promote and Rollback buttons work and refresh the page.
7. `npm run lint --workspace=admin` → 0 errors.
8. `npm run test --workspace=admin` → all green.
9. `npm run build --workspace=admin` → passes.
10. `docker compose build server && docker compose up -d server` succeeds.
11. `docker exec las-flores-server wget -qO- http://localhost:3000/health`
    returns `{"success":true}`.

## Rollback plan

The UI changes are all additive or replace existing components. The
wizard UX change is the most invasive — reverting `StoryBuilder.tsx` and
`StepIndicator.tsx` restores the 5-step wizard. The promotion page is
additive; removing it does not affect the rest of the admin. The drafts
panel is additive inside ReviewStep; reverting ReviewStep.tsx restores
the old layout without the drafts.
