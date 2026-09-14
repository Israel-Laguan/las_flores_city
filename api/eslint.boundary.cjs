// api/eslint.boundary.cjs
// Shared boundary lint helper for the api/ workspaces (planning / runtime / contracts).
// Enforces the architectural rule: planning ↔ runtime forbidden both ways;
// contracts is a leaf — it may be imported by both, but may not import either.
// 
// Design per SC-102:
// - Zones use api/-relative paths + explicit basePath (computed from __dirname)
//   so import-x/no-restricted-paths is cwd-independent (works from repo root,
//   from inside api/*, from editors, etc.).
// - no-restricted-imports (paths + patterns) is specifier-based and thus also
//   cwd-independent.
// - Covers BOTH relative import forms (e.g. '../../runtime/...') AND package-name
//   forms (@las-flores/api-*) including subpath imports (@las-flores/api-*/dist/...).
// - Uses eslint-plugin-import-x (not eslint-plugin-import) for ESLint ~10.8 compat.

const path = require('path');
const importX = require('eslint-plugin-import-x');

const repoRoot = path.resolve(__dirname, '..');

module.exports = function makeBoundaryConfig({ zone, restrictedPackages = [] }) {
  const rules = {};

  if (zone) {
    rules['import-x/no-restricted-paths'] = ['error', {
      basePath: repoRoot,
      zones: Array.isArray(zone) ? zone : [zone],
    }];
  }

  if (restrictedPackages.length > 0) {
    const paths = restrictedPackages.map((pkg) => ({
      name: pkg,
      message: 'Architectural boundary violation: planning and runtime must not import each other (either direction). api/contracts is the only shared module.',
    }));
    const patterns = restrictedPackages.map((pkg) => ({
      group: [`${pkg}/**`],
      message: 'Architectural boundary violation (subpath import): planning and runtime must not import each other (either direction). api/contracts is the only shared module.',
    }));
    rules['no-restricted-imports'] = ['error', { paths, patterns }];
  }

  return {
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [
        importX.createNodeResolver({
          extensions: ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.jsx', '.tsx', '.json'],
        }),
      ],
    },
    rules,
  };
};
