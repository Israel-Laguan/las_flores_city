const { boundaryConfig } = require('../eslint.boundary.cjs');

module.exports = [
  ...require('../../eslint.config.base.cjs'),
  boundaryConfig({
    zones: [
      {
        target: 'planning/src',
        from: 'runtime',
        message: 'SC-102: api/planning must not import api/runtime',
      },
    ],
    restrictedPackages: ['@las-flores/api-runtime'],
  }),
];
