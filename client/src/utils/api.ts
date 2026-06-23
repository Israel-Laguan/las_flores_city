/// <reference types="vite/client" />

import { eventBus } from './EventBus';
import type { BankLedgerResponse } from '../../../shared/src/types/bank';

const API_BASE = '/api';

/**
 * Decide whether a failed fetch should be intercepted into the diegetic
 * TerminalModal recovery loop. Only true "the server is unreachable / crashed"
 * cases qualify — 4xx are normal client errors (e.g. "not enough credits") and
 * stay throws, preserving existing behavior. See Task 6.4 spec §3.
 */
function shouldIntercept(err: unknown): boolean {
  // fetch() rejects with a TypeError on network down / DNS / CORS / timeout.
  if (err instanceof TypeError) return true;
  const status = (err as { status?: number })?.status;
  return typeof status === 'number' && status >= 500;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const attempt = async (): Promise<T> => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const e = new Error(
        errorData.error || `API error: ${response.status} ${response.statusText}`
      ) as Error & { status?: number };
      // Attach status so shouldIntercept() can distinguish 4xx from 5xx.
      e.status = response.status;
      throw e;
    }

    return response.json();
  };

  try {
    return await attempt();
  } catch (err) {
    if (!shouldIntercept(err)) throw err; // 4xx etc. — unchanged behavior

    // Caller's Promise<T> suspends here until the modal-driven retry resolves.
    // Each invocation owns its own Promise + closure; no global registry, so
    // it is impossible to resolve the wrong caller or leak one (spec §3).
    return await new Promise<T>((resolve, reject) => {
      eventBus.emit('ui:show_error', {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `err_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        signature: `${method} ${endpoint}`,
        code: err instanceof TypeError ? 'UPLINK_BROKEN' : `SERVER_CRASH_${(err as { status?: number }).status}`,
        message:
          'The remote neural server failed to acknowledge the packet signature or has crashed.',
        retry: async () => {
          const result = await attempt(); // throws on failure → modal restarts countdown
          resolve(result); // success: unblock the original caller
        },
        abort: () => reject(new Error('UPLINK_ABANDONED_BY_USER')),
      });
    });
  }
}

// Auth API
export async function devLogin(userId?: string): Promise<any> {
  const result: any = await fetchAPI('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  // No setAuthToken — cookie is set by the server's Set-Cookie header.
  return result;
}

export async function login(email: string, password: string): Promise<any> {
  const result: any = await fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  // No setAuthToken — cookie is set by the server's Set-Cookie header.
  return result;
}

export async function register(email: string, username: string, password: string, displayName?: string): Promise<any> {
  const result: any = await fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, display_name: displayName }),
  });
  // No setAuthToken — cookie is set by the server's Set-Cookie header.
  return result;
}

export async function logout(): Promise<any> {
  return fetchAPI('/auth/logout', {
    method: 'POST',
  });
}

// Health API
export async function getHealth(): Promise<any> {
  return fetchAPI('/health');
}

// Banco API — brings BancoApp under the same retry resilience as the rest of
// the app (Task 6.4 §3). It previously called fetch() directly.
export async function getBankStatement(): Promise<{
  success: boolean;
  data: BankLedgerResponse;
  timestamp?: string;
}> {
  return fetchAPI('/bank/ledger');
}

// Player API
export async function getPlayerState(): Promise<any> {
  return fetchAPI('/player/state');
}

export async function updatePlayerState(data: {
  time_blocks?: number;
  credits?: number;
  gold_credits?: number;
  current_location_id?: string;
  current_node_id?: string | null;
}): Promise<any> {
  return fetchAPI('/player/update', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function movePlayer(locationId: string): Promise<any> {
  return fetchAPI('/player/move', {
    method: 'POST',
    body: JSON.stringify({ target_location_id: locationId }),
  });
}

export async function sleepPlayer(): Promise<any> {
  return fetchAPI('/player/sleep', {
    method: 'POST',
  });
}

export async function spendTimeBlocks(amount: number, description: string): Promise<any> {
  return fetchAPI('/player/spend-time-blocks', {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
}

export async function setPlayerFlag(key: string, value: boolean): Promise<any> {
  return fetchAPI('/player/set-flag', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

// Location API
export async function getLocation(id: string): Promise<any> {
  return fetchAPI(`/location/${id}`);
}

export async function getAllLocations(): Promise<any> {
  return fetchAPI('/location');
}

export async function getLocationDialogues(id: string): Promise<any> {
  return fetchAPI(`/location/${id}/dialogues`);
}

// Dialogue API
export async function getDialogue(id: string): Promise<any> {
  return fetchAPI(`/dialogue/${id}`);
}

export async function startDialogue(dialogueId: string): Promise<any> {
  return fetchAPI(`/dialogue/${dialogueId}/start`, {
    method: 'POST',
  });
}

export async function startDialogueWithCharacter(
  characterId: string,
  sceneId: string
): Promise<any> {
  return fetchAPI('/dialogue/start', {
    method: 'POST',
    body: JSON.stringify({ characterId, sceneId }),
  });
}

export async function makeDialogueChoice(
  dialogueOrChunkId: string,
  choiceIdOrIndex: string | number
): Promise<any> {
  const body: any = {};
  if (typeof choiceIdOrIndex === 'number') {
    body.choiceIndex = choiceIdOrIndex;
  } else {
    body.current_chunk_id = dialogueOrChunkId;
    body.choice_id = choiceIdOrIndex;
  }
  
  return fetchAPI(`/dialogue/${dialogueOrChunkId}/choose`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getActiveDialogue(): Promise<any> {
  return fetchAPI('/dialogue/active');
}

export async function endDialogue(): Promise<any> {
  return fetchAPI('/dialogue/end', {
    method: 'POST',
  });
}

// 7.5.4 — Radar Prefetcher: fetch a single FREE chunk for the local cache
export async function getDialogueChunk(chunkId: string): Promise<any> {
  return fetchAPI(`/dialogue/chunk/${chunkId}`);
}

// 7.5.4 / Req 10 — Fire-and-forget server sync for instant-transition cache hits.
//
// The function is void and returns immediately (Req 10.7). An inner async IIFE
// carries out the POST without blocking the calling render path.
//
// On success the DialogueUI is NOT interrupted — the transition already
// appeared instantaneous to the player (Req 10.6).
//
// On network error (TypeError) or 5xx the `ui:show_error` event is emitted so
// the Diegetic Error Modal can drive the retry/abort loop (Req 10.2).
// Non-interceptable errors (4xx, etc.) are silently ignored — they are
// programming bugs, not transient uplink failures.
export function makeDialogueChoiceBackground(
  currentChunkId: string,
  choiceId: string
): void {
  void (async () => {
    const endpoint = `/dialogue/${currentChunkId}/choose`;
    const body = JSON.stringify({ current_chunk_id: currentChunkId, choice_id: choiceId });

    const attempt = () =>
      fetchAPI(endpoint, {
        method: 'POST',
        body,
      });

    try {
      await attempt();
      // Success — no event emitted; UI continues uninterrupted (Req 10.6).
    } catch (err) {
      if (!shouldIntercept(err)) {
        // 4xx / programming-level error — not a transient uplink failure; ignore.
        return;
      }

      // Transient uplink failure: surface the diegetic recovery modal (Req 10.2).
      eventBus.emit('ui:show_error', {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `err_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        signature: `POST ${endpoint}`,
        code: err instanceof TypeError
          ? 'UPLINK_BROKEN'
          : (`SERVER_CRASH_${(err as { status?: number }).status}` as const),
        message:
          'Uplink Broken — Retrying…',
        retry: async () => {
          // Re-attempt the same POST; throws on failure so the modal can
          // restart its countdown (Req 10.4).
          await attempt();
        },
        abort: () => {
          // Player chose to abandon the sync (Req 10.5).
          // Background call is fire-and-forget so there is no outer Promise to
          // reject; we emit a monologue warning to surface the abandonment.
          eventBus.emit('monologue:push', {
            text: '[UPLINK ABANDONED] Server sync skipped. Save state may be out of sync.',
            type: 'warning',
          });
        },
      });
    }
  })();
}

