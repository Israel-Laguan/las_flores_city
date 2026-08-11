import express from 'express';
import cors from 'cors';
import { cookieParserMiddleware } from './utils/cookies.js';

/**
 * Process-split shared Express app builder (M21).
 *
 * Both the game-server and the intake-worker mount the same base middleware
 * (cookie parsing, CORS, JSON body parsing, the `/api` prefix strip, and the
 * terminal error handler) but register *different* route sets via
 * `registerRoutes`. This is the seam that lets one codebase run two isolated
 * processes on the same DB/cache pools without each redeclaring wiring.
 */
export type RouteRegistrar = (app: express.Express) => void;

export function createApp(registerRoutes: RouteRegistrar): express.Express {
  const app = express();

  // Cookie parser — populates req.cookies from the Cookie header (no cookie-parser dep)
  app.use(cookieParserMiddleware);

  // CORS — env-driven allowlist; true = reflect request origin (dev / same-domain prod)
  const corsOrigins = process.env.CLIENT_ORIGIN_URL
    ? process.env.CLIENT_ORIGIN_URL.split(',').map((s: string) => s.trim())
    : null;
  app.use(cors({
    origin: corsOrigins ?? true,
    credentials: true,
  }));
  app.use(express.json({ limit: '512kb' }));

  // Accept /api prefix on all routes — used by test direct-backend calls in CI
  // and by production reverse proxies. The Vite dev server strips /api before
  // forwarding, so this middleware is a no-op when running behind Vite.
  app.use((req, _res, next) => {
    if (req.url.startsWith('/api/')) {
      req.url = req.url.slice(4);
    }
    next();
  });

  registerRoutes(app);

  // Terminal error handler shared by both processes.
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Handle payload too large (body-parser entity.too.large)
    if ((err as any).type === 'entity.too.large' || (err as any).status === 413) {
      res.status(413).json({
        success: false,
        error: 'Your input is too large. Try breaking it into a shorter description (under 512KB).',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Handle malformed JSON body parse errors
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
      res.status(400).json({
        success: false,
        error: 'Malformed JSON in request body.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
