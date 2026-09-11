// SC-102: planning <-> runtime import boundary; contracts is a leaf.
// eslint-plugin-import-x is the ESLint 10-capable fork of eslint-plugin-import
// (eslint-plugin-import@2.32 peers only up to ESLint 9).
const importX = require('eslint-plugin-import-x');

function boundaryConfig({ zones, restrictedPackages }) {
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
      'import-x/no-restricted-paths': ['error', { zones }],
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedPackages.map((name) => ({
            name,
            message: `SC-102: do not import ${name} across the planning/runtime/contracts boundary`,
          })),
        },
      ],
    },
  };
}

module.exports = { boundaryConfig };
