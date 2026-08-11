import { type ContentPlan, type ContentPlanItem, type HarnessFinding } from '@las-flores/shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import { contentPlanService } from '../services/ContentPlanService.js';
import { resolveFilePath, generateYaml } from '../services/ContentSkeletonGenerator.js';
import { runValidationHarness } from '../services/ValidationHarnessService.js';

export async function scaffoldPlanItems(
  items: ContentPlanItem[],
  contentDir: string,
): Promise<string[]> {
  const createdFiles: string[] = [];
  for (const item of items) {
    const filePath = resolveFilePath(item);
    const fullPath = path.join(contentDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const yamlContent = generateYaml(item);
    // Exclusive create ('wx') — never overwrite a target that appeared since the
    // conflict scan. Any failure throws and aborts the whole scaffold, letting
    // the caller roll back this request's already-created files.
    await fs.writeFile(fullPath, yamlContent, { encoding: 'utf-8', flag: 'wx' });
    createdFiles.push(filePath);
  }
  return createdFiles;
}

/** Best-effort removal of files created by THIS request (rollback on failure). */
export async function removeScaffoldedFiles(createdFiles: string[], contentDir: string): Promise<void> {
  for (const file of createdFiles) {
    try {
      await fs.rm(path.join(contentDir, file), { force: true });
    } catch (err) {
      console.warn(`[story-builder] Failed to clean up scaffolded file ${file}:`, (err as Error).message);
    }
  }
}

/**
 * Deterministic pre-approve harness gate (M20) run at the scaffold boundary —
 * BEFORE any file is written. Enforces the same hard gate the approve-and-solidify
 * worker runs, so a plan can never be scaffolded/staged with an error-severity
 * finding. Returns the blocking (error-severity) findings, or `null` when the
 * harness could not be evaluated (fail-open: log + continue, since the
 * approve-and-solidify worker still enforces the gate authoritatively).
 */
export async function runScaffoldHarnessGate(
  plan: ContentPlan,
): Promise<HarnessFinding[] | null> {
  try {
    const context = await contentPlanService.gatherContext();
    const report = runValidationHarness(plan, context);
    return report.findings.filter((f) => f.severity === 'error');
  } catch (harnessErr: any) {
    console.warn('[story-builder] Validation harness context failed; skipping scaffold gate (approve-and-solidify still enforces):', (harnessErr as Error).message);
    return null;
  }
}

export function buildPlanEventData(
  trimmedDesc: string,
  plan: any,
  createdFileCount: number,
  usage?: any,
): Record<string, unknown> {
  const eventData: Record<string, unknown> = {
    descriptionLength: trimmedDesc.length,
    itemCount: plan.items.length,
    createdFiles: createdFileCount,
    scaffolded: true,
    outlineSource: plan._meta.outline_source,
    outlineRepaired: plan._meta.outline_repaired,
  };
  if (usage) {
    eventData.totalTokens = usage.totalTokens;
    eventData.promptTokens = usage.promptTokens;
    eventData.completionTokens = usage.completionTokens;
    eventData.model = usage.model;
    eventData.estimatedCostUsd = usage.estimatedCostUsd;
  }
  return eventData;
}

export function buildPlanErrorResponse(error: any, description?: string): { status: number; body: Record<string, any> } {
  const errorDetails: Record<string, any> = {
    message: error.message,
    name: error.name,
    stack: error.stack?.substring(0, 500),
  };
  if (error.baseUrl) errorDetails.litellmUrl = error.baseUrl;
  if (error.model) errorDetails.model = error.model;
  if (error.timeoutMs) errorDetails.timeoutMs = error.timeoutMs;
  if (error.cause) errorDetails.cause = String(error.cause);

  console.error('[story-builder] POST /plan error:', {
    error: errorDetails,
    description: description?.substring(0, 100) || 'N/A',
  });

  let clientError = 'Failed to generate plan';
  if (error.message?.includes('LiteLLM') || error.baseUrl) {
    clientError = `LLM service error: ${error.message?.split('\n')[0] || clientError}`;
  } else if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
    clientError = 'LLM request timed out. Check LiteLLM connectivity.';
  } else if (error.message?.includes('conflict')) {
    clientError = error.message;
  }

  return {
    status: 500,
    body: {
      success: false,
      error: clientError,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      timestamp: new Date().toISOString(),
    },
  };
}
