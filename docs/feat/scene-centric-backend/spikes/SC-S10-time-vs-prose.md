# SC-S10 — Time-vs-prose cheap-model check — can a cheap model extract claimed elapsed time?

**Box:** 0.5 day · **Actual:** _to be filled_ · **Date:** _to be filled_
**Feeds:** SC-1007, S16

## Question

`SC-1006` (deterministic TB-cost linter) needs no LLM — it just sums `time_block_cost` and is already buildable. `SC-1007` adds an LLM assist: given dialogue prose + scene description, extract the *claimed* elapsed time ("three hours passed", "next morning", "a few minutes later") and compare it to the TB sum. The writer in the user's system is the expensive model (Opus-class `LLM_DEEP_MODEL`); the checker should be the cheap model (`LLM_MODEL`, e.g. `gpt-4o-mini` / `gemini/gemini-1.5-flash` per `LLMCostEstimator.ts:12`).

Is a single cheap-model pass precise enough to be a blocking check, or only a hint? This is the same two-model cost question S14 faces, and the same "malformed vs legitimate empty" guard `LiteLLMProvider.ts:91-122` must handle.

## What was run

- Build a hand-labeled fixture: 15–25 dialogue excerpts with (a) the TB sum for that beat and (b) the human-annotated claimed elapsed time (from prose) or `null` if none claimed. Include edge cases: "a moment later" (vague), "sunset" (time-of-day, not duration), and no time claim at all.
- Prompt the cheap model (`LLM_MODEL`) to extract `claimed_elapsed_minutes` as structured JSON (`{ claimed_minutes: number|null, evidence: string }`), using the same `LLMProvider.callLLM` pattern `LiteLLMProvider.ts:87-123` uses for conflict scans — schema-validated, warn-and-degrade on malformed, never throw.
- Score precision/recall of extracted `claimed_minutes` vs. hand labels; also measure degenerate/false-positive rate on excerpts with no time claim. Report per-model cost via `LLMCostEstimator.estimateCost`.

**Reproducibility:** commit fixtures + eval script under `server/scripts/spike_sc_s10_time_vs_prose.ts` or inline the fixture table and prompt here.

## Raw results

_To be filled._

## Answer

_To be filled: **blocking-viable** (cheap model ≥~85% precision on claimed-minutes extraction, false-positive <10% on no-claim excerpts) vs. **hint-only** (usable as suggestion, not gate) vs. **not viable** (too noisy to ship). Include per-1K cost estimate so S2 hint budgeting is honest._

## What it changes

- If blocking-viable: `SC-1007` can emit `error`-severity diagnostics and run in CI (same as `SC-703` tier-3).
- If hint-only: `SC-1007` emits `hint`/`warning` severity only, never blocks approval — same degraded-gracefully pattern as `IntakeSemanticValidator.ts:18` fail-open diagnostics. Writer sees suggestion, not gate.
- If not viable: `SC-1007` is deleted; S16 ships as `SC-1006`-only (deterministic TB linter). The spike still succeeded — it prevented building a noisy gate that writers would learn to ignore.
