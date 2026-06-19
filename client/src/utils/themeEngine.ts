import { eventBus } from './EventBus';
import { phoneStore } from '../store/PhoneStore';
import * as api from './api';

/**
 * Theme Engine — applies equipped ui_theme cosmetics as CSS custom properties
 * on :root. Uses a hardcoded switch mapping shop item
 * IDs to CSS variable overrides, so no schema change to shop_items is required.
 *
 * Lifecycle:
 *  - initThemeEngine() is called once on client boot (main.ts).
 *  - On 'inventory:item_equipped' it re-applies the equipped theme.
 *  - On boot it fetches the player's profile and applies the equipped theme so
 *    the phone aesthetic persists across reloads.
 *  - Unequipping (shop_item_id === null) restores the default palette.
 */

const DEFAULT_PALETTE: Record<string, string> = {
  '--neon-cyan': '#00ffff',
  '--neon-blue': '#0088ff',
  '--neon-magenta': '#ff00ff',
  '--neon-pink': '#f0abfc',
  '--terminal-bg': 'rgba(6, 12, 24, 0.85)',
  '--border-glow': '0 0 10px rgba(0, 136, 255, 0.4)',
};

/** Hardcoded theme id → CSS variable overrides. Add new themes here. */
const THEME_OVERRIDES: Record<string, Record<string, string>> = {
  // Hacktivist Green Theme — green-phosphor display overwriting the N&M standard UI.
  'a1b2c3d4-e29b-41d4-a716-446655440001': {
    '--neon-cyan': '#00ff66',
    '--neon-blue': '#22cc55',
    '--neon-magenta': '#88ff44',
    '--neon-pink': '#aaffaa',
    '--terminal-bg': 'rgba(4, 16, 8, 0.85)',
    '--border-glow': '0 0 10px rgba(0, 255, 102, 0.4)',
  },
};

function applyPalette(palette: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
}

function clearPalette(): void {
  const root = document.documentElement;
  for (const key of Object.keys(DEFAULT_PALETTE)) {
    root.style.removeProperty(key);
  }
}

/** Apply the equipped theme by shop item id, or restore defaults when null. */
export function applyTheme(shopItemId: string | null): void {
  if (!shopItemId) {
    clearPalette();
    applyPalette(DEFAULT_PALETTE);
    return;
  }
  const overrides = THEME_OVERRIDES[shopItemId];
  if (!overrides) {
    // Unknown theme: fall back to defaults rather than leaving a partial override.
    clearPalette();
    applyPalette(DEFAULT_PALETTE);
    return;
  }
  // Reset to defaults first so removed variables don't linger from a prior theme.
  clearPalette();
  applyPalette({ ...DEFAULT_PALETTE, ...overrides });
}

/** Fetch the player's equipped theme on boot and apply it. */
async function syncEquippedThemeFromProfile(): Promise<void> {
  try {
    const token = api.getAuthToken();
    if (!token) return;
    const state = await api.getPlayerState();
    if (!state.success || !state.data?.userId) return;
    const profile = await api.getMyMeProfile(state.data.userId);
    if (profile.success && profile.data?.equipped_theme?.id) {
      applyTheme(profile.data.equipped_theme.id);
    } else {
      applyTheme(null);
    }
  } catch (err) {
    console.warn('[themeEngine] Could not load equipped theme:', err);
  }
}

/** Wire up the theme engine. Call once on client boot. */
export function initThemeEngine(): void {
  // Apply defaults immediately so the phone renders with the base palette.
  applyTheme(null);

  // Re-apply on equip/unequip. The event carries { slot, shop_item_id }.
  eventBus.on('inventory:item_equipped', (payload: { slot: string; shop_item_id: string | null }) => {
    if (payload?.slot === 'theme') {
      // Alignment takes priority over shop themes. When the
      // player has committed to loyalist or fugitive, a cosmetic shop
      // theme must not overwrite the diegetic faction identity.
      if (phoneStore.getState().alignment !== 'neutral') return;
      applyTheme(payload.shop_item_id);
    }
  });

  // Re-apply the shop theme (or default) when alignment
  // returns to neutral. This path fires on page reload if the
  // player's alignment is still 'neutral' — the initial
  // applyTheme(null) above handles that, so this subscription
  // only matters if alignment changes back (which it won't in
  // the current narrative, but keeps the contract clean).
  phoneStore.subscribe((state) => {
    if (state.alignment === 'neutral') {
      void syncEquippedThemeFromProfile();
    }
  });

  // On boot, fetch the persisted equipped theme so reloads keep the aesthetic.
  void syncEquippedThemeFromProfile();
}