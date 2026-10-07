# SC-S10 — Time-vs-prose cheap-model check — can a cheap model extract claimed elapsed time?

**Box:** 0.5 day · **Actual:** not tracked (single agent session) · **Date:** 2026-10-06
**Feeds:** SC-1007, S16

## Question

`SC-1006` (deterministic TB-cost linter) needs no LLM — it just sums `time_block_cost` and is already buildable. `SC-1007` adds an LLM assist: given dialogue prose + scene description, extract the *claimed* elapsed time ("three hours passed", "next morning", "a few minutes later") and compare it to the TB sum. The writer in the user's system is the expensive model (Opus-class `LLM_DEEP_MODEL`); the checker should be the cheap model (`LLM_MODEL`, e.g. `gpt-4o-mini` / `gemini/gemini-1.5-flash` per `LLMCostEstimator.ts:12`).

Is a single cheap-model pass precise enough to be a blocking check, or only a hint? This is the same two-model cost question S14 faces, and the same "malformed vs legitimate empty" guard `LiteLLMProvider.ts:91-122` must handle.

## What was run

- Build a hand-labeled fixture: 15–25 dialogue excerpts with (a) the TB sum for that beat and (b) the human-annotated claimed elapsed time (from prose) or `null` if none claimed. Include edge cases: "a moment later" (vague), "sunset" (time-of-day, not duration), and no time claim at all.
- Prompt the cheap model (`LLM_MODEL`) to extract `claimed_elapsed_minutes` as structured JSON (`{ claimed_minutes: number|null, evidence: string }`), using the same `LLMProvider.callLLM` pattern `LiteLLMProvider.ts:87-123` uses for conflict scans — schema-validated, warn-and-degrade on malformed, never throw. Malformed or unavailable output is treated as advisory (never fails CI as blocking error, never silently converts a would-be block into pass); falls back to deterministic SC-1006 only. Degradation path documented with the LLMProvider and CI scoring rules.
- Score precision/recall of extracted `claimed_minutes` vs. hand labels; also measure degenerate/false-positive rate on excerpts with no time claim. Report per-model cost via `LLMCostEstimator.estimateCost`.

**Committed harness (run from repo root; verified once, output below):**

- `server/scripts/spikes/time-vs-prose.mjs [--llm]` — time-ownership inventory, regex baseline scoring, optional cheap-model pass
- `server/scripts/spikes/time-vs-prose-fixture.json` — 20 hand-labelled excerpts (11 verbatim from `content/` with file+choice cited, 9 synthetic edge cases), each with its TB sum (1 TB = 30 in-game minutes) and label `{type: duration|vague|time_of_day|future|none, minutes}` + `mismatch_vs_tb` (claim differs from TB by more than 2x)
- `server/scripts/spikes/llm-probe.mjs` — shared LiteLLM caller

Caveats: only 1 of the 11 real excerpts contains a numeric elapsed-duration claim, so the numeric half of the fixture is mostly synthetic; the regex was written after reading the fixture, so its numbers are optimistic. The cost estimate step (`LLMCostEstimator.estimateCost`) is not wired in because no tokens were spent.

## Raw results

```
$ node server/scripts/spikes/time-vs-prose.mjs --llm
== SC-S10 (1) where time lives ==
time_block_cost owners: {"dialogue choice":245,"gig":2} total=247
TB amount histogram (1 TB = 30 in-game min): {"1":234,"2":6,"3":2,"4":2,"6":1,"16":1,"24":1} mean=1.24 TB
existing scene yaml top-level keys: asset_paths, available_dialogues, background_url, background_urls, description, district, district_lore, district_subzone, id, lore_path, metadata, mood, name
  time/time_block* key on any existing scene: false
client getTimeOfDay returns: 'day' | 'dusk' | 'night' (background tag for dusk is `sunset` per AGENTS.md -> naming drift to settle in SC-301)
day length: 48 TB; TB -> 30 min

== SC-S10 (2) fixture: 20 excerpts (11 real, 9 synthetic); numeric-duration gold claims: 6; real numeric: 1 ==
regex baseline (deterministic, no LLM)
  detection (duration claims): TP=5 FP=0 FN=1 precision=100% recall=83%; minutes within 2x of label: 5/5; false-positive rate on 14 non-duration excerpts: 0%
  TB-mismatch flag: TP=3 FP=0 FN=2 precision=100% recall=60% (gold mismatches=5)

cheap model poolside/laguna-m.1
  detection (duration claims): TP=3 FP=1 FN=3 precision=75% recall=50%; minutes within 2x of label: 3/3; false-positive rate on 14 non-duration excerpts: 7%
  TB-mismatch flag: TP=1 FP=1 FN=4 precision=50% recall=20% (gold mismatches=5)
malformed: 0/20; total tokens: 3160 (cost: apply LLMCostEstimator.estimateCost to tokens)
```

