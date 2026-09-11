const { boundaryConfig } = require('../eslint.boundary.cjs');

module.exports = [
  ...require('../../eslint.config.base.cjs'),
  boundaryConfig({
    zones: [
      {
        target: './src',
        from: '../planning',
        message: 'SC-102: api/contracts must not import api/planning',
      },
      {
        target: './src',
        from: '../runtime',
        message: 'SC-102: api/contracts must not import api/runtime',
      },
    ],
    restrictedPackages: ['@las-flores/api-planning', '@las-flores/api-runtime'],
  }),
];
