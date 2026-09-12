# SC-S6 · Serving baseline

**Time-box:** 1 day · **Type:** spike · **Feeds:** SC-508, R13, SC-M3

## Context

Measure the current dialogue path: p50/p95 for chunk fetch and for server-side
**speaker resolution + portrait URL presigning** (`resolveChunkSpeakers`: uncached bulk
`SELECT` plus per-portrait presigning per response). This function does **not** measure
client/object-storage image load — presigned URLs are embedded in the `/dialogue/active`
JSON response; actual portrait load is the subsequent client→storage `GET` of that URL
and MUST be measured separately (or explicitly excluded and renamed). Do not label the
`resolveChunkSpeakers` timing as "portrait load."

## Dependencies

- **None on the other spikes or setup tickets** — this measures the *existing*
  `server/` dialogue path, independent of the new `api/` tree entirely.
- **Needed by SC-M3, not SC-M2** (`sprint-01.md` §5) — lowest urgency of the
  S1-independent spikes after S4, since S4 feeds something five milestones out but this
  feeds three milestones out (still not this milestone). Schedule after SC-S5 and the
  S1→S2 chain if the week is tight; do not let it crowd out SC-S1/S2/S5.

## Acceptance criteria (from the write-up)

The answer must state:
- The numbers: p50/p95 for **chunk fetch** (`GET /dialogue/active` end-to-end) and for
  **speaker resolution / presigning** (`resolveChunkSpeakers` in isolation). If any
  "portrait load" latency is reported, it MUST be defined as the client/object-storage
  image `GET` and measured separately from server-side presigning, or the metric MUST be
  renamed to "speaker resolution/presigning" with the distinction stated explicitly.
- The measurement method, described well enough to be repeatable by someone else.
- Whether `resolveChunkSpeakers` is in fact the hot spot, or whether that was a reading
  error — `lessons-from-current-code.md` §2.9 identifies it as *suspected* (found by
  reading code, not by measuring), and R13 forbids treating a suspicion as a baseline.

Write the result to `../../spikes/SC-S6-serving-baseline.md` using the `spikes/README.md`
template, including the "what it changes" section.

## Prompt to execute

```
Measure the current (existing server/) dialogue serving path's real performance:
p50/p95 latency for chunk fetch and portrait load, specifically checking whether
resolveChunkSpeakers (described in lessons-from-current-code.md §2.9 as doing an
uncached bulk SELECT plus per-portrait object-storage presigning on every response) is
actually the hot spot, or whether that was a suspicion from reading code rather than a
measured fact.

This spike only touches the existing server/ dialogue path — it has no dependency on
the new api/ tree, SC-S1's entity_edges work, or SC-103's schemas.

Steps:
1. Identify the current dialogue chunk-fetch and portrait-load endpoints/code paths in
   server/.
2. Set up a repeatable measurement (state the method explicitly — e.g. a load-test
   script, autocannon/k6 run, or timed integration-test loop — so someone else can
   rerun it and get comparable numbers).
3. Record p50/p95 for chunk fetch and for portrait load separately.
4. Specifically instrument or profile resolveChunkSpeakers to confirm or refute whether
   it is the dominant cost in the request path — report the actual finding, including
   if it turns out NOT to be the hot spot (that's a valid, useful, and reportable
   outcome, not a failed spike).

Write the full result — numbers, measurement method, and the resolveChunkSpeakers
finding, with a "what it changes" section addressing R13's "no performance goal without
a baseline" for SC-M3's serving-benchmark deliverable — into
docs/feat/scene-centric-backend/spikes/SC-S6-serving-baseline.md, following the template
in docs/feat/scene-centric-backend/spikes/README.md.
```
