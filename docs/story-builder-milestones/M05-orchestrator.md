# Milestone 5: Story Builder Orchestrator

> **Depends on**: [M01-shared-schema.md](M01-shared-schema.md), [M04-skeleton-generator.md](M04-skeleton-generator.md)
> **Next**: [M06-server-routes.md](M06-server-routes.md)

## Context

The `StoryBuilderOrchestrator` takes an approved `ContentPlan` and executes it:
1. Topologically sorts items by `dependsOn` (so dependencies are created first)
2. For each item, generates YAML via `ContentSkeletonGenerator` and writes it atomically to `content/`
3. Applies links (e.g., adds a dialogue's UUID to a scene's `available_dialogues` array)
4. Runs `validateContent()` and `migrateContent()` on the content directory
5. Collects all `assetNeeds` from plan items into an `assetTasks` array
6. Returns an `ExecutionResult` with created files, validation errors, and asset tasks

This follows **Option A (Synchronous Execution)** from the design document — the existing migration endpoint is already synchronous.

## Goals

- [ ] Create `server/src/services/StoryBuilderOrchestrator.ts`
- [ ] Implement `executePlan(plan)` returning `ExecutionResult`
- [ ] Topologically sort items by `dependsOn`
- [ ] Write YAML atomically (`.tmp` + `rename`)
- [ ] Apply links between content items
- [ ] Run validation and migration
- [ ] Verify lint and build pass

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/src/services/StoryBuilderOrchestrator.ts` | Create | Plan execution pipeline |

## Implementation Details

### Orchestrator Structure

```typescript
// server/src/services/StoryBuilderOrchestrator.ts
import path from 'node:path';
import fs from 'node:fs/promises';
import { type ContentPlan, type ContentPlanItem, type ContentLink, type AssetNeed } from '@shared/index';
import { generateYaml, resolveFilePath } from './ContentSkeletonGenerator.js';
import { validateContent } from '../content/validate.js';
import { migrateContent } from '../content/migrate.js';

export interface ExecutionResult {
  success: boolean;
  createdFiles: string[];
  validationErrors: string[];
  migrationResult: any;
  assetTasks: Array<{ item: ContentPlanItem; needs: AssetNeed[] }>;
  error?: string;
}

export async function executePlan(plan: ContentPlan): Promise<ExecutionResult> {
  const createdFiles: string[] = [];
  const contentDir = resolveContentDir();

  try {
    // 1. Topologically sort items by dependsOn
    const sortedItems = topologicalSort(plan.items);

    // 2. Write YAML files
    for (const item of sortedItems) {
      if (item.action === 'create') {
        const yaml = generateYaml(item);
        const filePath = resolveFilePath(item);
        const fullPath = path.join(contentDir, filePath);
        await atomicWriteYaml(fullPath, yaml);
        createdFiles.push(filePath);
      }
      // TODO: Handle 'update' action in Phase 2
    }

    // 3. Apply links
    for (const link of plan.links) {
      await applyLink(link, plan.items, contentDir);
    }

    // 4. Validate and migrate
    const validationResult = await validateContent(contentDir);
    if (!validationResult.valid) {
      return {
        success: false,
        createdFiles,
        validationErrors: validationResult.errors,
        migrationResult: null,
        assetTasks: [],
      };
    }

    const migrationResult = await migrateContent(contentDir);

    // 5. Collect asset tasks
    const assetTasks = plan.items
      .filter(item => item.assetNeeds.length > 0)
      .map(item => ({ item, needs: item.assetNeeds }));

    return {
      success: true,
      createdFiles,
      validationErrors: [],
      migrationResult,
      assetTasks,
    };
  } catch (error: any) {
    return {
      success: false,
      createdFiles,
      validationErrors: [],
      migrationResult: null,
      assetTasks: [],
      error: error.message,
    };
  }
}
```

### Topological Sort

```typescript
function topologicalSort(items: ContentPlanItem[]): ContentPlanItem[] {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const visited = new Set<string>();
  const result: ContentPlanItem[] = [];

  function visit(item: ContentPlanItem) {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    for (const depId of item.dependsOn) {
      const dep = itemMap.get(depId);
      if (dep) visit(dep);
    }
    result.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return result;
}
```

### Atomic YAML Write

```typescript
async function atomicWriteYaml(fullPath: string, content: string): Promise<void> {
  const dir = path.dirname(fullPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = fullPath + '.tmp';
  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, fullPath);  // Atomic on POSIX
}
```

### Apply Links

```typescript
async function applyLink(link: ContentLink, items: ContentPlanItem[], contentDir: string): Promise<void> {
  const fromItem = items.find(i => i.id === link.fromItem);
  const toItem = items.find(i => i.id === link.toItem);
  if (!fromItem || !toItem) return;

  // Read the target file (e.g., scene YAML)
  const targetPath = path.join(contentDir, resolveFilePath(fromItem));
  const content = await fs.readFile(targetPath, 'utf-8');
  const yaml = await import('js-yaml');
  const data = yaml.load(content) as any;

  // Apply the link (e.g., add dialogue UUID to scene's available_dialogues)
  if (link.action === 'add') {
    if (!data[link.field]) data[link.field] = [];
    const itemId = toItem.fields.id;
    if (!data[link.field].includes(itemId)) {
      data[link.field].push(itemId);
    }
  } else if (link.action === 'set') {
    data[link.field] = toItem.fields.id;
  }

  // Write back
  const updatedYaml = yaml.dump(data, { lineWidth: -1, noRefs: true });
  await atomicWriteYaml(targetPath, updatedYaml);
}
```

### Key Design Decisions

1. **Synchronous execution** — Follows existing migration endpoint pattern
2. **Atomic writes** — `.tmp` + `rename` prevents partial files on crash
3. **Topological sort** — Ensures dependencies created before dependents
4. **Link application** — Merges arrays without duplicates
5. **Error tracking** — Returns `createdFiles` even on failure (for manual cleanup)
6. **No rollback (MVP)** — Partial failures leave files for manual fix; Phase 3 adds rollback

## Completion Checklist

Before proceeding to Milestone 6, verify:

- [ ] `server/src/services/StoryBuilderOrchestrator.ts` exists
- [ ] `executePlan()` sorts items, writes YAML, applies links, validates, migrates
- [ ] Atomic write helper works (`.tmp` + `rename`)
- [ ] Topological sort handles cycles gracefully (throws clear error)
- [ ] Link application merges arrays without duplicates
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes

## Next Milestone

→ [Milestone 6: Server Routes](M06-server-routes.md)