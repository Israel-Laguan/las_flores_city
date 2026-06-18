import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { BankService } from '../services/BankService.js';
import { recordIapCompletedEvent } from '../services/MarketplaceEvents.js';

export const paypalRouter = Router();

// ── PayPal config (12-Factor App: all from env) ───────────────────────
// PAYPAL_MODE=sandbox|live (default sandbox)
//   sandbox → https://api-m.sandbox.paypal.com
//   live    → https://api-m.paypal.com
// PAYPAL_CLIENT_ID, PAYPAL_SECRET — OAuth client credentials
// PAYPAL_WEBHOOK_ID — the webhook's stable id from the PayPal dashboard
//   (required for verify-webhook-signature)
// GOLD_CREDITS_PER_USD — grant rate (default 100). Live-ops knob:
//   "Double Gold Weekend" = set to 200 + restart, no code change.
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_BASE =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
const GOLD_CREDITS_PER_USD = parseInt(process.env.GOLD_CREDITS_PER_USD || '100', 10);

const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'https://play.lasflores2077.com';

function isConfigured(): boolean {
  return Boolean(PAYPAL_CLIENT_ID && PAYPAL_SECRET);
}

// ── PayPal OAuth: client_credentials grant (cached for the token's life) ─
let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > now + 30_000) {
    return cachedAccessToken.token;
  }
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token fetch failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: now + data.expires_in * 1000,
  };
  return data.access_token;
}

type PayPalOrder = {
  id: string;
  links?: Array<{ rel: string; href: string }>;
};

type PayPalResource = {
  id: string;
  status?: string;
  amount?: { value?: string };
  custom_id?: string;
  purchase_units?: Array<{ reference_id?: string; custom_id?: string }>;
};

type PayPalEvent = {
  event_type?: string;
  resource?: PayPalResource;
};

function validateCheckoutAmount(amountUsd: unknown): number | null {
  if (
    typeof amountUsd !== 'number' ||
    !Number.isFinite(amountUsd) ||
    amountUsd <= 0 ||
    amountUsd > 500
  ) {
    return null;
  }
  return amountUsd;
}

function buildCheckoutPayload(userId: string, referenceId: string, amountUsd: number) {
  return {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: referenceId,
        custom_id: userId,
        amount: {
          currency_code: 'USD',
          value: amountUsd.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: 'Las Flores 2077',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: `${CLIENT_BASE_URL}?paypal_return=1`,
      cancel_url: `${CLIENT_BASE_URL}?paypal_cancel=1`,
    },
  };
}

function getApproveLink(order: PayPalOrder): string | null {
  return order.links?.find((link) => link.rel === 'approve')?.href ?? null;
}

function isCompletedCaptureEvent(event: unknown): event is { event_type: string; resource: PayPalResource } {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const candidate = event as { event_type?: unknown; resource?: unknown };
  return (
    candidate.event_type === 'PAYMENT.CAPTURE.COMPLETED' &&
    typeof candidate.resource === 'object' &&
    candidate.resource !== null
  );
}

async function verifyWebhookSignature(req: any, event: PayPalEvent): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    const verifyRes = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: req.headers['paypal-auth-algo'],
          cert_url: req.headers['paypal-cert-url'],
          transmission_id: req.headers['paypal-transmission-id'],
          transmission_sig: req.headers['paypal-transmission-sig'],
          transmission_time: req.headers['paypal-transmission-time'],
          webhook_id: PAYPAL_WEBHOOK_ID,
          webhook_event: event,
        }),
      }
    );
    if (!verifyRes.ok) {
      console.error('[PayPal] Signature verify HTTP error:', verifyRes.status);
      return 'Signature verification failed';
    }
    const verifyData = (await verifyRes.json()) as { verification_status: string };
    if (verifyData.verification_status !== 'SUCCESS') {
      console.error('[PayPal] Signature verify failed:', verifyData);
      return 'Invalid signature';
    }
  } catch (err) {
    console.error('[PayPal] Signature verification error:', err);
    return 'Signature verification error';
  }
  return null;
}

function extractWebhookPurchaseFields(resource: PayPalResource) {
  const referenceId = resource.purchase_units?.[0]?.reference_id as string | undefined;
  const userId = (resource.purchase_units?.[0]?.custom_id || resource.custom_id) as
    | string
    | undefined;
  const amountUsd = parseFloat(resource.amount?.value || '0');

  if (!referenceId || !userId) {
    return null;
  }
  return { referenceId, userId, amountUsd };
}

