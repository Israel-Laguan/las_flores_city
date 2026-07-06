import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import jsYaml from 'js-yaml';
import { authAndAdminMiddleware } from '../middleware/adminAuth.js';
import { validateContentPath, resolveContentDir } from './admin-content.js';

export const adminContentLinkRouter = express.Router();
adminContentLinkRouter.use(authAndAdminMiddleware);

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validateLinkInputs(body: Record<string, unknown>): { error: string } | { contentPath: string; fieldPath: string; action: string; value: string } {
  const cp = body.contentPath;
  const fp = body.fieldPath;
  const act = body.action;
  const val = body.value;
  if (!cp || typeof cp !== 'string') return { error: 'contentPath is required' };
  if (!fp || typeof fp !== 'string') return { error: 'fieldPath is required' };
  if (fp.split('.').some(p => DANGEROUS_KEYS.has(p))) return { error: 'Invalid fieldPath: disallowed segment' };
  if (!act || !['add', 'remove', 'set'].includes(act as string)) return { error: 'action must be "add", "remove", or "set"' };
  if (val === undefined || val === null || typeof val !== 'string') return { error: 'value is required (string)' };
  const pathCheck = validateContentPath(cp);
  if (!pathCheck.valid) return { error: (pathCheck as { valid: false; reason: string }).reason };
  return { contentPath: cp, fieldPath: fp, action: act as string, value: val };
}

function applyLinkAction(data: any, fieldPath: string, action: string, value: string): boolean {
  const parts = fieldPath.split('.');
  if (parts.some(p => DANGEROUS_KEYS.has(p))) {
    throw new Error('Invalid fieldPath: disallowed segment');
  }
  let target = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (target === undefined || target === null) return false;
    target = target[parts[i]];
  }
  if (!target) return false;
  const lastField = parts[parts.length - 1];
  const current = target[lastField];

  if (action === 'set') {
    target[lastField] = value;
  } else if (action === 'add') {
    if (!Array.isArray(current)) {
      target[lastField] = [value];
    } else if (!current.includes(value)) {
      current.push(value);
    }
  } else if (action === 'remove') {
    if (!Array.isArray(current)) return false;
    const idx = current.indexOf(value);
    if (idx === -1) return false;
    current.splice(idx, 1);
  }
  return true;
}

async function writeLinkedYaml(absolutePath: string, data: Record<string, unknown>): Promise<string> {
  const newYaml = jsYaml.dump(data, { lineWidth: -1, noRefs: true });
  jsYaml.load(newYaml);
  const tmpPath = `${absolutePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.promises.writeFile(tmpPath, newYaml, 'utf-8');
  await fs.promises.rename(tmpPath, absolutePath);
  return newYaml;
}

adminContentLinkRouter.post('/link', async (req, res) => {
  const parsed = validateLinkInputs(req.body as Record<string, unknown>);
  if ('error' in parsed) {
    res.status(400).json({ success: false, error: parsed.error, timestamp: new Date().toISOString() });
    return;
  }
  const { contentPath, fieldPath, action, value } = parsed;
  const absolutePath = path.resolve(resolveContentDir(), contentPath);

  try {
    const raw = await fs.promises.readFile(absolutePath, 'utf-8');
    const data = jsYaml.load(raw) as Record<string, unknown>;
    const mutated = applyLinkAction(data, fieldPath, action, value);
    if (!mutated) {
      res.status(400).json({ success: false, error: `No change: field path "${fieldPath}" not found or invalid for action "${action}"`, timestamp: new Date().toISOString() });
      return;
    }
    const newYaml = await writeLinkedYaml(absolutePath, data);
    res.json({ success: true, data: { contentPath, fieldPath, action, value, content: newYaml }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: `File not found: ${contentPath}`, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[admin-content-link] POST /link error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error', timestamp: new Date().toISOString() });
  }
});
