# Las Flores 2077 - Content Directory

This directory contains all YAML content files for the game. Content is validated, then migrated to the database via the content pipeline.

## Directory Structure

```
content/
├── characters/      # NPC character definitions
├── dialogues/       # Interactive dialogue trees
├── overlays/        # Content overlays (SFW/NSFW)
├── scenes/          # Location/scene definitions
├── locations/       # Location metadata (upserted as scenes)
├── mysteries/       # Mystery quest lines
├── vault/           # Collectible items and clues
├── gigs/            # Side jobs and commissions
├── shop/            # Cosmetic and functional items
├── maps/            # District tile map definitions
└── story_beats.yaml # Narrative beat registry (single file)
```

## Content Types

### Story Beats (story_beats.yaml)
Central registry of narrative milestones. Referenced by dialogues (`effects.story_beat`) and scenes (`metadata.required_story_beat`).

```yaml
beats:
  - slug: act1_awakening
    label: "Act 1 — Awakening"
    order: 10
    description: "Vance explains the contract"
```

Beats are processed **first** during migration because dialogues and scenes cross-reference them. Manage via CLI (`npm run migrate`) or admin UI (`/story-beats`).

### Characters
Define NPCs with personality, appearance, and dialogue options.

```yaml
id: "char_unique_id"
name: "Character Name"
title: "Character Title (optional)"
description: "Character description"
avatar_url: "https://example.com/avatar.jpg (optional)"
portrait_urls:
  - "https://example.com/portrait.jpg"
metadata:
  type: "ai"
  role: "guide"
```

### Dialogues
Interactive conversation trees with choices, conditions, and effects.

```yaml
id: "dialogue_unique_id"
name: "Dialogue Name"
description: "Dialogue description (optional)"
start_node_id: "start"
nodes:
  start:
    id: "start"
    type: "narrator"
    text: "Dialogue text"
    choices:
      - id: "choice_1"
        text: "Choice text"
        next_node_id: "next_node"
        time_block_cost:
          amount: 1
          description: "Cost description"
effects:
  story_beat: "act1_awakening"  # Sets narrative beat when reached
```

Dialogue nodes support `effects.story_beat` to trigger narrative progression. Cycle detection runs during validation.

### Overlays
Modifications to existing dialogues (e.g., NSFW content for Patreon supporters).

```yaml
id: "overlay_unique_id"
name: "Overlay Name"
description: "Overlay description (optional)"
target_tree_id: "dialogue_id_to_modify"
modifications:
  - node_id: "node_to_modify"
    action: "replace"
    data:
      # New node data
conditions:
  is_nsfw_unlocked: true
priority: 0
is_nsfw: true
```

Overlays can target mystery-specific dialogues via `mystery_id`.

### Scenes
Location definitions with available dialogues and ambiance settings.

```yaml
id: "scene_unique_id"
name: "Scene Name"
description: "Scene description"
district: "District Name"
image_url: "https://example.com/image.jpg (optional)"
available_dialogues:
  - "dialogue_id_1"
  - "dialogue_id_2"
metadata:
  type: "starting_location"
  required_story_beat: "act1_awakening"  # Scene locked until beat is reached
  npcs: ["char_alex", "char_vance"]      # Auto-linked to scene_characters
```

### Locations
Location metadata upserted into the `scenes` table with `type: 'location'` in metadata.

```yaml
id: "location_unique_id"
name: "Location Name"
history: "Historical description"
```

### Mysteries
Quest lines with status tracking and time limits.

```yaml
mysteries:
  - id: "mystery_unique_id"
    title: "Mystery Title"
    description: "Mystery description"
    status: "ACTIVE"           # ACTIVE | RESOLVING | ARCHIVED
    expires_at: "2025-12-31T00:00:00Z"  # optional
    aftermath_payload: {}       # rewards/flags set on completion
```

### Vault Items
Collectible items tied to mysteries.

```yaml
vault_items:
  - id: "vault_unique_id"
    title: "Item Title"
    description: "Item description"
    thumbnail_url: "https://..."
    media_path: "vault/clue.mp4"
    item_type: "clue"           # clue | premium_cg | document
    mystery_id: "mystery_id"    # optional
    requires_signed_url: true   # auto-set for premium_cg
```

