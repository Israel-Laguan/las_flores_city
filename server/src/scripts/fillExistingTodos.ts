import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockProvider } from '../services/MockProvider.js';
import { scanForTodoPlaceholders, type PlaceholderScanResult } from '../services/FillPlaceholders.js';
import { generateForItem } from '../services/LoreGenerator.js';
import { generatePromptForItem } from '../services/PromptFileGenerator.js';
import { contentPlanService } from '../services/ContentPlanService.js';
import { ContentPlanItemSchema } from '@las-flores/shared';
import type { ExistingContentContext } from '../services/types/LLMTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveContentDir(): string {
  const result = path.resolve(__dirname, '../../../content');
  return result;
}

async function main(): Promise<void> {
  console.log('[fillExistingTodos] Starting TODO placeholder scan...');

  const contentDir = resolveContentDir();
  console.log(`[fillExistingTodos] Content directory: ${contentDir}`);

  // Step 1: Scan for TODO placeholders
  const scan: PlaceholderScanResult = await scanForTodoPlaceholders(contentDir);

  console.log('\n[fillExistingTodos] Scan Results:');
  console.log(`  totalFiles: ${scan.totalFiles}`);
  console.log(`  filesWithTodo: ${scan.filesWithTodo}`);

  if (scan.items.length > 0) {
    console.log('\n[fillExistingTodos] Files with TODO placeholders:');
    for (const item of scan.items) {
      console.log(`  - ${item.yamlPath}`);
      if (item.mdPath) console.log(`    md: ${item.mdPath}`);
      if (item.promptPath) console.log(`    prompt: ${item.promptPath}`);
    }
  }

  if (scan.filesWithTodo === 0) {
    console.log('\n[fillExistingTodos] No TODO placeholders found. Exiting.');
    console.log(JSON.stringify({ filled: 0, skipped: 0, errors: [] }));
    return;
  }

  console.log(`\n[fillExistingTodos] Found ${scan.filesWithTodo} files with TODO placeholders. Starting fill...`);

  // Step 2: Gather context for the LLM provider
  const context: ExistingContentContext = await contentPlanService.gatherContext();

  // Step 3: Create MockProvider (not LiteLLM) for testing
  const provider = new MockProvider();

  // Step 4: Fill all placeholders with progress tracking
  // Note: generateForItem and generatePromptForItem use process.cwd() to resolve content dir
  // We need to chdir to the project root for these functions to work correctly
  const projectRoot = path.resolve(contentDir, '..');
  const originalCwd = process.cwd();
  process.chdir(projectRoot);

  const contentDirResolved = contentDir;
  let filled = 0;
  let skipped = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (let i = 0; i < scan.items.length; i++) {
    const { item, mdPath, promptPath } = scan.items[i];
    console.log(`[fillExistingTodos] Filling ${i + 1} of ${scan.items.length} files...`);

    // Ensure item has proper structure
    const validItem = ContentPlanItemSchema.safeParse(item);
    if (!validItem.success) {
      console.warn(`[fillExistingTodos] Invalid item structure for ${item.slug}:`, validItem.error);
      skipped++;
      continue;
    }

    try {
      // Fill .md file
      if (mdPath) {
        const mdResult = await generateForItem(validItem.data, provider, context, true);
        if (mdResult.createdFile) {
          filled++;
        } else if (mdResult.error) {
          errors.push({ path: mdPath, error: mdResult.error });
        } else {
          skipped++;
        }
      }

      // Fill .prompt.md file
      if (promptPath) {
        const promptResult = await generatePromptForItem(validItem.data, contentDirResolved, true);
        if (promptResult.createdFile) {
          filled++;
        } else if (promptResult.error) {
          errors.push({ path: promptPath, error: promptResult.error });
        } else {
          skipped++;
        }
      }
    } catch (err: any) {
      errors.push({ 
        path: mdPath || promptPath || item.slug, 
        error: err.message 
      });
    }
  }

  // Restore original working directory
  process.chdir(originalCwd);

  // Step 5: Report final results
  console.log('\n[fillExistingTodos] Fill Results:');
  console.log(`  filled: ${filled}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  errors: ${errors.length}`);

  if (errors.length > 0) {
    console.error('\n[fillExistingTodos] Errors encountered:');
    for (const error of errors) {
      console.error(`  - ${error.path}: ${error.error}`);
    }
  }

  const summary = {
    filled,
    skipped,
    errors: errors.length,
  };

  console.log('\n' + JSON.stringify(summary));
}

main().catch((err) => {
  console.error('[fillExistingTodos] Fatal error:', err);
  process.exit(1);
});
