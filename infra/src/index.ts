// ============================================================
// @las-flores/infra — shared infrastructure wiring (M19)
//
// The DB + cache connection layer, extracted from the server monolith
// into its own workspace package. This is the seam that lets the M21
// process-split host the Game, Intake, and AI runtimes on the same
// pools/Redis handle without each redeclaring connection wiring.
//
// Everything exported from the server's old `database/connection.ts`
// and `database/redis.ts` is re-exported here under one barrel, so
// consumers simply `import { queryOLTP, ... } from '@las-flores/infra'`.
// ============================================================

// Database pools & query wrappers
export {
  oltpPool,
  olapPool,
  contentPool,
  queryOLTP,
  queryContent,
  queryOLAP,
  withOLTPTransaction,
  withOLAPTransaction,
  testConnections,
  closeConnections,
} from './connection.js';

// Redis cache helpers
export {
  getRedis,
  getCache,
  setCache,
  deleteCache,
  invalidatePattern,
  getContentVersion,
  setContentVersion,
  incrementContentVersion,
  closeRedis,
} from './redis.js';