### Gigs
Side jobs and commissions.

```yaml
gigs:
  - id: "gig_unique_id"
    title: "Gig Title"
    description: "Gig description"
    time_block_cost: 2
    credit_payout: 100
    reputation_target: "gang_name"
    reputation_reward: 10
    location_restriction_id: "scene_id"  # optional
```

### Shop Items
Cosmetic and functional items.

```yaml
shop_items:
  - id: "shop_unique_id"
    name: "Item Name"
    description: "Item description"
    item_type: "cosmetic"
    price: 50
    currency_type: "gold_credits"
    asset_url: "https://..."
    is_active: true
```

### Map Tiles
District tile map definitions. Requires the district to exist in the database first.

```yaml
district: "Old Las Flores"
tiles:
  - x: 0
    y: 0
    terrain_type: "street"
    base_image_url: "https://..."
    overlay_image_url: "https://..."  # optional
    rotation: 0
    is_flipped: false
```

## Validation

Before committing content changes, validate your YAML files:

### CLI
```bash
npm run validate:content
```

### Admin UI
Visit `http://localhost:3001/validation` and click "Run Validation"

Validation checks:
- Schema validation per content type (Zod schemas in `shared/src/schemas/`)
- Dialogue cycle detection (DFS traversal)
- XSS protection in user-facing text
- Cross-reference: dialogue `effects.story_beat` exists in beat registry
- Cross-reference: scene `metadata.required_story_beat` exists in beat registry

## Migration

To push content to the database:

### CLI
```bash
npm run migrate
```

### Admin UI
Visit `http://localhost:3001/migration` and click "Run Migration"

Processing order (dependency-aware):
1. `story_beat` — must come first (dialogues and scenes reference beats)
2. `character` — may be referenced by scenes
3. `scene` — may be referenced by dialogues; auto-creates districts
4. `location` — upserted as scenes with `type: 'location'`
5. `mystery` — referenced by overlays and vault items
6. `vault` — may reference mysteries
7. `dialogue` — references characters and beats
8. `overlay` — modifies dialogue trees
9. `gig`, `shop_item`, `map_tile`

Post-migration:
- Dialogue tree chunk compilation (AOT, ≤15-node chunks for client delivery)
- Redis cache invalidation for dialogue, map, and story_beat caches

## Admin UI Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Overview with quick links |
| Characters | `/characters` | Paginated list with portrait status |
| Dialogues | `/dialogues` | Paginated list with node count + beat association |
| Scenes | `/scenes` | Paginated list with district + required beat |
| Story Beats | `/story-beats` | Full CRUD + usage cross-references |
| Overlays | `/overlays` | Overlay management |
| Assets | `/assets` | Image generation and import |
| Migration | `/migration` | Run content migration, view status |
| Validation | `/validation` | Run content validation |
| Analytics | `/analytics` | Player activity metrics |
| Users | `/users` | User management |
| Settings | `/settings` | System configuration |

## Best Practices

1. **Use descriptive IDs**: snake_case IDs that describe the content (e.g., `char_welcome_bot`)
2. **Keep descriptions concise**: 1-2 sentences max for user-facing text
3. **Set story beats early**: Add `effects.story_beat` to dialogue nodes and `required_story_beat` to scenes as you write
4. **Test dialogue flows**: Use the admin panel at `/dialogues` to verify structure
5. **Version your content**: The migration system tracks changes via SHA-256 checksums
6. **Check for cycles**: Avoid circular references in dialogue trees (auto-detected during validation)
7. **Order matters**: Story beats must exist before dialogues/scenes that reference them

## Content Guidelines

- All user-facing text is sanitized for XSS during validation
- Time-block costs should be clearly documented in dialogue choices
- Use flags and conditions to create branching paths
- Keep overlay modifications focused and minimal
- Test NSFW content separately from SFW content
- Mystery status has a CHECK constraint: `ACTIVE`, `RESOLVING`, `ARCHIVED`
