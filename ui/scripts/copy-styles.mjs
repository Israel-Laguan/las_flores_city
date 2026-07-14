import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = resolve(root, '../src/styles');
const dest = resolve(root, '../dist/styles');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[ui] copied styles -> ${dest}`);