// Settings / AI Key API
export async function getAiKeyShare(): Promise<any> {
  return fetchAPI('/settings/ai-key-share');
}

export async function saveAiKey(ciphertext: string, iv: string, enabled: boolean): Promise<any> {
  return fetchAPI('/settings/ai-key', {
    method: 'POST',
    body: JSON.stringify({ ciphertext, iv, enabled }),
  });
}

export async function toggleAiEnabled(enabled: boolean): Promise<any> {
  return fetchAPI('/settings/ai-enabled', {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

// Vault API
export interface VaultItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  mediaPath: string;
  itemType: string;
  requiresSignedUrl?: boolean;
  unlockedAt: string;
}

export async function getVaultItems(): Promise<{ success: boolean; data: VaultItem[]; timestamp?: string }> {
  return fetchAPI('/vault');
}

export async function getVaultMediaUrl(itemId: string): Promise<{ success: true; data: { url: string }; timestamp?: string }> {
  return fetchAPI(`/vault/media/${itemId}`);
}

export class VaultMediaError extends Error {
  code: 'ACCESS_DENIED_OR_NOT_OWNED' | 'ENTITLEMENT_REVOKED' | 'UNKNOWN';
  constructor(code: VaultMediaError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export async function fetchVaultMediaUrl(itemId: string): Promise<string> {
  try {
    const result = await getVaultMediaUrl(itemId);
    return result.data.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENTITLEMENT_REVOKED')) {
      throw new VaultMediaError('ENTITLEMENT_REVOKED', message);
    }
    if (message.includes('ACCESS_DENIED_OR_NOT_OWNED')) {
      throw new VaultMediaError('ACCESS_DENIED_OR_NOT_OWNED', message);
    }
    throw new VaultMediaError('UNKNOWN', message);
  }
}

// Patreon API
export async function getPatreonLinkUrl(): Promise<{ success: boolean; data: { url: string }; timestamp?: string }> {
  return fetchAPI('/patreon/link');
}

export async function getPatreonStatus(): Promise<{ success: boolean; data: { linked: boolean; isNsfwUnlocked: boolean; tier: string }; timestamp?: string }> {
  return fetchAPI('/patreon/status');
}

export async function unlinkPatreon(): Promise<{ success: boolean; data: { linked: boolean; isNsfwUnlocked: boolean; tier: string }; timestamp?: string }> {
  return fetchAPI('/patreon/unlink', { method: 'POST' });
}

// Shop / MyMe API
export interface ShopItem {
  id: string;
  name: string;
  description?: string;
  item_type: 'ui_theme' | 'avatar_border' | 'character_skin';
  price: number;
  currency_type: 'credits' | 'gold_credits';
  asset_url: string;
  is_active: boolean;
}

export interface PlayerInventoryItem {
  id: string;
  user_id: string;
  shop_item_id: string;
  acquired_via: 'purchase' | 'grant' | 'iap';
  reference_id?: string | null;
  acquired_at: string;
  item: ShopItem;
}

export interface PublicProfile {
  user_id: string;
  username: string;
  display_name?: string | null;
  equipped_theme?: ShopItem | null;
  equipped_border?: ShopItem | null;
  badges: string[];
}

export async function getShopCatalog(): Promise<{ success: boolean; data: ShopItem[]; timestamp?: string }> {
  return fetchAPI('/shop/catalog');
}

export async function getInventory(): Promise<{ success: boolean; data: PlayerInventoryItem[]; timestamp?: string }> {
  return fetchAPI('/shop/inventory');
}

export async function buyShopItem(shopItemId: string): Promise<{
  success: boolean;
  data: { inventory_item: PlayerInventoryItem; new_balance: number; currency_type: 'credits' | 'gold_credits' };
  timestamp?: string;
}> {
  return fetchAPI('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ shop_item_id: shopItemId }),
  });
}

export async function equipShopItem(
  slot: 'theme' | 'border',
  shopItemId: string | null
): Promise<{ success: boolean; data: { slot: string; shop_item_id: string | null }; timestamp?: string }> {
  return fetchAPI('/shop/equip', {
    method: 'POST',
    body: JSON.stringify({ slot, shop_item_id: shopItemId }),
  });
}

export async function getMyMeProfile(userId: string): Promise<{ success: boolean; data: PublicProfile; timestamp?: string }> {
  return fetchAPI(`/shop/profile/${userId}`);
}

export async function startPayPalCheckout(amountUsd: number): Promise<{
  success: boolean;
  data: { order_id: string; reference_id: string; approve_url: string };
  timestamp?: string;
}> {
  return fetchAPI('/paypal/checkout', {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd }),
  });
}