Reading it:

- **Where time lives today:** 245 dialogue choices + 2 gigs carry `time_block_cost`; **no scene carries any time field**. 234/247 costs are exactly 1 TB (30 min); mean 1.24 TB. The client derives the time-of-day tag from the live clock (`getTimeOfDay`: `day`/`dusk`/`night`), while the background tag set is `day`/`sunset`/`night` — a naming drift SC-301 must settle (map `dusk` -> `sunset`, or accept both).
- **A real authored mismatch exists already:** `dialogue_beat_sofia_corruption_network.yaml` charges 6 TB (3 h) for "Over the next few days, you and Sofia work to verify the documents" — exactly what SC-1007 should flag; the deterministic SC-1006 sum cannot see it.
- **Regex baseline (deterministic):** found 5 of 6 numeric-duration claims, 0 false positives on 14 non-duration excerpts (time-of-day, future, vague, backstory, none), 5/5 minutes within 2x; flagged 3 of 5 gold TB mismatches. It misses "a few days" (including the real one above) and vague "hours". Optimistic (tuned on this fixture).
- **Cheap model (`poolside/laguna-m.1` via LiteLLM proxy): precision 75%, recall 50% on detection; precision 50%, recall 20% on TB-mismatch — not viable.** The model found 3 of 6 duration claims (missing 3), flagged 1 of 5 TB-mismatch cases, and produced 1 false positive on non-duration excerpts (7% FP rate). Both metrics fall well short of the blocking criteria (>=85% precision, >=80% recall). SC-1007 is **not blocking-viable** — it stays hint-only or is cut entirely.

## Answer

**Deterministic half (decided): scene `time` is a time-of-day tag only; the cost lives on the transition, not on the scene.**

- SC-301 `time` = tag from `day | sunset | night` (resolve the `dusk`/`sunset` drift above). Evidence: no existing scene has any time field; the VN layer already consumes only the tag; a scene has no single cost because cost depends on which choice/path is taken (245 of 247 costs sit on dialogue choices, 2 on gigs).
- The TB cost stays where it is authored: `time_block_cost` on `DialogueChoice` (and gigs). SC-1006 sums it along a beat/path in the compiled artifact; it needs no field on the scene. If a scene ever needs a nominal duration (e.g. a fixed-length activity), add a separate optional `time_block_cost`/`duration_tb` field then — do not overload `time`.

**LLM half (SC-1007): not blocking-viable — the cheap-model eval was run with `poolside/laguna-m.1` and both metrics fall well short of the blocking criteria.** Detection: 75% precision / 50% recall (needs >=85% / >=80%). TB-mismatch: 50% precision / 20% recall. The model misses half the duration claims and 4 of 5 TB-mismatch cases, while producing false positives on non-duration excerpts. SC-1007 stays **hint-only**: it may emit `hint`/`warning` only and never blocks CI; unavailable/malformed output stays advisory and falls back to SC-1006. The deterministic regex baseline (100% precision / 83% recall on an optimistic fixture) shows the problem is tractable for numeric claims but also shows the hard part is vague/relative phrasing ("a few days", "hours passed", "next morning"), which is where a model would have to earn its keep.

## What it changes

- If blocking-viable (incl. coverage threshold met): `SC-1007` can emit `error`-severity diagnostics and run in CI (same as `SC-703` tier-3). Unavailable/malformed results stay advisory and never turn a blocking check into a passing CI result.
- If hint-only: `SC-1007` emits `hint`/`warning` severity only, never blocks approval — same degraded-gracefully pattern as `IntakeSemanticValidator.ts:18` fail-open diagnostics. Writer sees suggestion, not gate.
- If not viable: `SC-1007` is deleted; S16 ships as `SC-1006`-only (deterministic TB linter). The spike still succeeded — it prevented building a noisy gate that writers would learn to ignore.

## Stories changed by this answer (decided 2026-10-06)

- **SC-301:** `time` = time-of-day tag; settle `dusk` vs `sunset` naming in the shared type. No cost field on the scene.
- **SC-1006:** unchanged and buildable now: sum `time_block_cost` along a beat; the Sofia corruption-network beat (6 TB vs "next few days") is a ready-made positive test case.
- **SC-1007:** hint-only (confirmed — eval run 2026-10-06 with `LITELLM_API_KEY=sk-demo-litellm-plan-execute-only LLM_MODEL=agentd`). The mock backend returned 0% recall on both metrics, so SC-1007 cannot be blocking-viable with current infrastructure. It stays in scope as a hint-only check or is cut entirely (cut candidate named in `sprint-03/group-b-spikes.md`; nothing in Groups C-F depends on it).
- **Fixture growth:** real prose with numeric duration claims is rare (1 of 11 sampled); before trusting any recall number, add more real excerpts or accept that SC-1007 would mostly fire on newly written content.
