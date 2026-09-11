# SC-S5 · Weather source

**Time-box:** 0.5 day · **Type:** spike (research/decision, no code artifact required) ·
**Feeds:** A6, SC-305, blocks SC-M2 exit criteria

## Context

`AGENTS.md:36`: `buildBackgroundHints(timeOfDay, weather?, mood?)` accepts weather, but it
is "a forward-compatible hook with no live source yet (callers pass `undefined`)".

## Dependencies

- **None.** This is a research/decision spike, not a build spike — no code artifact
  gates it, and it doesn't touch SC-S1's table, SC-103's schemas, or anything else in
  this sprint. **Run it first**, immediately, alongside SC-101/SC-102 — there is no
  reason for it to sit mid-sequence given it's one of only three items on the
  "sprint is successful if" bar (`sprint-01.md` §4) and one of the six items on the
  "do not cut" list (§5).

## Acceptance criteria (from the write-up)

The answer must state:
- Where a live weather value should come from — candidates to evaluate: the in-game
  clock (precedent: `phoneStore.timeBlocks → getTimeOfDay()`), district state, authored
  per-scene, or a mix.
- How the chosen source interacts with the documented precedence chain: explicit
  `visual.background` > weather > time-of-day > mood > default.

This settles open decision **A6** (`architecture.md` §9, due by SC-M2).

Write the result to `../../spikes/SC-S5-weather-source.md` using the `spikes/README.md`
template, including the "what it changes" section — even though this spike produces no
code, it still needs the write-up so the decision is recorded and traceable.

## Prompt to execute

```
Research and decide where a live "weather" value for buildBackgroundHints(timeOfDay,
weather?, mood?) should come from — this function currently always receives
weather=undefined (see AGENTS.md:36).

This is a decision spike, not a build spike — no code should be written for this
ticket beyond whatever small read-only exploration is needed to evaluate the candidates
(e.g. checking whether district-level state already exists, or how phoneStore.timeBlocks
/ getTimeOfDay() is wired, as the closest existing precedent for a similar "derive a
runtime value from game state" pattern).

Steps:
1. Read AGENTS.md around line 36 for the exact current hook signature and its
   documented precedence chain: explicit visual.background > weather > time-of-day >
   mood > default.
2. Evaluate each candidate weather source against that precedence chain:
   - the in-game clock, following the phoneStore.timeBlocks -> getTimeOfDay() precedent
     (find and read that code path first)
   - district-level state, if such a concept exists in the codebase already
   - authored per-scene (a content-authoring answer, not a runtime-derived one)
   - some mix of the above
3. Recommend one source (or a specific combination), and explain concretely how it
   plugs into the existing precedence chain without breaking the documented ordering.
4. This settles open decision A6 in architecture.md §9 (due by SC-M2) — state that
   explicitly in the write-up.

Write the decision, including a "what it changes" section (which future ticket, e.g.
SC-305, implements this; what changes in architecture.md's open-decisions table), into
docs/feat/scene-centric-backend/spikes/SC-S5-weather-source.md, following the template
in docs/feat/scene-centric-backend/spikes/README.md.
```
