/**
 * Admin Content Integration Tests
 * Tests for adminFetch helper usage and camelCase field normalization
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Admin API Routes Use adminFetch Helper', () => {
  const projectRoot = join(__dirname, '..', '..', '..');

  describe('Property 1: Admin API Routes Use adminFetch Helper', () => {
    it('migrate route should use adminFetch helper', () => {
      const routePath = join(projectRoot, 'admin', 'src', 'app', 'api', 'admin', 'content', 'migrate', 'route.ts');
      const content = readFileSync(routePath, 'utf-8');

      // Should import adminFetch
      expect(content).toMatch(/import.*adminFetch/);

      // Should use adminFetch
      expect(content).toMatch(/adminFetch\(/);
    });

    it('validate route should use adminFetch helper', () => {
      const routePath = join(projectRoot, 'admin', 'src', 'app', 'api', 'admin', 'content', 'validate', 'route.ts');
      const content = readFileSync(routePath, 'utf-8');

      // Should import adminFetch
      expect(content).toMatch(/import.*adminFetch/);

      // Should use adminFetch
      expect(content).toMatch(/adminFetch\(/);
    });

    it('status route should use adminFetch helper', () => {
      const routePath = join(projectRoot, 'admin', 'src', 'app', 'api', 'admin', 'content', 'status', 'route.ts');
      const content = readFileSync(routePath, 'utf-8');

      // Should import adminFetch
      expect(content).toMatch(/import.*adminFetch/);

      // Should use adminFetch
      expect(content).toMatch(/adminFetch\(/);
    });
  });

  describe('Property 2: Status Endpoint Normalizes File Fields', () => {
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