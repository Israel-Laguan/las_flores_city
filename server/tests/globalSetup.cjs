const path = require('path');

const DEFAULT_DB = 'postgresql://las_flores:las_flores_dev_password@localhost:5434/las_flores';

module.exports = async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DB;
  }
  if (!process.env.ANALYTICS_DATABASE_URL) {
    process.env.ANALYTICS_DATABASE_URL = 'postgresql://las_flores_analytics:las_flores_analytics_dev_password@localhost:5433/las_flores_analytics';
  }
  process.env.PROMPT_ROOT = path.resolve(__dirname, '../../content');
};
