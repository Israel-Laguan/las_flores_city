# SC-S9 — Inventory-ledger shape — who has what, where

**Box:** 0.5 day · **Actual:** _to be filled_ · **Date:** _to be filled_
**Feeds:** SC-1004, SC-1005, S15

## Question

S15 (inventory possession ledger) needs `has_item` / `item_at_location` edges so the checker can flag giving/using an item never acquired, or carrying something marked lost/consumed. Two variables block `SC-1004`:

1. **Owner model:** per-character possession (`has_item` between character and item) vs. per-location stash (`item_at_location`). Player inventory already exists (`player_states` + shop/vault), but NPC possession does not. The proposal's `S8` Items are "objects given on unlock condition" (`proposal.md:166`); that is item existence, not ledger.
2. **Consumption/loss semantics:** is an item consumed on use (single-use clue), retained, or lost via a flag? Needs the flag grammar's `latching` vs. `tracking` distinction (`SC-201` / `proposal.md:254`).

## What was run

- Inventory current item surface: audit `content/vault/*.yaml`, `content/shop/*.yaml`, and `content/dialogues/**` for any `gives_item` / `requires_item` usage and flag-driven item gates.
- Draft ledger edges in a scratch `api/contracts/inventory` type: `(character_id, item_id, state: acquired|consumed|lost, source_scene, story_beat)` + `(location_id, item_id)` variant (restricted to current presence only: no state/provenance, excluded from consumption/loss/transfer checks; location edges represent stash snapshot, not lifecycle). Test projection on 2–3 hand-authored acquisition/consumption sequences, including the array-aware MODIFY case (`SC-S3` / `SC-702` pitfall: naive `jsonb ||` fails).
- Confirm the checker can share the `entity_edges` table shape planned for S1/SC-701, or needs a separate projection.

**Reproducibility:** commit fixtures + probe script under `server/scripts/spike_sc_s9_inventory_ledger.ts` or inline them here.

## Raw results

_To be filled._

## Answer

_To be filled: per-character only / per-location included; consumption model; and whether this reuses `entity_edges` or needs its own table._

## What it changes

- If per-location included: `SC-1004` gains a location-edge projection and SC-M6's scene resolution must consider stashed items (adds to exclusive vs. additive decision in `proposal.md:69`).
- If consumption is common: flag semantics (`latching` vs `tracking`) must be settled for item flags before S15 can block (`SC-201` dependency tightens).
- If `entity_edges` is reusable: `SC-1004` is a new edge-kind in the same table, not a new table — SC-701's projection script is extended, not duplicated.
