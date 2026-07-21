/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@las-flores/shared$': '<rootDir>/../shared/src/index.ts',
  },
  transformIgnorePatterns: ['/node_modules/(?!@las-flores/shared/)'],
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
  globalSetup: '<rootDir>/tests/globalSetup.cjs',
  globalTeardown: '<rootDir>/tests/globalTeardown.cjs',
};
