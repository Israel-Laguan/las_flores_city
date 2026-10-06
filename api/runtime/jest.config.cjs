// api/runtime/jest.config.cjs
// Jest configuration for api/runtime unit tests (mirrors api/contracts).

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  // Fails when no tests exist (passWithNoTests stays off) so a silent no-op can't return.
  passWithNoTests: false,
  // Same hygiene as server/jest.config.js (AGENTS.md §Test isolation rule 6).
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    // Resolve the contracts package from source so tests don't depend on dist/ (ESM).
    '^@las-flores/api-contracts$': '<rootDir>/../contracts/src/index.ts',
    // NOTE: backslashes doubled — see api/contracts/jest.config.cjs.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
};
