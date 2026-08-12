import express from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';

// Admin + content tooling route mounts (M21 intake-worker).
import { assetsRouter } from './assets.js';
import { assetsImportRouter } from './assets-import.js';
import { adminContentRouter } from './admin-content.js';
import { adminContentLinkRouter } from './admin-content-link.js';
import { adminContentAssetRouter } from './admin-content-asset.js';
import { adminContentResolverRouter } from './admin-content-resolver.js';
import { adminCoverageRouter } from './admin-coverage.js';
import { adminLoreRouter } from './admin-lore.js';
import { adminStoryBeatsRouter } from './admin-story-beats.js';
import { adminAiConfigRouter } from './admin-ai-config.js';
import { adminListViewsRouter } from './admin-list-views.js';
import { adminStoryBuilderRouter } from './admin-story-builder.js';
import { adminAssetRouter } from './admin-asset.js';
import { adminStatsRouter } from './admin-stats.js';
import { adminAnalyticsRouter } from './admin-analytics.js';
import { adminUsersRouter } from './admin-users.js';
import { adminSettingsRouter } from './admin-settings.js';

/**
 * Admin / content-authoring route mounts for the intake-worker process (M21).
 *
 * The intake-worker owns the content engine (migrations, upserts, validation),
 * the StoryBuilder / LLM / Plan services, and the ContentAssetWorker. It is the
 * ONLY process that runs `runAllMigrations()` (and therefore the
 * `content_migration` advisory-lock reconcile), so AI generation never blocks
 * the game event loop or its DB pool. The `auth` router is shared here only
 * because admin-auth endpoints (`/auth/admin-login`, `/auth/admin-me`, etc.)
 * live in the same module as player login.
 */
export function registerIntakeRoutes(app: express.Express, opts?: { skipShared?: boolean }): void {
  if (!opts?.skipShared) {
    app.use('/health', healthRouter);
    app.use('/auth', authRouter);
  }

  app.use('/assets', assetsRouter);
  app.use('/assets', assetsImportRouter);
  app.use('/admin/content', adminContentRouter);
  app.use('/admin/content', adminContentLinkRouter);
  app.use('/admin/content', adminContentAssetRouter);
  app.use('/admin/content', adminContentResolverRouter);
  app.use('/admin/coverage', adminCoverageRouter);
  app.use('/admin/lore', adminLoreRouter);
  app.use('/admin/story-beats', adminStoryBeatsRouter);
  // Also expose story-arc at the path the admin client expects
  app.use('/admin/story-arc', (req, res, next) => {
    req.url = '/story-arc' + req.url;
    adminStoryBeatsRouter(req, res, next);
  });
  app.use('/admin/ai-config', adminAiConfigRouter);
  app.use('/admin', adminListViewsRouter);
  app.use('/admin/story-builder', adminStoryBuilderRouter);
  app.use('/admin/asset', adminAssetRouter);
  app.use('/admin/stats', adminStatsRouter);
  app.use('/admin/analytics', adminAnalyticsRouter);
  app.use('/admin/users', adminUsersRouter);
  app.use('/admin/settings', adminSettingsRouter);
}
