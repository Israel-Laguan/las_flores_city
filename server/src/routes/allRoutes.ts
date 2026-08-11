import express from 'express';
import { registerGameRoutes } from './gameRoutes.js';
import { registerIntakeRoutes } from './intakeRoutes.js';

/**
 * Combined route registrar — game routes + intake routes.
 *
 * Provided for tests and any combined runtime that wants the full route set.
 * Production runs the two entrypoints independently (see `server/src/index.ts`
 * for the game server and `server/src/intake.ts` for the intake worker).
 */
export function registerAllRoutes(app: express.Express): void {
  registerGameRoutes(app);
  registerIntakeRoutes(app);
}
