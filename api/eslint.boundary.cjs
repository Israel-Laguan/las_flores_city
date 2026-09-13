// SC-102: planning <-> runtime import boundary; contracts is a leaf.
// eslint-plugin-import-x is the ESLint 10-capable fork of eslint-plugin-import
// (eslint-plugin-import@2.32 peers only up to ESLint 9).
const importX = require('eslint-plugin-import-x');
const path = require('path');

function boundaryConfig({ zones, restrictedPackages }) {
  const apiDir = __dirname;
  return {
    files: ['**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        node: { extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs'] },
      },
      'import-x/extensions': ['.ts', '.tsx', '.js'],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones, basePath: apiDir }],
      'no-restricted-imports': [
        'error',
        {
          // Use only `patterns` (covers bare package name + subpaths via `/**`).
          // `paths` + `patterns` for the same spec caused duplicate SC-102 diagnostics.
          patterns: restrictedPackages.map((name) => ({
            group: [name, `${name}/**`],
            message: `SC-102: do not import ${name} across the planning/runtime/contracts boundary`,
          })),
        },
      ],
    },
  };
}

module.exports = { boundaryConfig };
