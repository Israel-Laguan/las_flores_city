# Milestone 4: Content Skeleton Generator

> **Depends on**: [M01-shared-schema.md](M01-shared-schema.md)
> **Next**: [M05-orchestrator.md](M05-orchestrator.md)

## Context

The `ContentSkeletonGenerator` takes a `ContentPlanItem` and generates a valid YAML string for that content type. We use a **template-based approach** (Option A from the design doc): each content type has a template function that produces a YAML skeleton with `TODO` placeholders for fields the LLM didn't fill in.

Templates are derived from existing content files — we use real character/dialogue/scene YAMLs as reference for what fields are required.

## Goals

- [ ] Create `server/src/services/ContentSkeletonGenerator.ts`
- [ ] Implement template per content type (all 12 types)
- [ ] Generate valid YAML that passes `validateContent()`
- [ ] Write unit tests for each template
- [ ] Verify lint and build pass

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/src/services/ContentSkeletonGenerator.ts` | Create | Template-based YAML generation |
| `server/tests/unit/contentSkeletonGenerator.test.ts` | Create | Unit tests for templates |

## Implementation Details

### Generator Structure

```typescript
// server/src/services/ContentSkeletonGenerator.ts
import yaml from 'js-yaml';
import crypto from 'node:crypto';
import type { ContentPlanItem } from '@shared/index';
import type { ContentType } from '@shared/index';

type TemplateFn = (item: ContentPlanItem) => string;

const TEMPLATES: Record<ContentType, TemplateFn> = {
  character: (item) => yaml.dump({
    id: item.fields.id || crypto.randomUUID(),
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    metadata: { type: 'human', role: 'npc', ...item.fields.metadata },
  }, { lineWidth: -1, noRefs: true }),

  dialogue: (item) => yaml.dump({
    id: item.fields.id || crypto.randomUUID(),
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    start_node_id: 'start',
    nodes: {
      start: {
        id: 'start',
        type: 'narrator',
        text: item.fields.text || 'TODO: Add dialogue text',
        choices: [
          {
            id: 'continue',
            text: 'Continue',
            next_node_id: 'end',
          },
        ],
      },
      end: {
        id: 'end',
        type: 'narrator',
        text: 'TODO: Add ending text',
        is_end: true,
      },
    },
  }, { lineWidth: -1, noRefs: true }),

  scene: (item) => yaml.dump({
    id: item.fields.id || crypto.randomUUID(),
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    district: item.fields.district || 'TODO: Add district',
  }, { lineWidth: -1, noRefs: true }),

  overlay: (item) => yaml.dump({
    id: item.fields.id || crypto.randomUUID(),
    name: item.name,
    description: item.fields.description || 'TODO: Add description',
    target_tree_id: item.fields.target_tree_id || 'TODO: Add target dialogue tree UUID',
    modifications: [],
  }, { lineWidth: -1, noRefs: true }),

  mission: (item) => yaml.dump({
    id: item.fields.id || crypto.randomUUID(),
    title: item.name,
    description: item.fields.description || 'TODO: Add description',
    status: 'ACTIVE',
  }, { lineWidth: -1, noRefs: true }),

  // ... etc for: story, shop_item, location, map_tile, story_beat, gig, vault
};

export function generateYaml(item: ContentPlanItem): string {
  const template = TEMPLATES[item.type];
  if (!template) {
    throw new Error(`No template found for content type: ${item.type}`);
  }
  return template(item);
}

export function resolveFilePath(item: ContentPlanItem): string {
  const dirMap: Record<ContentType, string> = {
    character: 'characters',
    dialogue: 'dialogues',
    scene: 'scenes',
    overlay: 'overlays',
    mission: 'missions',
    story: 'stories',
    shop_item: 'shop',
    location: 'locations',
    map_tile: 'maps',
    story_beat: '',  // story_beats.yaml is a single file
    gig: 'gigs',
    vault: 'vault',
  };
  const dir = dirMap[item.type];
  if (!dir) throw new Error(`Cannot resolve directory for type: ${item.type}`);
  return `${dir}/${item.type === 'character' ? 'char_' : ''}${item.slug}.yaml`;
}
```

### Unit Test Structure

```typescript
// server/tests/unit/contentSkeletonGenerator.test.ts
import { generateYaml, resolveFilePath } from '../../src/services/ContentSkeletonGenerator.js';
import type { ContentPlanItem } from '@shared/index';

describe('ContentSkeletonGenerator', () => {
  it('should generate valid character YAML', () => {
    const item: ContentPlanItem = {
      id: crypto.randomUUID(),
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego',
      fields: { description: 'A bartender' },
      assetNeeds: [],
      dependsOn: [],
    };
    const yaml = generateYaml(item);
    expect(yaml).toContain('name: Diego');
    expect(yaml).toContain('id:');  // UUID generated
  });

  it('should generate valid dialogue YAML with nodes', () => {
    const item: ContentPlanItem = {
      id: crypto.randomUUID(),
      type: 'dialogue',
      action: 'create',
      name: 'Diego intro',
      slug: 'diego_intro',
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    };
    const yaml = generateYaml(item);
    expect(yaml).toContain('start_node_id: start');
    expect(yaml).toContain('nodes:');
  });

  it('should resolve correct file paths', () => {
    const item: ContentPlanItem = {
      id: crypto.randomUUID(),
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego',
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    };
    expect(resolveFilePath(item)).toBe('characters/char_diego.yaml');
  });
});
```

### Key Design Decisions

1. **Use `js-yaml` `dump()`** — Already a dependency in `server/package.json`
2. **`lineWidth: -1`** — Prevents line wrapping in long descriptions
3. **`noRefs: true`** — Prevents YAML anchors/aliases (cleaner output)
4. **`crypto.randomUUID()`** — Generate UUIDs for `id` field if not provided
5. **TODO placeholders** — Clear markers for fields that need human review
6. **File path convention** — Follows existing pattern: `characters/char_*.yaml`, `dialogues/*.yaml`, etc.

## Completion Checklist

Before proceeding to Milestone 5, verify:

- [ ] `server/src/services/ContentSkeletonGenerator.ts` exists
- [ ] All 12 content types have working templates
- [ ] `generateYaml()` produces valid YAML for each type
- [ ] `resolveFilePath()` returns correct paths
- [ ] Unit tests pass
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes

## Next Milestone

→ [Milestone 5: Story Builder Orchestrator](M05-orchestrator.md)