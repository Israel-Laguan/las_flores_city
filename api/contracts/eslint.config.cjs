const path = require('path');
const { boundaryConfig } = require('../eslint.boundary.cjs');

module.exports = [
  ...require('../../eslint.config.base.cjs'),
  boundaryConfig({
    zones: [
      {
        target: path.resolve(__dirname, 'src'),
        from: path.resolve(__dirname, '../planning'),
        message: 'SC-102: api/contracts must not import api/planning',
      },
      {
        target: path.resolve(__dirname, 'src'),
        from: path.resolve(__dirname, '../runtime'),
        message: 'SC-102: api/contracts must not import api/runtime',
      },
    ],
    restrictedPackages: ['@las-flores/api-planning', '@las-flores/api-runtime'],
  }),
];
