/**
 * SC-102 Boundary Proof Test
 * 
 * This test programmatically proves the architectural boundary rule:
 * - planning <-> runtime forbidden both ways
 * - contracts is a leaf (can be imported by both, cannot import either)
 * 
 * Tests all 8 violation forms + 8 allowlisted forms.
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ESLint } from 'eslint';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================
// Constants
// ============================================================

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const API_DIR = path.resolve(REPO_ROOT, 'api');

// Boundary rule name from the config
const BOUNDARY_RULE_NAMES = [
  'import-x/no-restricted-paths',
  'no-restricted-imports',
];

// ============================================================
// Fixture Files
// ============================================================

interface FixtureFile {
  name: string;
  content: string;
}

// 8 Violation forms to test
const VIOLATION_FIXTURES: Record<string, FixtureFile> = {
  // planning -> runtime (relative import)
  'planning_to_runtime_relative': {
    name: 'planning_to_runtime_relative.ts',
    content: `import { something } from '../runtime/src/index.js';
`,
  },

  // runtime -> planning (relative import)
  'runtime_to_planning_relative': {
    name: 'runtime_to_planning_relative.ts',
    content: `import { something } from '../planning/src/index.js';
`,
  },

  // contracts -> planning (relative import)
  'contracts_to_planning_relative': {
    name: 'contracts_to_planning_relative.ts',
    content: `import { something } from '../planning/src/index.js';
`,
  },

  // contracts -> runtime (relative import)
  'contracts_to_runtime_relative': {
    name: 'contracts_to_runtime_relative.ts',
    content: `import { something } from '../runtime/src/index.js';
`,
  },

  // planning -> @las-flores/api-runtime (package import)
  'planning_to_api_runtime_package': {
    name: 'planning_to_api_runtime_package.ts',
    content: `import { something } from '@las-flores/api-runtime';
`,
  },

  // runtime -> @las-flores/api-planning (package import)
  'runtime_to_api_planning_package': {
    name: 'runtime_to_api_planning_package.ts',
    content: `import { something } from '@las-flores/api-planning';
`,
  },

  // contracts -> @las-flores/api-planning (package import)
  'contracts_to_api_planning_package': {
    name: 'contracts_to_api_planning_package.ts',
    content: `import { something } from '@las-flores/api-planning';
`,
  },

  // contracts -> @las-flores/api-runtime (package import)
  'contracts_to_api_runtime_package': {
    name: 'contracts_to_api_runtime_package.ts',
    content: `import { something } from '@las-flores/api-runtime';
`,
  },
};

// 8 Allowlisted forms (planning/runtime -> contracts)
const ALLOWLISTED_FIXTURES: Record<string, FixtureFile> = {
  // planning -> contracts (relative import)
  'planning_to_contracts_relative': {
    name: 'planning_to_contracts_relative.ts',
    content: `import { FlagDefinition } from '../contracts/src/flags/flag-definition.js';
`,
  },

  // runtime -> contracts (relative import)
  'runtime_to_contracts_relative': {
    name: 'runtime_to_contracts_relative.ts',
    content: `import { ConditionExpr, evaluate } from '../contracts/src/index.js';
`,
  },

  // planning -> @las-flores/api-contracts (package import)
  'planning_to_api_contracts_package': {
    name: 'planning_to_api_contracts_package.ts',
    content: `import { FlagDefinition } from '@las-flores/api-contracts';
`,
  },

  // runtime -> @las-flores/api-contracts (package import)
  'runtime_to_api_contracts_package': {
    name: 'runtime_to_api_contracts_package.ts',
    content: `import { ConditionExpr, evaluate } from '@las-flores/api-contracts';
`,
  },

  // planning -> contracts subpath (relative import)
  'planning_to_contracts_subpath_relative': {
    name: 'planning_to_contracts_subpath_relative.ts',
    content: `import { ConditionExpr } from '../contracts/src/condition/expression.js';
`,
  },

  // runtime -> contracts subpath (relative import)
  'runtime_to_contracts_subpath_relative': {
    name: 'runtime_to_contracts_subpath_relative.ts',
    content: `import { flag, and } from '../contracts/src/condition/expression.js';
`,
  },

  // planning -> @las-flores/api-contracts subpath (package import)
  'planning_to_api_contracts_subpath_package': {
    name: 'planning_to_api_contracts_subpath_package.ts',
    content: `import { ConditionExpr } from '@las-flores/api-contracts/condition/expression';
`,
  },

  // runtime -> @las-flores/api-contracts subpath (package import)
  'runtime_to_api_contracts_subpath_package': {
    name: 'runtime_to_api_contracts_subpath_package.ts',
    content: `import { flag, and } from '@las-flores/api-contracts/condition/expression';
`,
  },
};

// ============================================================
// ESLint Setup
// ============================================================

async function getESLintForZone(zone: string): Promise<ESLint> {
  const eslint = new ESLint({
    cwd: API_DIR,
    useEslintrc: false,
    baseConfig: {
      // Use the base config from the repo
      extends: path.resolve(REPO_ROOT, 'eslint.config.base.cjs'),
      ...require(path.resolve(API_DIR, zone, 'eslint.config.cjs')),
    },
    rulePaths: [path.resolve(API_DIR, 'eslint.boundary.cjs')],
    plugins: ['import-x'],
  });

  return eslint;
}

// ============================================================
// Helper Functions
// ============================================================

function createTempDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-boundary-'));
  return tmpDir;
}

function writeFixture(tmpDir: string, fixture: FixtureFile, subDir: string = ''): string {
  const fullPath = path.join(tmpDir, subDir, fixture.name);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, fixture.content);
  return fullPath;
}

function cleanupTempDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if any of the boundary rule names appear in the lint messages.
 */
