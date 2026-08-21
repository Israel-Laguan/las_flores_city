# M41 — Documentation Gap Cleanup

> **Status:** Complete · **Owner:** story-engine effort
> **Scope:** reconcile milestone claims after M32 retirement and consolidate remaining backlog ownership

## Goal

Keep active milestone documentation aligned with the current repository while moving durable architecture context into real documentation and removing superseded milestone records.

## Scope

- Remove references to M32-retired services and paths.
- Reconcile M30 Phase A and M31 deferred statuses.
- Align M30 documentation with the CDN-only dialogue schema and revalidated benchmark evidence.
- Clarify M26/M27-b graph-critique ownership and M28 `plan_json` transport semantics.
- Keep residual prompt/expression/background work owned exclusively by M40.
- Remove superseded M6/M7/M29 asset-expression planning records after their remaining work is represented by M40.

## Acceptance Criteria

- [x] No current milestone claims a deleted implementation file is active.
- [x] M30 and M31 status text agrees across the roadmap and milestone documents.
- [x] M30 snapshot documentation contains no fallback to dropped dialogue JSONB columns.
- [x] M30 benchmark conclusions identify the later pool-bump revalidation as authoritative.
- [x] The superseded M6/M7/M29 planning records have been deleted after their residual work was represented by M40.
- [x] M40 is the sole owner of the remaining asset-expression/background backlog.
- [x] Repository searches find no stale `open-backlog.md` references and no obsolete `.kilo/plans/*` documentation references in the audited records.
- [x] Every remaining active milestone reference resolves to an existing file or is explicitly historical.

## Verification

### Residual ownership

- [x] `M40-prompt-expression-asset-carryforward.md` is the sole owner of the M6/M7/M29 residual work: G-M40-2 (Wen Zhao expression PNGs), G-M40-3 (scene background publishing and cleanup), and G-M40-4 (visual-expression verifier rerun).
- [x] Cross-check: `docs/milestones/README.md` and this M41 document do not assign the remaining asset-expression/background backlog to an independent M6, M7, or M29 owner; other references are historical context or point to M40.

### Commands

```bash
rg -n 'open-backlog\.md|\.kilo/plans/' docs server shared scripts
rg -n '1786049707544-m6|1786049707544-m7|1786049707544-m29' docs server shared scripts
rg -n 'G-M40-(2|3|4)|1786377431414-m40-prompt-expression-asset-carryforward' docs/milestones/README.md docs/milestones/M41-documentation-gap-cleanup.md docs/milestones/1786377431414-m40-prompt-expression-asset-carryforward.md
```

The first two searches must return no stale live-document references. The ownership search must show the remaining M6/M7/M29 work only through M40's G-M40-2, G-M40-3, and G-M40-4 ownership record, with M41 documenting the verification rather than claiming the backlog. Review the resulting diff and confirm the deleted planning records have no inbound links. Run the repository documentation/content validation command available in the current workspace and record any unrelated failures. Historical references outside the audited live-document areas, including `.kilo/plans/`, are not live milestone imports and are outside this follow-up's scope.
