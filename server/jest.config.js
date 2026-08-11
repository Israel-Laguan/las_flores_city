/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@las-flores/shared$': '<rootDir>/../shared/src/index.ts',
    '^@las-flores/infra$': '<rootDir>/../infra/src/index.ts',
  },
  transformIgnorePatterns: ['/node_modules/(?!@las-flores/shared/|@las-flores/infra/)'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: ['**/*.test.ts'],
  testTimeout: 15000,
  // Auto-clean mocks between tests so parallel worker reuse can never leak
  // spies (e.g. process.cwd, fs.promises.*, console.warn) or stale call
  // counts across test files.  restoreMocks runs jest.restoreAllMocks()
  // before every test — restoring any jest.spyOn() spy to its original
  // implementation.  clearMocks runs jest.clearAllMocks() before every
  // test — resetting mock.calls / mock.results so assertion counts stay
  // scoped to the current test.  Neither option affects jest.mock()
  // factory implementations, so module-level auto-mocks are preserved.
  clearMocks: true,
  restoreMocks: true,
  globalSetup: '<rootDir>/tests/globalSetup.cjs',
  globalTeardown: '<rootDir>/tests/globalTeardown.cjs',
};
