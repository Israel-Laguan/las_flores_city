import express from 'express';
import path from 'node:path';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { playerRouter } from './player.js';
import { locationRouter } from './location.js';
import { dialogueRouter } from './dialogue.js';
import { bankRouter } from './bank.js';
import { gigsRouter } from './gigs.js';
import { commsRouter } from './comms.js';
import { feedRouter } from './feed.js';
import { vaultRouter } from './vault.js';
import { settingsRouter } from './settings.js';
import { patreonRouter } from './patreon.js';
import { shopRouter } from './shop.js';
import { paypalRouter } from './paypal.js';
import { archiveRouter } from './archive.js';
import { devRouter } from './dev.js';
import { mapRouter } from './map.js';
// Side-effect import: comms-reply registers its handler on the comms router.
import './comms-reply.js';

/**
 * Player-facing route mounts for the game-server process (M21).
 *
 * The game-server is a slim reader/writer of player state + content tables.
 * It intentionally does NOT mount any `admin-*` / asset-generation routes:
 * those live on the intake-worker so AI generation and content authoring can
 * never starve the game event loop or its DB pool.
 */
export function registerGameRoutes(app: express.Express, opts?: { skipShared?: boolean }): void {
  // Serve local content assets as a fallback when CDN is not configured. This
  // is a fallback for PUBLISHED asset files only — gate the mount so raw
  // authoring source files (.yaml, lore .md, .prompt.md image prompts, etc.)
  // sitting elsewhere in `content/` are never served to the public.
  const PUBLISHED_ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mp3|wav|woff2?|ttf)$/i;
  app.use('/assets', (req, res, next) => {
    if (!PUBLISHED_ASSET_EXT.test(req.path)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    next();
  });
  app.use('/assets', express.static(path.resolve(process.cwd(), 'content')));

  if (!opts?.skipShared) {
    app.use('/health', healthRouter);
    app.use('/auth', authRouter);
  }

  app.use('/player', playerRouter);
  app.use('/location', locationRouter);
  app.use('/dialogue', dialogueRouter);
  app.use('/bank', bankRouter);
  app.use('/gigs', gigsRouter);
  app.use('/comms', commsRouter);
  app.use('/network/feed', feedRouter);
  app.use('/vault', vaultRouter);
  app.use('/settings', settingsRouter);
  app.use('/patreon', patreonRouter);
  app.use('/shop', shopRouter);
  app.use('/paypal', paypalRouter);
  app.use('/dev', devRouter);
  app.use('/archive', archiveRouter);
  app.use('/map', mapRouter);
}
