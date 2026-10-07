# SC-S9 — Inventory-ledger shape — who has what, where

**Box:** 0.5 day · **Actual:** not tracked (single agent session) · **Date:** 2026-10-06
**Feeds:** SC-1004, SC-1005, S15

## Question

S15 (inventory possession ledger) needs `has_item` / `item_at_location` edges so the checker can flag giving/using an item never acquired, or carrying something marked lost/consumed. Two variables block `SC-1004`:

1. **Owner model:** per-character possession (`has_item` between character and item) vs. per-location stash (`item_at_location`). Player inventory already exists (`player_states` + shop/vault), but NPC possession does not. The proposal's `S8` Items are "objects given on unlock condition" (`proposal.md:166`); that is item existence, not ledger.
2. **Consumption/loss semantics:** is an item consumed on use (single-use clue), retained, or lost via a flag? Needs the flag grammar's `latching` vs. `tracking` distinction (`SC-201` / `proposal.md:254`).

## What was run

- Inventory current item surface: audit `content/vault/*.yaml`, `content/shop/*.yaml`, and `content/dialogues/**` for any `gives_item` / `requires_item` usage and flag-driven item gates.
- Draft ledger edges in a scratch `api/contracts/inventory` type: `(character_id, item_id, state: acquired|consumed|lost, source_scene, story_beat)` + `(location_id, item_id)` variant (restricted to current presence only: no state/provenance, excluded from consumption/loss/transfer checks; location edges represent stash snapshot, not lifecycle). Test projection on 2–3 hand-authored acquisition/consumption sequences, including the array-aware MODIFY case (`SC-S3` / `SC-702` pitfall: naive `jsonb ||` fails).
- Confirm the checker can share the `entity_edges` table shape planned for S1/SC-701, or needs a separate projection.

**Committed harness (run from repo root; verified once, output below):**
`server/scripts/spikes/inventory-ledger.mjs` — read-only. Part 1 inventories every item-possession key in `content/` and every server write into `player_vault` / `player_inventory` / `vault_items`; part 2 runs five hand-authored acquisition/consumption sequences through a small ledger checker; part 3 runs the `jsonb ||` vs array-aware merge on a scene `items` array against the local OLTP Postgres (skips with a message if unreachable).

**Deviation from the brief:** `gives_item` and `requires_item` do not exist anywhere in `content/`, `shared/` or `server/`. The real surfaces are `effects.grant_item` (schema + two server paths, **0 uses in content**), choice `vault_unlock` (3 uses) and shop purchases. The case table below projects those instead. There is no `scene.items` yet to project (SC-301 is unbuilt); existing scenes carry only `metadata.features` strings.

## Raw results

```
$ node server/scripts/spikes/inventory-ledger.mjs
== SC-S9 (1) content usage of item keys ==
  gives_item             0 occurrences 
  requires_item          0 occurrences 
  grant_item             0 occurrences 
  vault_unlock           3 occurrences welcome_dialogue.yaml,overlay_great_lithium_leak.yaml
  retire_vault_items     0 occurrences 
  required_item          0 occurrences 
  has_item               0 occurrences 
  consume_item           0 occurrences 
  item_ids               0 occurrences 
  items                  0 occurrences 
  vault_items: 14 {"clue":12,"premium_cg":2}; of which with mission_id: 10
  shop_items: 3 (ui_theme, avatar_border, character_skin) -> cosmetics, player_inventory (separate from player_vault)
  existing scenes with metadata.features (prop-like, never obtainable): 6/21; scenes with any item key: 0
  server possession writes (distinct):
     server/src/content/content-upserts.ts INSERT INTO vault_items
     server/src/routes/dev.ts DELETE FROM player_vault
     server/src/routes/dev.ts INSERT INTO player_vault
     server/src/routes/dialogue-helpers.ts INSERT INTO player_vault
     server/src/routes/patreon.ts DELETE FROM player_vault
     server/src/routes/patreon.ts INSERT INTO player_vault
     server/src/routes/shop.purchase.ts INSERT INTO player_inventory
     server/src/services/IronGateValidator.ts INSERT INTO player_vault
     server/src/workers/LeaderboardWorker.ts UPDATE vault_items
  player_vault shape: PK(user_id,item_id) -> set membership; quantity column: NO; state/consumed/lost column: NO; item_type lifecycle: clue -> memento (aftermath retire_vault_items)

== SC-S9 (2) hand-authored sequences ==
  S-A acquire -> use (clue shown to NPC): clean | final=[["player|usb_drive","acquired"]]
  S-B use before acquire: ERROR never-acquired: use usb_drive by player | final=[]
  S-C single-use clue consumed then reused: ERROR consumed: use key_card by player | final=[["player|key_card","consumed"]]
  S-D NPC gives item it never held: ERROR never-acquired: give usb_drive by marco | final=[["player|usb_drive","acquired"]]
  S-E double grant (idempotent claim): noop: player already holds usb_drive (matches ON CONFLICT DO NOTHING) | final=[["player|usb_drive","acquired"]]

== SC-S9 (3) overlay MODIFY on a scene `items` array (Postgres) ==
  base items [lamp,desk] + overlay ADD [safe]
  naive  jsonb ||      -> {"items":[{"id":"safe"}]} (base props silently lost)
  array-aware concat   -> {"items":[{"id":"desk"},{"id":"lamp"},{"id":"safe"}]}
  live row counts: {"vault_items":"15","player_vault":"0","player_inventory":"0"}
```

