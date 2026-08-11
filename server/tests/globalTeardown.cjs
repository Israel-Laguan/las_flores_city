require('tsx/cjs');

const { closeConnections } = require('../../infra/src/connection.ts');
const { closeRedis } = require('../../infra/src/redis.ts');

module.exports = async function globalTeardown() {
  await closeConnections();
  await closeRedis();
};
