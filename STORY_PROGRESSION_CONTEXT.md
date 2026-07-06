# Story Progression — Context Document

## What You Asked For

> "The server should track where the player is in the main story. When the user advances the story and spends a TB, the server saves it. When we open scenes or dialogues, we ask the server what point in the main story the player is at."

---

## What Already Exists (and does NOT solve this)

### `player_states.flags` (JSONB)
Dialogue YAML nodes can write to this via `effects.flag_set`:
```yaml
effects:
  flag_set:
    phone_intro_complete: true
    districts_known: true
```
Written atomically in `recordChoiceAndEffects()` inside the `/dialogue/:id/choose` transaction.

**Why it's not enough:** It's a flat, unordered key-value bag. There's no concept of "which act am I in" — it just accumulates booleans. You'd need to query many flags and write logic to infer the story position, which is fragile and not authorable.

### `users.current_node_id` + `users.active_dialogue_id`
Tracks which node inside an active dialogue the player is currently on. Cleared to NULL when a dialogue ends.

**Why it's not enough:** This is the cursor *within a single conversation*, not a position in the overall story arc. It's gone after the dialogue closes.

### `player_dialogue_states` table
Stores `(user_id, dialogue_tree_id, current_node_id, choices_made[])` per dialogue. Survives after the dialogue ends.

**Why it's not enough:** It records dialogue history per-tree, but there's no single field that says "the player is in Act 2" or "the player has completed the onboarding arc."

### `users.alignment` (`neutral` / `loyalist` / `fugitive`)
Set by the finale choice. Used to gate overlay merging in `DialogueResolver`.

**Why it's not enough:** This is a single end-state flag for the meta-plot finale, not a general story cursor.

---

## What Is Missing

A single, authorable **story beat** field on `player_states` that:
- Represents the player's current position in the main story arc
- Is set by the server atomically when a TB-costing dialogue choice is made
- Is readable by the location and dialogue endpoints so they can conditionally serve content
- Is authored directly in the dialogue YAML (no code changes needed to add new beats)

---

## Current Data Flow (the gap)

```
Player makes choice → /dialogue/:id/choose
  → processChoice()
    → deduct TB
    → write flag_set effects to player_states.flags
    → update users.current_node_id
  → response sent to client
```

The client receives `time_blocks_remaining` in the response and updates its local state. The server has no durable record of "this choice moved the story to beat X."

When the client later calls `GET /location/:id` or `POST /dialogue/start`, the server assembles the scene/dialogue without knowing where in the story the player is — it only knows:
- What location they're in
- What mysteries they're investigating
- What flags they've accumulated
- Their alignment (only after the finale)

---

## What M5 Delivers

Milestone 5 implemented a live admin CRUD interface for the story beat registry. Authors can now manage beats directly from the admin panel without editing YAML migrations.

### Admin API Endpoints (`/admin/story-beats`)

All endpoints are protected by `authAndAdminMiddleware` and return the standard `{ success, data, timestamp }` envelope.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/story-beats` | List all beats ordered by `order` ASC |
| `POST` | `/admin/story-beats` | Create a new beat (validates against `StoryBeatSchema`) |
| `PUT` | `/admin/story-beats/:slug` | Update `label`, `order`, `description` for an existing beat |
| `DELETE` | `/admin/story-beats/:slug` | Delete a beat by slug |
| `GET` | `/admin/story-beats/:slug/usages` | Return cross-references: dialogue nodes and scenes that reference this beat |

After any successful write, the `story_beats:slugs` Redis cache entry is invalidated and repopulated so the slug list stays consistent with the DB.

### Beat List Page (`/story-beats`)

The admin app at `/story-beats` provides a terminal-green table UI with:
- All beats displayed in narrative order (ascending by `order`)
- Inline add form for creating new beats
- Per-row edit mode (label, order, description are editable in-place)
- Per-row delete with confirmation prompt
- Link to the Beat Detail View for each beat

### Beat Detail View (`/story-beats/[slug]`)

Each beat has a detail page showing cross-reference data:
- **Dialogue usages** — every dialogue node whose `effects.story_beat` equals this slug, showing the dialogue name and node ID
- **Scene usages** — every scene whose `metadata.required_story_beat` equals this slug, showing the scene name
- Explicit empty-state messages when no references exist

---

## Player-Facing Story Beat Features (still pending)

The following changes are **not yet implemented** and require future milestones:

### 1. DB: add `story_beat` to `player_states`
```sql
ALTER TABLE player_states
  ADD COLUMN IF NOT EXISTS story_beat VARCHAR(100) NOT NULL DEFAULT 'prologue';
```

A string slug like `'prologue'`, `'act1_handler_met'`, `'act2_barista_recruited'`, `'finale'`. The value is authored in YAML, not hardcoded in server logic.

### 2. YAML: add `story_beat` to `effects`
```yaml
effects:
  flag_set:
    phone_intro_complete: true
  story_beat: act1_city_arrived   # <-- new
