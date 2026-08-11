import express from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { registerGameRoutes } from './gameRoutes.js';
import { registerIntakeRoutes } from './intakeRoutes.js';

/**
 * Combined route registrar — game routes + intake routes.
 *
 * Provided for tests and any combined runtime that wants the full route set.
 * Production runs the two entrypoints independently (see `server/src/index.ts`
 * for the game server and `server/src/intake.ts` for the intake worker).
 *
 * Shared routers (/health, /auth) are mounted once here and skipped by the
 * sub-registrars to avoid duplicate registration.
 */
export function registerAllRoutes(app: express.Express): void {
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  registerGameRoutes(app, { skipShared: true });
  registerIntakeRoutes(app, { skipShared: true });
}
