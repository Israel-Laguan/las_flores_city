/**
 * SC-102 Boundary Proof Test
 * 
 * This test programmatically proves the architectural boundary rule:
 * - planning <-> runtime forbidden both ways
 * - contracts is a leaf (can be imported by both, cannot import either)
 * 
 * Tests all 8 violation forms + 8 allowlisted forms.
 */
import { describe, test, expect } from '@jest/globals';
import { ESLint, type Linter } from 'eslint';
import path from 'path';

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
    content: `import { something } from '../runtime/src/index';
`,
  },

  // runtime -> planning (relative import)
  'runtime_to_planning_relative': {
    name: 'runtime_to_planning_relative.ts',
    content: `import { something } from '../planning/src/index';
`,
  },

  // contracts -> planning (relative import)
  'contracts_to_planning_relative': {
    name: 'contracts_to_planning_relative.ts',
    content: `import { something } from '../planning/src/index';
`,
  },

  // contracts -> runtime (relative import)
  'contracts_to_runtime_relative': {
    name: 'contracts_to_runtime_relative.ts',
    content: `import { something } from '../runtime/src/index';
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
    content: `import { FlagDefinition } from '../contracts/src/flags/flag-definition';
`,
  },

  // runtime -> contracts (relative import)
  'runtime_to_contracts_relative': {
    name: 'runtime_to_contracts_relative.ts',
    content: `import { ConditionExpr, evaluate } from '../contracts/src/index';
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
    content: `import { ConditionExpr } from '../contracts/src/condition/expression';
`,
  },

  // runtime -> contracts subpath (relative import)
  'runtime_to_contracts_subpath_relative': {
    name: 'runtime_to_contracts_subpath_relative.ts',
    content: `import { flag, and } from '../contracts/src/condition/expression';
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

// ESLint 10 is flat-config only: useEslintrc / rulePaths / string-array plugins
// were removed, and spreading a zone's exported config array into the legacy
// baseConfig produced numeric object keys rather than passing the array.
//
// The zone config is require()d and handed over as `overrideConfig` (with
// overrideConfigFile: true so ESLint stops looking for a config file) instead of
// via `overrideConfigFile: <path>` — the latter makes ESLint dynamically
// import() the file, which needs --experimental-vm-modules and fails under
// ts-jest. The zone file already spreads the shared base config and the
// boundary helper, so nothing else needs composing.
async function getESLintForZone(zone: string): Promise<ESLint> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const zoneConfig = require(path.join(API_DIR, zone, 'eslint.config.cjs')) as Linter.Config[];
  return new ESLint({
    cwd: API_DIR,
    overrideConfigFile: true,
    overrideConfig: zoneConfig,
  });
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Lint fixture text as if it lived at the ROOT of api/<zone>.
 *
 * The file path matters: import-x/no-restricted-paths resolves relative
 * specifiers against the linted file's location, and the boundary zones are
 * declared repo-root-relative. Fixtures under /tmp resolved nothing, so the rule
 * never matched. The fixtures also rely on the sibling-zone layout
 * (`../runtime/...` from `api/planning/...`), which only holds at the zone root —
 * hence not `api/<zone>/src/`.
 */
async function lintFixture(
  eslint: ESLint,
  zone: string,
  content: string,
  fileName: string,
): Promise<ESLint.LintResult[]> {
  return eslint.lintText(content, {
    filePath: path.join(API_DIR, zone, fileName),
  });
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

        const eslint = await getESLintForZone(zone);
        const results = await lintFixture(eslint, zone, fixture.content, fixture.name);

        // Should have at least one lint error
        expect(results[0].errorCount).toBeGreaterThan(0);

        // Should have boundary rule errors
        const hasBoundaryError = hasBoundaryRuleError(results[0].messages);
        expect(hasBoundaryError).toBe(true);

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

        const eslint = await getESLintForZone(zone);
        const results = await lintFixture(eslint, zone, fixture.content, fixture.name);

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

      });
    }
  });

  // ============================================================
  // Direct Import Tests
  // ============================================================

  describe('direct import.x/no-restricted-paths tests', () => {
    test('planning -> runtime relative path is blocked', async () => {
      const content = `import { runtimeReady } from '../runtime/src/index';`;

      const eslint = await getESLintForZone('planning');
      const results = await lintFixture(eslint, 'planning', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('runtime -> planning relative path is blocked', async () => {
      const content = `import { planningReady } from '../planning/src/index';`;

      const eslint = await getESLintForZone('runtime');
      const results = await lintFixture(eslint, 'runtime', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('contracts -> planning relative path is blocked', async () => {
      const content = `import { planningReady } from '../planning/src/index';`;

      const eslint = await getESLintForZone('contracts');
      const results = await lintFixture(eslint, 'contracts', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('contracts -> runtime relative path is blocked', async () => {
      const content = `import { runtimeReady } from '../runtime/src/index';`;

      const eslint = await getESLintForZone('contracts');
      const results = await lintFixture(eslint, 'contracts', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'import-x/no-restricted-paths',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });
  });

  // ============================================================
  // Package Import Tests
  // ============================================================

  describe('no-restricted-imports tests', () => {
    test('planning -> @las-flores/api-runtime is blocked', async () => {
      const content = `import { runtimeReady } from '@las-flores/api-runtime';`;

      const eslint = await getESLintForZone('planning');
      const results = await lintFixture(eslint, 'planning', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('runtime -> @las-flores/api-planning is blocked', async () => {
      const content = `import { planningReady } from '@las-flores/api-planning';`;

      const eslint = await getESLintForZone('runtime');
      const results = await lintFixture(eslint, 'runtime', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('contracts -> @las-flores/api-planning is blocked', async () => {
      const content = `import { planningReady } from '@las-flores/api-planning';`;

      const eslint = await getESLintForZone('contracts');
      const results = await lintFixture(eslint, 'contracts', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });

    test('contracts -> @las-flores/api-runtime is blocked', async () => {
      const content = `import { runtimeReady } from '@las-flores/api-runtime';`;

      const eslint = await getESLintForZone('contracts');
      const results = await lintFixture(eslint, 'contracts', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages.length).toBeGreaterThan(0);

    });
  });

  // ============================================================
  // Allowlisted Package Import Tests
  // ============================================================

  describe('allowlisted package imports pass', () => {
    test('planning -> @las-flores/api-contracts is allowed', async () => {
      const content = `import { FlagDefinition } from '@las-flores/api-contracts';`;

      const eslint = await getESLintForZone('planning');
      const results = await lintFixture(eslint, 'planning', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages).toHaveLength(0);

    });

    test('runtime -> @las-flores/api-contracts is allowed', async () => {
      const content = `import { ConditionExpr } from '@las-flores/api-contracts';`;

      const eslint = await getESLintForZone('runtime');
      const results = await lintFixture(eslint, 'runtime', content, 'test.ts');

      const boundaryMessages = results[0].messages.filter((msg) =>
        msg.ruleId === 'no-restricted-imports',
      );
      expect(boundaryMessages).toHaveLength(0);

    });
  });
});
