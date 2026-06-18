import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOLTP, withOLTPTransaction } from '../database/connection.js';
import { invalidatePattern } from '../database/redis.js';

export const patreonRouter = Router();

const PATREON_CLIENT_ID = process.env.PATREON_CLIENT_ID;
const PATREON_CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET;
const PATREON_REDIRECT_URI = process.env.PATREON_REDIRECT_URI || 'http://localhost:3000/patreon/callback';
const PATREON_NSFW_TIER_IDS = (process.env.PATREON_NSFW_TIER_IDS || '').split(',').filter(Boolean);
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'https://play.lasflores2077.com';

function isConfigured(): boolean {
  return Boolean(PATREON_CLIENT_ID && PATREON_CLIENT_SECRET);
}

function evaluateTiers(identityData: any): { isNsfwUnlocked: boolean; highestTier: string } {
  let isNsfwUnlocked = false;
  let highestTier = 'none';
  const memberships = identityData?.data?.relationships?.memberships?.data || [];
  const included = identityData?.included || [];

  for (const membershipRef of memberships) {
    const membership = included.find((inc: any) => inc.id === membershipRef.id && inc.type === 'membership');
    if (!membership) continue;
    const entitledTiers = membership.relationships?.currently_entitled_tiers?.data || [];
    for (const tierRef of entitledTiers) {
      if (PATREON_NSFW_TIER_IDS.includes(tierRef.id)) {
        isNsfwUnlocked = true;
        highestTier = 'exclusive';
        break;
      }
      if (tierRef.id && highestTier === 'none') highestTier = 'supporter';
    }
    if (isNsfwUnlocked) break;
  }
  return { isNsfwUnlocked, highestTier };
}

// ── GET /patreon/link ──────────────────────────────────────────
// Initiates the Patreon OAuth 2.0 flow. Returns { url } for the
// client to redirect the browser to.
patreonRouter.get('/link', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Patreon integration not configured',
      timestamp: new Date().toISOString(),
    });
  }

  const userId = req.userId!;
  const url = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${PATREON_CLIENT_ID}&redirect_uri=${encodeURIComponent(PATREON_REDIRECT_URI!)}&state=${userId}&scope=identity%20identity.memberships`;

  res.json({ success: true, data: { url }, timestamp: new Date().toISOString() });
});

// ── GET /patreon/callback ──────────────────────────────────────
// Patreon redirects here after the user authorizes. Exchange the
// code for tokens, fetch the user's tier, update entitlements.
patreonRouter.get('/callback', async (req: any, res: Response) => {
  if (!isConfigured()) {
    return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=false`);
  }

  const { code, state: userId, error: authError } = req.query;

  if (authError || !code || !userId) {
    return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=false`);
  }

  try {
    // A. Exchange code for tokens
    const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        client_id: PATREON_CLIENT_ID!,
        client_secret: PATREON_CLIENT_SECRET!,
        redirect_uri: PATREON_REDIRECT_URI!,
      }),
    });

    if (!tokenRes.ok) {
      console.error('[Patreon] Token exchange failed:', tokenRes.status);
      return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=false`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
    };
    const { access_token, refresh_token } = tokenData;

    // B. Fetch user identity + memberships
    const identityRes = await fetch(
      'https://www.patreon.com/api/oauth2/v2/identity?include=memberships.currently_entitled_tiers&fields[tier]=id',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (!identityRes.ok) {
      console.error('[Patreon] Identity fetch failed:', identityRes.status);
      return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=false`);
    }

    const identityData = await identityRes.json() as any;
    const patreonId = identityData?.data?.id;

    // C. Evaluate tier membership
    const { isNsfwUnlocked, highestTier } = evaluateTiers(identityData);

    // D. Update user_entitlements atomically
    await withOLTPTransaction(async (client) => {
      await client.query(
        `INSERT INTO user_entitlements (user_id, patreon_id, patreon_access_token, patreon_refresh_token, is_nsfw_unlocked, patreon_tier)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id)
         DO UPDATE SET
           patreon_id = EXCLUDED.patreon_id,
           patreon_access_token = EXCLUDED.patreon_access_token,
           patreon_refresh_token = EXCLUDED.patreon_refresh_token,
           is_nsfw_unlocked = EXCLUDED.is_nsfw_unlocked,
           patreon_tier = EXCLUDED.patreon_tier`,
        [userId, patreonId, access_token, refresh_token, isNsfwUnlocked, highestTier]
      );
    });

    // E. Invalidate cached dialogue trees so the resolver picks up the new entitlement
    await invalidatePattern('dialogue:resolved:*');
    await invalidatePattern(`user:state:${userId}`);

    console.log(`[Patreon] User ${userId} linked: patreon_id=${patreonId}, nsfw=${isNsfwUnlocked}, tier=${highestTier}`);

    return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=true`);
  } catch (err) {
    console.error('[Patreon] Callback error:', err);
    return res.redirect(`${CLIENT_BASE_URL}?patreon_linked=false`);
  }
});

// ── GET /patreon/status ────────────────────────────────────────
// Returns the user's current Patreon link status and entitlement.
patreonRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const result = await queryOLTP<{
    patreon_id: string | null;
    is_nsfw_unlocked: boolean;
    patreon_tier: string;
  }>(
    `SELECT patreon_id, is_nsfw_unlocked, patreon_tier
     FROM user_entitlements
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];

  res.json({
    success: true,
    data: {
      linked: Boolean(row?.patreon_id),
      isNsfwUnlocked: row?.is_nsfw_unlocked || false,
      tier: row?.patreon_tier || 'none',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── POST /patreon/unlink ───────────────────────────────────────
// Removes the Patreon link and revokes NSFW entitlement.
patreonRouter.post('/unlink', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  await queryOLTP(
    `UPDATE user_entitlements
     SET patreon_id = NULL, patreon_access_token = NULL, patreon_refresh_token = NULL,
         is_nsfw_unlocked = FALSE, patreon_tier = 'none'
     WHERE user_id = $1`,
    [userId]
  );

  await invalidatePattern('dialogue:resolved:*');
  await invalidatePattern(`user:state:${userId}`);

  res.json({
    success: true,
    data: { linked: false, isNsfwUnlocked: false, tier: 'none' },
    timestamp: new Date().toISOString(),
  });
});

// ── POST /patreon/webhook ──────────────────────────────────────
// Stub for Patreon Webhook receiver. In production, this verifies
// the HMAC signature and handles membership deletion/update for
// real-time entitlement revocation. Currently a no-op placeholder.
patreonRouter.post('/webhook', async (req: any, res: Response) => {
  console.log('[Patreon] Webhook received (stub — not implemented)');
  res.status(200).json({ received: true });
});
