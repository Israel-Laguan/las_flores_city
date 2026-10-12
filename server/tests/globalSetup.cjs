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
  // Cap per-worker pool sizes: every Jest worker is its own process with its
  // own oltpPool + contentPool against ONE Postgres (max_connections=100).
  // Unconstrained (50+10 per worker) the parallel integration-data phase
  // exhausts the server ("sorry, too many clients already" — CI #38113413767,
  // local repro peak 105 backends). Queries queue for at most
  // connectionTimeoutMillis (5s) under these caps, which is ample because
  // each query is millisecond-scale.
  if (!process.env.OLTP_POOL_MAX) process.env.OLTP_POOL_MAX = '5';
  if (!process.env.CONTENT_POOL_MAX) process.env.CONTENT_POOL_MAX = '3';
};
