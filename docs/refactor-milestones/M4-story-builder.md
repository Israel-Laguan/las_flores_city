# Milestone 4 — Rebuild Story Builder (CSS, separated)

**Goal:** The centerpiece. Port the story-builder from `dashboard` with proper architecture from the start: logic hook + orchestrator + dumb components, all CSS-based.

## Structure
```
admin/src/app/story-builder/
├── page.tsx                          # thin wrapper → <StoryBuilder initialPlanId={...} />
├── StoryBuilder.tsx                  # 'use client' orchestrator (uses the hook)
├── StoryBuilder.module.css
├── hooks/useStoryBuilder.ts          # all state + API calls (port from dashboard page.tsx lines 92-372)
├── components/
│   ├── StepIndicator.tsx + .module.css
│   ├── DescribeStep.tsx  + .module.css   # port renderStep1
│   ├── ReviewStep.tsx    + .module.css   # port renderStep2 (ContentCard list + refine + links)
│   ├── StageStep.tsx     + .module.css   # port renderStep3
│   ├── MigrateStep.tsx   + .module.css   # port renderStep4
│   ├── ResultsStep.tsx   + .module.css   # port renderStep5
│   ├── ContentCard.tsx   + .module.css   # port dashboard sub-component
│   ├── PlanSummary.tsx   + .module.css   # port dashboard sub-component
│   └── LoreViewer.tsx    + .module.css   # port dashboard sub-component
└── types.ts                          # local types (Step, etc.)
```

## Steps
1. `useStoryBuilder.ts`: extract 10 `useState` hooks, `postJSON` helper, `useEffect` (templates + URL param), keyboard shortcuts, and the 6 API handlers (generate, refine, preview, stage, migrate, load) from `dashboard/src/app/story-builder/page.tsx`.
2. `StoryBuilder.tsx`: orchestrator consuming the hook; renders `StepIndicator` + active step + nav bar.
3. Extract each `renderStepN` into a dumb component receiving props from the hook.
4. Sub-components (`ContentCard`, `PlanSummary`, `LoreViewer`): port from dashboard, swap inline `styles.x` for `.module.css` classes via `cn()`.
5. Slim `page.tsx` to a thin wrapper (server component reading `searchParams`, or client if staying `'use client'`).

## Notes
- Reference: `dashboard/src/app/story-builder/page.tsx` (933 lines), `components/ContentCard.tsx`, `PlanSummary.tsx`, `LoreViewer.tsx`.
- Keep the 5-step wizard flow identical to current behavior.
- `FieldDefinitions.ts` moves as-is.

## Verification
- `npm run lint --workspace=admin`
- `npm run build --workspace=admin`
- Run existing story-builder tests (port from `dashboard/src/app/story-builder/__tests__/`).
- Manual: full Describe → Review → Stage → Migrate → Assets flow.