```

This is already the pattern used by `flag_set`. `story_beat` would just be another key in `effects` that the server writes differently (to a dedicated column, not the flags bag).

### 3. Server: write `story_beat` in `recordChoiceAndEffects()`
Inside the existing transaction in `dialogue-helpers.ts`:
```ts
if (nextNode.effects?.story_beat) {
  await client.query(
    'UPDATE player_states SET story_beat = $1 WHERE user_id = $2',
    [nextNode.effects.story_beat, userId]
  );
}
```

### 4. Server: expose `story_beat` in player state
`assemblePlayerState()` in `player-helpers.ts` already JOINs `player_states` for flags — add `story_beat` to the SELECT and include it in the returned object.

### 5. Scene and Dialogue: use `story_beat` as a gate
**For scenes (`GET /location/:id`):** the NPC list or scene metadata could vary by beat.
**For dialogues (`POST /dialogue/start`):** `resolveDialogueTree()` currently picks a dialogue by `(scene_id, character_id)`. It could also filter by `required_story_beat` in the dialogue's `metadata`.

Example dialogue YAML:
```yaml
metadata:
  required_story_beat: act1_city_arrived
```

If the player's `story_beat` doesn't match `required_story_beat`, the server returns a different dialogue (or no dialogue).

---

## Story Arc as It Stands in the Content

| Beat slug (proposed) | Dialogue / Trigger |
|---|---|
| `prologue` | Default. Player has just arrived. |
| `act1_awakening` | After `dialogue_awakening.yaml` — Vance explains the contract. |
| `act1_city_arrived` | After `welcome_dialogue.yaml` — player has gotten their bearings. |
| `act1_first_contact` | After `dialogue_first_contact.yaml` — first conversation with the Barista. |
| `act2_mystery_active` | After joining a mystery (`join_mystery` choice effect fires). |
| `act3_finale_unlocked` | Set server-side when mystery is solved (LeaderboardWorker). |
| `finale_complete` | After `dialogue_finale.yaml` — alignment locked. |

These are proposals based on the current content files. The actual beat names should be decided when authoring the YAML.

---

## Key Files Already Touched (M5)

| File | What M5 Did |
|---|---|
| `server/src/routes/admin-story-beats.ts` | New Express router with 5 CRUD + usages endpoints |
| `server/src/index.ts` | Mounted `adminStoryBeatsRouter` at `/admin/story-beats` |
| `admin/src/app/api/admin/story-beats/route.ts` | Next.js proxy for GET list + POST create |
| `admin/src/app/api/admin/story-beats/[slug]/route.ts` | Next.js proxy for PUT update + DELETE delete |
| `admin/src/app/api/admin/story-beats/[slug]/usages/route.ts` | Next.js proxy for GET usages |
| `admin/src/app/story-beats/page.tsx` | Beat List Page UI |
| `admin/src/app/story-beats/[slug]/page.tsx` | Beat Detail View UI |

## Key Files to Touch (player-facing — still pending)

| File | Change |
|---|---|
| `server/src/database/migrations/029_story_beat.sql` | Add `story_beat` column to `player_states` |
| `server/src/routes/dialogue-helpers.ts` → `recordChoiceAndEffects()` | Write `effects.story_beat` to DB |
| `server/src/routes/player-helpers.ts` → `assemblePlayerState()` | Include `story_beat` in SELECT + return value |
| `shared/src/index.ts` → `PlayerStateSchema` | Add `storyBeat` field |
| `shared/src/schemas/dialogue.ts` → `DialogueNodeSchema` effects | Add `story_beat` to effects schema |
| `server/src/routes/dialogue-helpers.ts` → `resolveDialogueTree()` | Accept + filter by player's `story_beat` vs `metadata.required_story_beat` |
| `content/dialogues/*.yaml` | Add `effects.story_beat` to key nodes, `metadata.required_story_beat` where needed |

---

## Things to Decide Before Implementing

1. **Beat names** — what are the canonical slugs? Should they be an enum or free-form strings?
2. **Gate behaviour** — if a player doesn't have the required beat for a dialogue, do we: (a) return 404, (b) return a fallback dialogue, or (c) hide the NPC entirely?
3. **Multiple dialogues per character per scene** — `resolveDialogueTree()` returns `LIMIT 1`. If a character has different dialogue trees for different story beats, we need the resolver to pick the right one. Currently it just picks the first match.
4. **Beat advancement rules** — can a beat only go forward (monotonically increasing), or can story branches set different beats? If branches, we need to think about conflict (e.g. two paths both setting act2 differently).
5. **`story_beat` in scene payload** — should `GET /location/:id` also filter which NPCs appear based on the player's beat? (e.g. Vance only appears after `act1_awakening`). This is related to but separate from the overlay NPC system already in place.
6. **Client awareness** — the client currently reads `story_beat` from `GET /player/state` on boot and caches it in `PhoneStore`. Should the `choose` response also return the new beat so the client updates without a separate state fetch?
