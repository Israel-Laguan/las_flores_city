import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import { uploadToMinio } from '../src/services/StorageService.js';

// Restore said gold-reference portrait objects that vanished from MinIO,
// uploading local PNGs at the EXACT keys their YAML already references.
// Does not edit any prompt/yaml content.
const SLUG = 'adeyemi_ogunbiyi';
const MAP = ['default','vulnerable','shocked','calculating','tender'];
const assets = path.resolve(process.cwd(), 'content/characters', SLUG, 'assets');
for (const expr of MAP) {
  const f = `${SLUG}__${expr}.png`;
  const full = path.join(assets, f);
  if (!fs.existsSync(full)) { console.log('skip (missing local):', f); continue; }
  const buf = fs.readFileSync(full);
  const url = await uploadToMinio(buf, `portraits/${SLUG}/${f}`, 'image/png');
  console.log('uploaded:', url, '('+buf.length+' bytes)');
}
