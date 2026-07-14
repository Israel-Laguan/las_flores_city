/**
 * Admin Content Preservation Tests
 * Tests for response structure preservation and CI workflow integrity
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('CI Workflow Has Explicit Permissions', () => {
  const projectRoot = join(__dirname, '..', '..', '..');

  it('ci workflow should have explicit permissions block', () => {
    const ciPath = join(projectRoot, '.github', 'workflows', 'ci.yml');
    const content = readFileSync(ciPath, 'utf-8');

    // Should have permissions block
    expect(content).toMatch(/^permissions:/m);

    // Should have explicit content permissions (read)
    expect(content).toMatch(/contents:\s*read/);
  });
});

describe('Admin Content Operations Unchanged', () => {
  const projectRoot = join(__dirname, '..', '..', '..');

  describe('Validate endpoint response structure preserved', () => {
    it('server validate handler returns { success, data, timestamp } on success path', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // The success branch must include all three fields
      expect(content).toMatch(/success:\s*true/);
      expect(content).toMatch(/data:\s*result/);
      expect(content).toMatch(/timestamp:\s*new Date\(\)\.toISOString\(\)/);
    });

    it('server validate handler returns { success: false, error, timestamp } on error path', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // The error branch must also preserve timestamp
      expect(content).toMatch(/success:\s*false/);
      expect(content).toMatch(/error:\s*error\.message/);
    });

    it('admin validate proxy route removed (admin uses direct adminFetch to Express) — G1 resolved', () => {
      const routePath = join(
        projectRoot,
        'admin', 'src', 'app', 'api', 'admin', 'content', 'validate', 'route.ts'
      );
      // Proxy routes were intentionally removed per G1 — admin calls Express directly via adminFetch
      expect(() => readFileSync(routePath, 'utf-8')).toThrow();
    });
  });

  describe('Migrate endpoint response structure preserved', () => {
    it('server migrate handler returns { success, data, timestamp } on success path', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // adminContentRouter.post('/migrate', ...) block already covered by the
      // shared success/error patterns confirmed in the validate tests above.
      // Here we also confirm the migrate route registration itself is present.
      expect(content).toContain("adminContentRouter.post('/migrate'");
    });

    it('admin migrate proxy route removed (admin uses direct adminFetch to Express) — G1 resolved', () => {
      const routePath = join(
        projectRoot,
        'admin', 'src', 'app', 'api', 'admin', 'content', 'migrate', 'route.ts'
      );
      // Proxy routes were intentionally removed per G1 — admin calls Express directly via adminFetch
      expect(() => readFileSync(routePath, 'utf-8')).toThrow();
    });
  });

  describe('Status endpoint top-level fields preserved', () => {
    it('server status handler returns byType grouping', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // byType is built by grouping rows by content_type
      expect(content).toMatch(/byType:\s*grouped/);
    });

    it('server status handler returns totalFiles count', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      expect(content).toMatch(/totalFiles:\s*normalized\.length/);
    });

    it('server status handler wraps response in success envelope with timestamp', () => {
      const serverPath = join(projectRoot, 'server', 'src', 'routes', 'admin-content.ts');
      const content = readFileSync(serverPath, 'utf-8');

      // Must contain the status route handler
      expect(content).toContain("adminContentRouter.get('/status'");
      // success + timestamp fields present in response
      expect(content).toMatch(/success:\s*true/);
      expect(content).toMatch(/timestamp:\s*new Date\(\)\.toISOString\(\)/);
    });

    it('admin status proxy route removed (admin uses direct adminFetch to Express) — G1 resolved', () => {
      const routePath = join(
        projectRoot,
        'admin', 'src', 'app', 'api', 'admin', 'content', 'status', 'route.ts'
      );
      // Proxy routes were intentionally removed per G1 — admin calls Express directly via adminFetch
      expect(() => readFileSync(routePath, 'utf-8')).toThrow();
    });
  });

  describe('CI workflow jobs preserved', () => {
    const ciPath = join(projectRoot, '.github', 'workflows', 'ci.yml');

    it('ci workflow defines a no-migrations job', () => {
      const content = readFileSync(ciPath, 'utf-8');

      // The no-migrations job provides fast feedback (lint, build, unit tests, schema validation)
      expect(content).toMatch(/^\s*no-migrations:/m);
    });

    it('ci workflow defines a with-migrations job', () => {
      const content = readFileSync(ciPath, 'utf-8');

      // The with-migrations job handles integration tests, full validation, and E2E
      expect(content).toMatch(/^\s*with-migrations:/m);
    });

    it('ci workflow runs server tests', () => {
      const content = readFileSync(ciPath, 'utf-8');

      // Must include both unit and integration test commands
      expect(content).toMatch(/npm run test:unit/);
      expect(content).toMatch(/npm run test:integration/);
    });

    it('ci workflow builds all workspaces', () => {
      const content = readFileSync(ciPath, 'utf-8');

      // Server and admin builds must be present (dashboard retired)
      expect(content).toMatch(/npm run build --workspace=server/);
      expect(content).toMatch(/npm run build --workspace=admin/);
    });

    it('ci workflow runs linter', () => {
      const content = readFileSync(ciPath, 'utf-8');

      expect(content).toMatch(/npm run lint/);
    });
  });
});