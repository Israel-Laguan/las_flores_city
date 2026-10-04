// api/contracts/jest.config.cjs
// Jest configuration for api/contracts unit tests.

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    // NOTE: the backslashes must be doubled — in a JS string literal '\.'
    // collapses to '.', which would turn this into a match-any regex and
    // rewrite unrelated relative imports (e.g. ./nodejs -> ./nod).
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
};