function hasBoundaryRuleError(messages: Array<{ ruleId: string }>): boolean {
  return messages.some((msg) => BOUNDARY_RULE_NAMES.includes(msg.ruleId));
}

/**
 * Check if a specific rule appears in the lint messages.
 */
function hasRuleError(messages: Array<{ ruleId: string }>, ruleId: string): boolean {
  return messages.some((msg) => msg.ruleId === ruleId);
}

// ============================================================
// Test Suites
// ============================================================

describe('SC-102 Boundary Enforcement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // ============================================================
  // Violation Tests
  // ============================================================

  describe('8 violation forms should fail the boundary rule', () => {
    const violationCases = [
      { name: 'planning_to_runtime_relative', zone: 'planning' },
      { name: 'runtime_to_planning_relative', zone: 'runtime' },
      { name: 'contracts_to_planning_relative', zone: 'contracts' },
      { name: 'contracts_to_runtime_relative', zone: 'contracts' },
      { name: 'planning_to_api_runtime_package', zone: 'planning' },
      { name: 'runtime_to_api_planning_package', zone: 'runtime' },
      { name: 'contracts_to_api_planning_package', zone: 'contracts' },
      { name: 'contracts_to_api_runtime_package', zone: 'contracts' },
    ];

    for (const { name, zone } of violationCases) {
      test(`${name}: ${zone} -> forbidden module`, async () => {
        const fixture = VIOLATION_FIXTURES[name];
        const fullPath = writeFixture(tmpDir, fixture, zone);

        const eslint = await getESLintForZone(zone);
        const results = await eslint.lintFiles([fullPath]);

        // Should have at least one lint error
        expect(results[0].errorCount).toBeGreaterThan(0);

        // Should have boundary rule errors
        const hasBoundaryError = hasBoundaryRuleError(results[0].messages);
        expect(hasBoundaryError).toBe(true);

        // Clean up
        await eslint.destroy();
      });
    }
  });

  // ============================================================
  // Allowlisted Tests
  // ============================================================

  describe('8 allowlisted forms (planning/runtime -> contracts) should pass', () => {
    const allowlistedCases = [
      { name: 'planning_to_contracts_relative', zone: 'planning' },
      { name: 'runtime_to_contracts_relative', zone: 'runtime' },
      { name: 'planning_to_api_contracts_package', zone: 'planning' },
      { name: 'runtime_to_api_contracts_package', zone: 'runtime' },
      { name: 'planning_to_contracts_subpath_relative', zone: 'planning' },
      { name: 'runtime_to_contracts_subpath_relative', zone: 'runtime' },
      { name: 'planning_to_api_contracts_subpath_package', zone: 'planning' },
      { name: 'runtime_to_api_contracts_subpath_package', zone: 'runtime' },
    ];

    for (const { name, zone } of allowlistedCases) {
      test(`${name}: ${zone} -> contracts is allowed`, async () => {
        const fixture = ALLOWLISTED_FIXTURES[name];
        const fullPath = writeFixture(tmpDir, fixture, zone);

        const eslint = await getESLintForZone(zone);
        const results = await eslint.lintFiles([fullPath]);

        // Should have no boundary rule errors
        const hasBoundaryError = hasBoundaryRuleError(results[0].messages);
        expect(hasBoundaryError).toBe(false);

        // Should have zero errors (or at least no boundary errors)
        // Note: There might be other lint errors (e.g., unused imports)
        // but there should be NO boundary rule errors
        const boundaryMessages = results[0].messages.filter((msg) =>
          BOUNDARY_RULE_NAMES.includes(msg.ruleId),
        );
        expect(boundaryMessages).toHaveLength(0);

        // Clean up
        await eslint.destroy();
      });
    }
  });

  // ============================================================
  // Direct Import Tests
  // ============================================================

  describe('direct import.x/no-restricted-paths tests', () => {
    test('planning -> runtime relative path is blocked', async () => {
      const content = `import { runtimeReady } from '../runtime/src/index.js';`;
      const fullPath = path.join(tmpDir, 'planning', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('planning');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('runtime -> planning relative path is blocked', async () => {
      const content = `import { planningReady } from '../planning/src/index.js';`;
      const fullPath = path.join(tmpDir, 'runtime', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('runtime');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('contracts -> planning relative path is blocked', async () => {
      const content = `import { planningReady } from '../planning/src/index.js';`;
      const fullPath = path.join(tmpDir, 'contracts', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('contracts');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('contracts -> runtime relative path is blocked', async () => {
      const content = `import { runtimeReady } from '../runtime/src/index.js';`;
      const fullPath = path.join(tmpDir, 'contracts', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('contracts');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });
  });

  // ============================================================
  // Package Import Tests
  // ============================================================

  describe('no-restricted-imports tests', () => {
    test('planning -> @las-flores/api-runtime is blocked', async () => {
      const content = `import { runtimeReady } from '@las-flores/api-runtime';`;
      const fullPath = path.join(tmpDir, 'planning', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('planning');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('runtime -> @las-flores/api-planning is blocked', async () => {
      const content = `import { planningReady } from '@las-flores/api-planning';`;
      const fullPath = path.join(tmpDir, 'runtime', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('runtime');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('contracts -> @las-flores/api-planning is blocked', async () => {
      const content = `import { planningReady } from '@las-flores/api-planning';`;
      const fullPath = path.join(tmpDir, 'contracts', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('contracts');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });

    test('contracts -> @las-flores/api-runtime is blocked', async () => {
      const content = `import { runtimeReady } from '@las-flores/api-runtime';`;
      const fullPath = path.join(tmpDir, 'contracts', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('contracts');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

      await eslint.destroy();
    });
  });

  // ============================================================
  // Allowlisted Package Import Tests
  // ============================================================

  describe('allowlisted package imports pass', () => {
    test('planning -> @las-flores/api-contracts is allowed', async () => {
      const content = `import { FlagDefinition } from '@las-flores/api-contracts';`;
      const fullPath = path.join(tmpDir, 'planning', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('planning');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages).toHaveLength(0);

      await eslint.destroy();
    });

    test('runtime -> @las-flores/api-contracts is allowed', async () => {
      const content = `import { ConditionExpr } from '@las-flores/api-contracts';`;
      const fullPath = path.join(tmpDir, 'runtime', 'test.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);

      const eslint = await getESLintForZone('runtime');
      const results = await eslint.lintFiles([fullPath]);

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages).toHaveLength(0);

      await eslint.destroy();
    });
  });
});
