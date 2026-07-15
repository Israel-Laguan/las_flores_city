# Las Flores 2077 — Game Design Document

> **Status:** Active reference for server-driven visual novel architecture.
> **Platform:** Node.js/Express server + Phaser.js/PixiJS client + Phone Overlay UI
> **Genre:** Narrative-driven social simulation with competitive mystery engine

---

## Core Concept

A server-driven visual novel where the player navigates dialogue trees, manages time, builds relationships, and solves competitive mysteries in the city of Las Flores. The server is the source of truth for all game state; the client renders what the server dictates.

### Narrative Identity

Las Flores is a city of beautiful contradictions: pastel-colored streets that hide contaminated rivers, peaceful neighborhoods built on buried corruption, a university campus where students debate sustainability while sitting on land that was never properly remediated.

The player arrives as a newcomer, seeking education and a fresh start. What they find is a community entangled in secrets—corporate cover-ups, political manipulation, environmental crimes, and the stubborn courage of people who refused to stay silent.

The game's tone shifts between:
- **Warmth and connection** — street festivals, family dinners, café conversations, late-night study sessions
- **Suspicion and unease** — footsteps on the roof at night, a neighbor's sudden death, a phone call from an unknown number
- **Moral weight** — every choice costs time, and time is the scarcest resource

---

## Primary Mechanics (Current Implementation)

### 1. Time-Block System

**Source of truth:** `docs/UX_DECISIONS.md`, `docs/MVW_ARCHITECTURE.md`

- Players have **48 time blocks (TB) per day**.
- Every action costs TB: moving between locations (1 TB), engaging in dialogue (1–3 TB), taking certain choices.
- TB are **non-refundable** once spent. This is a narrative commitment mechanism, not just a resource gate.
- Sleeping resets TB to 48 but costs credits and advances the day.

**Design rationale:** Scarcity creates meaning. If a player can undo a dialogue choice, the emotional stakes collapse. The time-block system enforces that decisions matter.

### 2. Dialogue Trees & Choices

**Source of truth:** `shared/src/schemas/dialogue.ts`, `docs/TIME_TRAVEL_ARCHITECTURE.md`

- Dialogues are authored in YAML and served from the server.
- Each node has `speaker_id`, `text`, and optional `choices`.
- Choices can include:
  - `time_block_cost` — how much the choice costs
  - `relationship_change` — affects friendship or romance stats
  - `required_flags` — gates the choice based on player state
  - `hidden_if` — removes choices when certain flags are set
  - `vault_unlock` — grants access to media
  - `mystery_solve` — triggers competitive mystery resolution
  - `alignment_change` — final choice that locks the player to `loyalist` or `fugitive`

**Current "discussion battles" pattern:**
Branching dialogue paths that test different player attributes. A high-persuasion character might solve a situation through dialogue, while a technically-minded character finds environmental clues. Both succeed, but with different costs and narrative consequences.

Implementation: Map this to `relationship_change` + `required_flags` + `hidden_if` in the dialogue schema. The server filters available choices based on player state; the client shows only what is available.

### 3. Relationship System

**Source of truth:** `docs/lore/game_systems.md`

- **Closeness (-100 to 100):** Personal affinity with NPCs. High closeness unlocks unique dialogue options, safe house access, and backup during conflicts.
- **Trust (-100 to 100):** Professional or criminal reliability, independent of personal closeness.
- **Faction ripple effects:** Improving standing with one group may affect standing with another.

### 4. Reputation & Faction Standing

- Tracked at faction/district level, not just individually.
- Determines base prices at shops, access to restricted areas, and passive hostility from street elements.
- Gigs in `content/gigs/` already include `reputation_target` and `reputation_reward` fields.

### 5. Fast Travel / Location System

**Source of truth:** `shared/src/schemas/scene.ts`, `docs/MVW_ARCHITECTURE.md`

- Players move between named, unlocked locations.
- Movement costs 1 TB and is permanent for the session.
- Each location has available dialogues, NPCs, and ambiance settings.
- The `current_location_id` on the `users` table tracks position.

### 6. Inventory & Shop System

**Source of truth:** `shared/src/schemas/shop.ts`

- `player_inventory` table tracks owned items.
- Shop purchases validate balance + ownership before inserting inventory rows.
- Inventory items are denormalized for client rendering without a second round-trip.

### 7. Gigs (Time-Block Earning Activities)

**Source of truth:** `shared/src/schemas/gig.ts`