// ============================================================
// POST /paypal/checkout
// Creates a PayPal order and returns the approval URL. The
// client redirects the browser to the approval URL; PayPal
// then sends the user back to /paypal/success (we don't need
// a callback — the webhook is the source of truth for the
// grant; the success page just polls /player/state for the
// new gold_credits balance).
//
// We set `purchase_units[0].reference_id` to a UUID we
// generate here. PayPal echoes this back in the webhook's
// `resource.purchase_units[0].reference_id`, and that's the
// value we use as bank_transactions.reference_id (so it
// satisfies the UUID column type and the partial UNIQUE
// index for webhook idempotency).
// ============================================================
paypalRouter.post('/checkout', authMiddleware, async (req: AuthRequest, res: Response) => {
  const amountUsd = validateCheckoutAmount((req.body ?? {}).amount_usd);
  if (amountUsd === null) {
    return res.status(400).json({
      success: false,
      error: 'amount_usd must be a number between 0 and 500',
      timestamp: new Date().toISOString(),
    });
  }

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'PayPal integration not configured',
      timestamp: new Date().toISOString(),
    });
  }

  const userId = req.userId!;
  const referenceId = randomUUID();

  try {
    const accessToken = await getAccessToken();
    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildCheckoutPayload(userId, referenceId, amountUsd)),
    });

    if (!orderRes.ok) {
      const text = await orderRes.text();
      console.error('[PayPal] Order create failed:', orderRes.status, text);
      return res.status(502).json({
        success: false,
        error: 'PayPal order create failed',
        timestamp: new Date().toISOString(),
      });
    }

    const order = (await orderRes.json()) as PayPalOrder;
    const approveUrl = getApproveLink(order);
    if (!approveUrl) {
      return res.status(502).json({
        success: false,
        error: 'No approve link in PayPal order',
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: {
        order_id: order.id,
        reference_id: referenceId,
        approve_url: approveUrl,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[PayPal] Checkout error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal PayPal checkout error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================
// POST /paypal/webhook
// PayPal sends PAYMENT.CAPTURE.COMPLETED on successful capture.
// We verify the signature via PayPal's own API (no RSA cert
// chain to maintain), grant gold_credits at GOLD_CREDITS_PER_USD,
// and rely on the partial UNIQUE index on
//   bank_transactions(reference_id) WHERE reference_type='paypal_capture'
// for idempotency on webhook redelivery.
//
// Note: NO authMiddleware — PayPal calls this directly with
// its own signature headers.
// ============================================================
paypalRouter.post('/webhook', async (req: any, res: Response) => {
  const event = req.body;

  if (!isCompletedCaptureEvent(event)) {
    return res.status(200).json({ received: true, processed: false });
  }

  const resource = event.resource;
  if (resource.status !== 'COMPLETED') {
    return res.status(200).json({ received: true, processed: false });
  }

  if (isConfigured() && PAYPAL_WEBHOOK_ID) {
    const verificationError = await verifyWebhookSignature(req, event);
    if (verificationError) {
      return res.status(401).json({
        success: false,
        error: verificationError,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const purchaseFields = extractWebhookPurchaseFields(resource);
  if (!purchaseFields) {
    console.error('[PayPal] Missing reference_id or custom_id in webhook payload');
    return res.status(200).json({ received: true, processed: false });
  }

  const { referenceId, userId, amountUsd } = purchaseFields;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    console.error('[PayPal] Invalid amount_usd in webhook payload:', resource.amount);
    return res.status(200).json({ received: true, processed: false });
  }

  const goldCreditsToGrant = Math.floor(amountUsd * GOLD_CREDITS_PER_USD);
  if (goldCreditsToGrant <= 0) {
    return res.status(200).json({ received: true, processed: false });
  }

  try {
    const { newBalance } = await BankService.modifyBalance(
      userId,
      goldCreditsToGrant,
      'gold_credits',
      'credit',
      `PayPal deposit: $${amountUsd.toFixed(2)} USD → ${goldCreditsToGrant} gold credits`,
      'paypal_capture',
      referenceId
    );

    await recordIapCompletedEvent(userId, {
      capture_id: resource.id,
      amount_usd: amountUsd,
      gold_credits_granted: goldCreditsToGrant,
      reference_id: referenceId,
    });

    return res.json({
      success: true,
      processed: true,
      data: {
        reference_id: referenceId,
        gold_credits_granted: goldCreditsToGrant,
        new_gold_credits_balance: newBalance,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      console.log(`[PayPal] Idempotent redelivery for reference_id=${referenceId}`);
      return res.status(200).json({
        received: true,
        processed: false,
        idempotent: true,
        reference_id: referenceId,
      });
    }
    console.error('[PayPal] Webhook processing error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal webhook processing error',
      timestamp: new Date().toISOString(),
    });
  }
});
