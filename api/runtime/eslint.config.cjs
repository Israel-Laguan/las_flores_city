const { boundaryConfig } = require('../eslint.boundary.cjs');

module.exports = [
  ...require('../../eslint.config.base.cjs'),
  boundaryConfig({
    zones: [
      {
        target: 'runtime/src',
        from: 'planning',
        message: 'SC-102: api/runtime must not import api/planning',
      },
    ],
    restrictedPackages: ['@las-flores/api-planning'],
  }),
];
