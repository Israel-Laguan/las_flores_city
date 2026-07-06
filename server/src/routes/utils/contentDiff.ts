import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { queryOLTP } from '../../database/connection.js';

export interface DiffFile {
  filePath: string;
  checksum: string | null;
  status: 'unchanged' | 'new' | 'modified' | 'deleted' | 'error';
  knownChecksum: string | null;
}

export async function computeContentDiff(contentDir: string) {
  const files: string[] = [];
  async function walkDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        files.push(fullPath);
      }
    }
  }
  await walkDir(contentDir);

  const checksumResult = await queryOLTP(
    `SELECT file_path, file_checksum FROM migration_log`
  );
  const knownChecksums = new Map<string, string>();
  for (const row of checksumResult.rows) {
    knownChecksums.set(row.file_path, row.file_checksum);
  }

  const currentPaths = new Set(files.map(f => path.relative(contentDir, f)));

  const fileResults = await Promise.all(
    files.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        const relativePath = path.relative(contentDir, filePath);
        const known = knownChecksums.get(relativePath);

        let status: 'unchanged' | 'new' | 'modified';
        if (!known) {
          status = 'new';
        } else if (known === checksum) {
          status = 'unchanged';
        } else {
          status = 'modified';
        }

        return {
          filePath: relativePath,
          checksum,
          status,
          knownChecksum: known || null,
        };
      } catch {
        const relativePath = path.relative(contentDir, filePath);
        return {
          filePath: relativePath,
          checksum: null,
          status: 'error' as const,
          knownChecksum: knownChecksums.get(relativePath) || null,
        };
      }
    })
  );

  const deletedResults: Array<{ filePath: string; checksum: null; status: 'deleted'; knownChecksum: string }> = [];
  for (const [filePath, checksum] of knownChecksums) {
    if (!currentPaths.has(filePath)) {
      deletedResults.push({
        filePath,
        checksum: null,
        status: 'deleted',
        knownChecksum: checksum,
      });
    }
  }

  const results = [...fileResults, ...deletedResults];

  return {
    totalFiles: results.length,
    newFiles: results.filter(r => r.status === 'new').length,
    modifiedFiles: results.filter(r => r.status === 'modified').length,
    unchangedFiles: results.filter(r => r.status === 'unchanged').length,
    deletedFiles: results.filter(r => r.status === 'deleted').length,
    files: results,
  };
}
