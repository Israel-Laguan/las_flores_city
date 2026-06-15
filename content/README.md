# Las Flores 2077 - Content Directory

This directory contains all YAML content files for the game. Content is organized by type:

## Directory Structure

```
content/
├── characters/     # NPC character definitions
├── dialogues/      # Interactive dialogue trees
├── overlays/       # Content overlays (SFW/NSFW)
└── scenes/         # Location/scene definitions
```

## Content Types

### Characters
Define NPCs with personality, appearance, and dialogue options.

```yaml
id: "char_unique_id"
name: "Character Name"
title: "Character Title (optional)"
description: "Character description"
avatar_url: "https://example.com/avatar.jpg (optional)"
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
```

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
  accessible: true
```

## Validation

Before committing content changes, validate your YAML files:

```bash
npm run validate
```

This will check:
- Schema validation (all required fields)
- Circular dependencies in dialogue trees
- XSS protection in user-facing text
- File format and structure

## Migration

To push content to the database:

```bash
npm run migrate
```

This will:
- Validate all content files
- Process files in dependency order (Characters → Overlays → Scenes → Dialogues)
- Upsert content into the database
- Log file checksums to prevent re-processing unchanged files

## Best Practices

1. **Use descriptive IDs**: Use snake_case IDs that describe the content (e.g., `char_welcome_bot`)
2. **Keep descriptions concise**: Aim for 1-2 sentences max
3. **Test dialogues**: Use the admin panel to test dialogue flows
4. **Version your content**: The migration system tracks changes via checksums
5. **Check for cycles**: Avoid circular references in dialogue trees

## Content Guidelines

- All user-facing text should be sanitized for XSS
- Time-block costs should be clearly documented
- Use flags and conditions to create branching paths
- Keep overlay modifications focused and minimal
- Test NSFW content separately from SFW content