- Gigs cost TB to perform and reward credits.
- May have `reputation_target` (only available if standing with faction is high enough) and `reputation_reward`.
- Exposure: players earn enough TB to keep playing by doing gigs, which also advances their social position.

### 8. Story Progression

**Source of truth:** `docs/NEXT_STEPS.md` (open items) and `docs/DATA_INTAKE.md` (content paths).

- `player_states.story_beat` tracks the player's position in the main arc.
- Set atomically by the server when TB-costing choices are made.
- Used to gate dialogue availability and scene metadata.
- Beat slugs are authored in YAML, not hardcoded.

### 9. Competitive Mystery Engine

**Source of truth:** `docs/TIME_TRAVEL_ARCHITECTURE.md`

- Mysteries are structured content with `ACTIVE → INVESTIGATING → RESOLVING → ARCHIVED` lifecycle.
- Players join a mystery via dialogue hook choices.
- Breakthrough solving is atomic (single-writer lock).
- Leaderboards rank players by lowest TB spent; ties broken by delta time.
- Rank 1 receives a `breakthrough` badge on their public profile.

---

## Skill System Concept (Proposed)

**From original GDD:** "If a character has high persuasion, they solve through dialogue. If they have technical knowledge, they solve through environmental clues."

### Current Equivalent

The existing dialogue schema already supports this pattern via:
- `required_flags` on choices — gate options based on prior decisions
- `relationship_change` — reward social skills
- `hidden_if` — remove options for players without certain attributes

### Proposed Enhancement

Add player attributes (e.g., `persuasion`, `technical`, `empathy`) to the user schema. Dialogue choices could then:
- Increase success probability for certain branches
- Unlock alternative paths without consuming additional TB
- Modify relationship gains/losses

This is **not yet implemented**. The current system uses boolean flags, not numeric skills.

---

## Atmosphere & Art Direction

### Visual Tone

The world of Las Flores is deliberately split:

- **Daytime / Public spaces:** Warm pastels, saturated market colors, sunlit plazas, children playing in fountains. The city looks like a postcard.
- **Night / Private spaces:** Desaturated, cold blues, long shadows, the metallic smell of the river at dusk. The corruption is visible if you know where to look.

This duality is delivered through:
- Scene ambiance metadata (`ambiance: warm_day`, `ambiance: cold_night`)
- Client-side shader overlays in Phaser (CSS filters on the Phone Overlay)
- Lore descriptions in scene YAML files

### 2D/3D Hybrid (Adapted)

**Original GDD:** 2D anime panels for dialogue, 3D exploration for travel.

**Current implementation:**
- Dialogue is served as text + optional speaker portrait (not yet implemented in content).
- "Travel" is a menu action (select destination → server deducts 1 TB → updates `current_location_id`).
- The Phaser.js `WorldScene` provides a minimal grid visualization but is not the primary gameplay surface.
- The Phone Overlay (DOM/CSS) is the primary interface.

This is a deliberate simplification: a top-down 3D world requires art assets and collision logic that the current team cannot produce at scale. The server-driven dialogue system is the narrative engine; the visual layer is atmospheric, not exploratory.

---

## Audio Design

### Music

- **Location themes:** Each scene can have an `audio_track` field (not yet in schema; proposed).
- **Loop duration:** 25–35 seconds, ambient volume.
- **Emotional leitmotifs:** Short cues (2–3 seconds) that play when the player achieves something significant or faces a moral choice.

### Sound Effects

- UI feedback (button press, TB spent)
- Environmental sounds (market chatter, train arrival, river flowing)
- Dialogue emphasis (subtle tone when a character is lying, a soft chime when a clue is noticed)

### Voice

- No voice acting planned. The game is text-driven to keep content production scalable.

---

## UI Layout

### Phone Overlay Shell

**Source of truth:** `client/src/components/PhoneOverlay.ts`, `client/src/styles/phone.css`

The entire game interface is rendered inside a phone-shaped DOM container layered above the Phaser canvas.

**Apps inside the Phone:**
| App | Purpose |
|-----|---------|
| Feed | News, social media, character posts |
| Messages | SMS threads with NPCs |
| Vault | Media gallery unlocked during play |
| MyMe | Player profile, stats, inventory |
| Banco | Credits balance, transactions |
| Trabajando | Gigs board |
| Identity | Document viewer (evidence, clues) |
| Settings | Display, audio, accessibility |

**Design principle:** The server sends content, the client renders it in the phone metaphor. The Phaser canvas is secondary.

### Dialogue UI