Table of cases (what the content actually does today):

| Case | Mechanism | Count in content | Owner | State semantics |
|---|---|---|---|---|
| Player unlocks a clue/CG in dialogue | choice `vault_unlock` -> `INSERT player_vault ... ON CONFLICT DO NOTHING` | 3 occurrences (`welcome_dialogue.yaml` x2, lithium overlay x1), 3 distinct items | player only | set membership, acquired-only |
| Dialogue/mission reward item | `effects.grant_item` (idempotent claim ledger) | 0 | player only | acquired-only |
| Item required to proceed | `requires_item` / `required_item` | 0 (not in schema) | - | - |
| NPC gives/holds an item | `gives_item` / any NPC possession | 0 (not in schema) | none | - |
| Item at a location (stash) | any `item_at_location` / scene `items` | 0 | none | - |
| Clue demoted when mystery closes | aftermath `retire_vault_items` (`item_type` clue -> memento) | 0 listed in content (empty array), code path exists | player (via vault_items) | the only lifecycle transition in the system |
| Premium CG | Patreon grant/revoke on `player_vault` | 2 `premium_cg` items | player | grant + **revoke** (delete row) |
| Cosmetic purchase | `shop.purchase.ts` -> `player_inventory` | 3 shop items | player | owned/equipped, separate table |

Sequence results: S-B (use before acquire), S-C (use after consume) and S-D (NPC gives an item it never held) are all caught; S-E double grant is a no-op, matching the existing `ON CONFLICT DO NOTHING`. Naive `jsonb ||` replaced the base `items` array with the overlay's (`[lamp, desk]` + ADD `[safe]` -> `[safe]`), reproducing the SC-S3 pitfall on the new field; an array-aware concat keeps all three (note: `jsonb_agg(DISTINCT ...)` also sorts, so a real merge must preserve authoring order explicitly).

## Answer

**Per-character possession only; `consumed`/`lost` are reserved, not implemented; reuse `entity_edges`; and scene `items` is props-only.**

1. **`items` field decision (SC-301): visible props only.** `items` is a list of `{ id, label }` set-dressing entries. It must NOT carry vault item ids or pickup semantics. Evidence: today's only scene-adjacent data (`metadata.features` on 6 of 21 scenes) is pure set dressing; 0 content cases offer an item from a scene; every possession write in the server goes through dialogue effects or purchases, never scene state. SC-301 therefore does **not** need an `item_ref` shape now. If obtainable scene items are wanted later, add a separate field (`offers: item_ref[]`), so `items` stays additive-mergeable (array-aware ADD/REMOVE by `id`) and never has to change meaning. Consequence: no `item_at_location` edges in v1; "who gives an item" stays derived from `grant_item` / `vault_unlock` on dialogue.
2. **Owner model: per-character.** `has_item(character_id, item_id, state, source_scene)`, where the player is a character sentinel. NPC possession has zero content today, so NPC edges exist only if authors start declaring them. Per-location stash is out for SC-1004 (no cases, no lifecycle); an `item_at_location` presence edge can be added later without a state column and stays out of consume/lose/transfer checks, as the write-up originally scoped it.
3. **Semantics:** the only states the system can produce today are *acquired* (row exists) and, for clues, *retired* (clue -> memento). `player_vault` has no quantity and no consumed/lost column, and content has 0 consumption cases. v1 ledger: `acquired | retired`; `consumed` and `lost` stay in the type as reserved values with the checker rules proven in the harness (S-B/S-C/S-D), enabled only when content or schema first produces such an event. No item flag semantics are needed now: there are no item-gated flags, so **SC-201's `latching` vs `tracking` decision is not tightened by S15**.
4. **Table:** reuse `entity_edges` (`edge_kind = 'has_item'`, `attrs.state`), not a new table. `player_vault`/`player_inventory` stay the runtime source of truth; the ledger is the *authoring-time* projection of what dialogue/overlays grant.

## What it changes

- If per-location included: `SC-1004` gains a location-edge projection and SC-M6's scene resolution must consider stashed items (adds to exclusive vs. additive decision in `proposal.md:69`).
- If consumption is common: flag semantics (`latching` vs `tracking`) must be settled for item flags before S15 can block (`SC-201` dependency tightens).
- If `entity_edges` is reusable: `SC-1004` is a new edge-kind in the same table, not a new table — SC-701's projection script is extended, not duplicated.

## Stories changed by this answer (decided 2026-10-06)

- **SC-301:** `items` = props only (`{id, label}`), additive-merge with array-aware ADD/REMOVE. No `item_ref` now. Update the acceptance line "items (inventory/props visible in the scene)" to "props visible in the scene; not obtainable".
- **SC-302/overlay compose (SC-303):** the SC-S3 array-aware MODIFY requirement applies to `items` too (harness part 3).
- **SC-1004:** per-character edges only, `acquired|retired` live, `consumed|lost` reserved; sources are `grant_item` and `vault_unlock`. Smaller than estimated; no location-edge projection and no change to the exclusive-vs-additive decision in `proposal.md:69`.
- **SC-1005 / SC-201:** no new dependency from item flags.
- **SC-701:** extended with `has_item` edges (same table), not a second projection.
- **Not run / limits:** nothing here needs an LLM. Live DB counts were 15 `vault_items` rows vs 14 in `content/vault` (dev DB drift, not investigated) and 0 rows in `player_vault`/`player_inventory`, so no real player-possession data was observed; conclusions rest on content + code + schema only.
