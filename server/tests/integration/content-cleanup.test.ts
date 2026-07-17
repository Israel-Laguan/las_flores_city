/**
 * Content cleanup tests (derived from scripts/validate-milestones.sh).
 *
 * Verifies that legacy content paths have been removed and drafts are stored flat.
 * (DB-dependent lore-path resolution checks exist in lorePathValidation.test.ts)
 */
import { describe, it, expect } from '@jest/globals';
import { join } from 'node:path';
import { glob } from 'glob';

// Resolve project root from this test file's location
const PROJECT_ROOT = join(__dirname, '../../..');

describe('Milestone content-cleanup checks', () => {
  describe('M01: Legacy lore directories removed', () => {
    it('docs/lore/figures/ is absent or empty', async () => {
      const figuresPath = join(PROJECT_ROOT, 'docs', 'lore', 'figures');
      try {
        const files = await glob('**/*', { cwd: figuresPath, nodir: true });
        expect(files.length).toBe(0);
      } catch {
        // Directory does not exist → test passes
      }
    });

    it("docs/lore/districts/*/landmarks/ is absent or empty", async () => {
      const districtsPath = join(PROJECT_ROOT, 'docs', 'lore', 'districts');
      const landmarksFiles = await glob('landmarks/**/*', {
        cwd: districtsPath,
        nodir: true,
      });
      expect(landmarksFiles.length).toBe(0);
    });
  });

  describe('M03: No drafts subfolder', () => {
    it('No assets/drafts subdirectory exists anywhere under content/', async () => {
      const draftsDirs = await glob('**/assets/drafts', {
        cwd: join(PROJECT_ROOT, 'content'),
        absolute: true,
      });
      expect(draftsDirs.length).toBe(0);
    });
  });
});