- Speaker portrait (optional, not yet in content schema) at top.
- Text in speech bubble.
- Choices appear below as tappable buttons.
- TB cost shown next to each choice.

---

## Pacing & Progression

### Daily Cycle

1. **Wake up** → TB reset to 48, rent deducted.
2. **Choose location** → move costs 1 TB.
3. **Interact** → dialogues, gigs, mystery hooks.
4. **Return home** → time advances, fatigue/affection ticks update.
5. **Sleep** → loop.

### Difficulty Curves

- **Early game (Days 1–7):** TB are abundant relative to available content. Player learns systems without pressure.
- **Mid game (Weeks 2–4):** TB become scarce. Choices have real consequences. Mystery deadlines emerge.
- **Late game (Final act):** TB are extremely limited. Every choice feels like a sacrifice. The player must prioritize relationships or investigation, not both.

---

## Content Pipeline

**Source of truth:** `docs/FOUNDATION_ARCHITECTURE.md`

1. **Author YAML** in `/content` subdirectories.
2. **Validate** with `npm run validate:content` (Zod schema + cycle detection + XSS).
3. **Migrate** with `npm run migrate` (idempotent upsert, dependency order).
4. **Test** with integration tests (`breakthrough.concurrency.test.ts`, `dialogue-resolver.test.ts`).

### Character vs Figure

- **Lore Wiki:** `docs/lore/figures/<name>.md` — worldbuilding reference, no `#character` tag.
- **Game Engine:** `content/characters/char_<name>.yaml` + `char_<name>.md` — NPC data for dialogue system.
- **Dual-track:** Major NPCs need both (e.g., `docs/lore/figures/evelyn_ruthenberg.md` + `content/characters/char_evelyn_ruthenberg.yaml`).

---

## What Was Discarded from Original GDD

| Original GDD Feature | Reason for Removal |
|----------------------|-------------------|
| 3D top-down exploration | No art pipeline for 3D assets; Phaser grid is sufficient |
| 2D anime panel conversations | Phone overlay text-based UI is the current design |
| Inventory puzzle solving | Shop/inventory system exists but puzzles are dialogue-based |
| Minigames | Scope reduction; puzzles are now choice-based |
| 3D character models | No 3D art pipeline; portraits not yet implemented |
| Fast-travel animation | Instant travel via menu in current implementation |
| Real-time weather/clock | Time-block abstraction replaced with day/night cycle |
| Engine choice (Unity/Godot) | Irrelevant; current stack is Node.js + Phaser |

---

## What Was Preserved / Adapted

| Original GDD Concept | Current Implementation |
|----------------------|----------------------|
| Decision-driven narrative | Dialogue YAML with branching choices |
| NPC relationships | `closeness`/`trust` + `relationship_change` in choices |
| Reputation system | Faction-facing `reputation_target`/`reward` in gigs |
| Puzzles with skill gates | `required_flags` + `hidden_if` in dialogue choices |
| Discussion battles (persuasion vs technical) | Branching paths gated by flags/attributes |
| Atmosphere duality (pastel/dark) | Scene ambiance + client-side shaders |
| Music/sound | Proposed but not yet in schema |
| Demo scenario (train station, two endings) | Prologue and Act 1 structure mirrors this |

---

## Open Design Questions

1. **Skill attributes:** Should we add numeric `persuasion`/`technical`/`empathy` to the user schema, or keep the current boolean flag approach?
2. **Story beat gating:** Should `story_beat` be enforced strictly (404 if missing) or allow fallback dialogues?
3. **Scene ambiance audio:** Should `ambiance` be a field on `scenes` and drive background music?
4. **Portrait rendering:** Should the phone overlay show character portraits in dialogue, or keep it text-only?
5. **Mystery NPC availability:** Should `GET /location/:id` filter visible characters based on `story_beat`?

---

## Cross-References

- `docs/UX_DECISIONS.md` — main menu, time-block commitment
- `docs/FOUNDATION_ARCHITECTURE.md` — infrastructure, content pipeline
- `docs/MVW_ARCHITECTURE.md` — player state, flat interface
- `docs/TIME_TRAVEL_ARCHITECTURE.md` — mystery lifecycle, leaderboard worker
- `docs/NEXT_STEPS.md` — open action items for story-beat gating and admin follow-ups
- `docs/lore/game_systems.md` — relationship schema (lore-side)
- `shared/src/schemas/dialogue.ts` — dialogue node/choice/effects schema
- `shared/src/schemas/gig.ts` — gig schema with reputation fields
- `shared/src/schemas/shop.ts` — inventory schema