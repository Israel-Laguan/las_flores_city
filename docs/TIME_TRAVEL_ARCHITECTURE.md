# Time Travel & Leaderboard Architecture

This document describes the narrative injection system, competitive mystery tracking, and Vault unlock path.

---

## Dialogue Resolver

`server/src/services/DialogueResolver.ts` performs a deep merge of dialogue overlays with base dialogue trees. Key behaviors:

- **ACTIVE mystery hook visibility**: Overlay nodes for mysteries with `status = ACTIVE` are merged into the dialogue tree so hook choices appear to the player.
- **`<important>` tag preservation**: Tags injected by the narrative pipeline are preserved through the merge. Covered by unit tests in `resolver.unit.test.ts` and integration tests in `dialogue-resolver.test.ts`.

---

## Atomic Breakthrough Lock

`processBreakthroughSolve` in `server/src/routes/dialogue.ts` enforces a single-writer lock on mystery breakthroughs. A 50-way HTTP concurrency test (`server/tests/integration/breakthrough.concurrency.test.ts`) validates that exactly one request wins and all others receive a conflict response.

---

## Telemetry: OLTP ↔ OLAP

`dialogue_choice` events are emitted from `server/src/routes/dialogue.ts` to OLAP (`player_events`) whenever time blocks are spent during dialogue. The OLAP schema uses:

| Column | Purpose |
|--------|---------|
| `event_data` | JSON payload with context (scene, choice, TB cost) |
| `created_at` | Event timestamp |
| `time_blocks_cost` | Integer TB spent on this event |

Do **not** use `data`, `occurred_at`, or `event_data->>'tb_cost'`.

---

## Cache Invalidation

Redis cache keys are invalidated at the following lifecycle points:

| Event | Keys invalidated |
|-------|-----------------|
| `join_mystery` | Dialogue state, mystery state |
| Breakthrough solve | `dialogue:resolved:*` |
| Mystery archive (via `LeaderboardWorker`) | `dialogue:resolved:*`, leaderboard cache |

---

## Time Travel Gate

The Time Travel flow covers the full mystery lifecycle: **INVESTIGATING → RESOLVING → ARCHIVED**.

It is exercised end-to-end by the gate script at `server/scripts/run_time_travel_gate_test.ts`, which performs:

1. Start dialogue and join a mystery via hook choice → `player_mysteries.status = INVESTIGATING`
2. Protocol 7 breakthrough → `isBreakthrough: true`, `mysteries.status = RESOLVING`, `expires_at` set, feed `[BREAKTHROUGH]` post
3. Expire the mystery and run the leaderboard worker → `mysteries.status = ARCHIVED`, leaderboard rank+TB entry, feed `[CASE CLOSED]` post, breakthrough badge on `public_profiles`, OLAP `dialogue_choice` telemetry

### Mystery Status Lifecycle

```
ACTIVE → (player joins) → INVESTIGATING (player_mysteries)
       → (breakthrough) → RESOLVING + expires_at set
       → (expiry + worker) → ARCHIVED + leaderboard entry
```

The `mysteries.status` CHECK constraint allows `ACTIVE`, `RESOLVING`, and `ARCHIVED`. Adding a new status requires rewriting the constraint in migration `021_leaderboards.sql`.

---

## Leaderboard Worker

`server/src/workers/LeaderboardWorker.ts` processes expired mysteries (`status = RESOLVING` and `expires_at < NOW()`) and:

1. Archives the mystery (`status = ARCHIVED`).
2. Computes rank from OLAP `time_blocks_cost` grouped by `user_id`.
3. Writes the leaderboard row to OLTP `leaderboards`.
4. Invalidates `dialogue:resolved:*` cache keys.

Ranking rules: lowest TB spent wins; delta time is the tie-breaker when TB is equal. The rank=1 player receives a `breakthrough` badge.

---

## Vault & Media

| Feature | Endpoint / Path |
|---------|----------------|
| Vault App UI | `GET /vault` |
| Vault unlock | Idempotent `vault_unlock` event |
| Image modal | Vault item click opens full-size media |

Vault items are stored in `vault_items` with `media_url` pointing to CDN assets.

---

## Key Files

| File | Responsibility |
|------|---------------|
| `server/src/routes/dialogue.ts` | Dialogue choices, OLAP telemetry, cache invalidation on join |
| `server/src/services/DialogueResolver.ts` | Merge ACTIVE mystery overlays, hook choice visibility |
| `server/src/workers/LeaderboardWorker.ts` | Expire mysteries, rank players, invalidate cache on archive |
| `server/scripts/run_time_travel_gate_test.ts` | Repeatable end-to-end Time Travel gate script |
| `server/tests/integration/breakthrough.concurrency.test.ts` | 50-request HTTP concurrency gate |
| `server/tests/integration/dialogue-resolver.test.ts` | OLAP telemetry test, dynamic cache keys |
| `server/tests/leaderboard.simulation.test.ts` | Synthetic 5-player OLAP ranking simulation |
