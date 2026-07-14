/**
 * Admin Content Integration Tests
 * Tests that admin content operations use the shared adminFetch helper and that
 * the server normalizes file fields to camelCase.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Admin Content Uses adminFetch Helper', () => {
  const projectRoot = join(__dirname, '..', '..', '..');

  describe('adminFetch helper is exported', () => {
    it('exports adminFetch from lib/client-api.ts', () => {
      const content = readFileSync(
        join(projectRoot, 'admin', 'src', 'lib', 'client-api.ts'),
        'utf-8',
      );

      expect(content).toMatch(/export\s+async\s+function\s+adminFetch/);
    });
  });

  describe('Admin pages call content endpoints via adminFetch', () => {
    it('migration page uses adminFetch for status and migrate', () => {
      const content = readFileSync(
        join(projectRoot, 'admin', 'src', 'app', 'migration', 'page.tsx'),
        'utf-8',
      );

      // Imports the shared helper
      expect(content).toMatch(/import\s+.*adminFetch.*from\s+['"]@\/lib\/client-api['"]/);

      // Calls the server status + migrate endpoints through it
      expect(content).toMatch(/adminFetch[<(]/);
      expect(content).toMatch(/['"]\/admin\/content\/status['"]/);
      expect(content).toMatch(/['"]\/admin\/content\/migrate['"]/);
    });

    it('validation page uses adminFetch for validate', () => {
      const content = readFileSync(
        join(projectRoot, 'admin', 'src', 'app', 'validation', 'page.tsx'),
        'utf-8',
      );

      expect(content).toMatch(/import\s+.*adminFetch.*from\s+['"]@\/lib\/client-api['"]/);
      expect(content).toMatch(/adminFetch[<(]/);
      expect(content).toMatch(/['"]\/admin\/content\/validate['"]/);
    });
  });

  describe('Status endpoint normalizes file fields', () => {
    it('status endpoint should transform files array to camelCase', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // The status endpoint uses normalized array with camelCase fields
      expect(content).toMatch(/normalized = result\.rows\.map/);

      // Verify specific field mappings exist
      expect(content).toMatch(/filePath:\s*row\.file_path/);
      expect(content).toMatch(/checksum:\s*row\.file_checksum/);
      expect(content).toMatch(/contentType:\s*row\.content_type/);
      expect(content).toMatch(/contentId:\s*row\.content_id/);
      expect(content).toMatch(/appliedAt:\s*row\.applied_at/);
    });
  });
});
