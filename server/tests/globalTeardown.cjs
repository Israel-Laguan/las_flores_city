require('tsx/cjs');

const { closeConnections } = require('../src/database/connection.ts');
const { closeRedis } = require('../src/database/redis.ts');

module.exports = async function globalTeardown() {
  await closeConnections();
  await closeRedis();
};
