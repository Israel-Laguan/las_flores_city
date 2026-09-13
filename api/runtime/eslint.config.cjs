// Extends the shared base config at the repo root; add workspace-specific
// overrides here rather than duplicating the base rules.
// Boundary rule supplied for this zone (see api/eslint.boundary.cjs).
const boundary = require('../eslint.boundary.cjs');
module.exports = [
  ...require('../../eslint.config.base.cjs'),
  boundary({
    zone: { target: 'api/runtime', from: 'api/planning' },
    restrictedPackages: ['@las-flores/api-planning'],
  }),
];
