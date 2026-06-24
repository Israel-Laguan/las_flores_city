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

export const WHITE_HIGH_CONTRAST_ID = 'theme-white-high-contrast';
export const TERMINAL_DARK_ID = 'terminal-dark';

/** Hardcoded theme id → CSS variable overrides. Add new themes here. */
const THEME_OVERRIDES: Record<string, Record<string, string>> = {
  [TERMINAL_DARK_ID]: {
    '--neon-cyan': '#00ff00',
    '--neon-blue': '#00cc44',
    '--neon-magenta': '#00ff66',
    '--neon-pink': '#44ff88',
    '--terminal-bg': 'rgba(6, 12, 24, 0.85)',
    '--border-glow': '0 0 10px rgba(0, 255, 0, 0.4)',
  },
  // Hacktivist Green Theme — green-phosphor display overwriting the N&M standard UI.
  'a1b2c3d4-e29b-41d4-a716-446655440001': {
    '--neon-cyan': '#00ff66',
    '--neon-blue': '#22cc55',
    '--neon-magenta': '#88ff44',
    '--neon-pink': '#aaffaa',
    '--terminal-bg': 'rgba(4, 16, 8, 0.85)',
    '--border-glow': '0 0 10px rgba(0, 255, 102, 0.4)',
  },
  [WHITE_HIGH_CONTRAST_ID]: {
    '--neon-cyan': '#000000',
    '--neon-blue': '#1a1a1a',
    '--neon-magenta': '#000000',
    '--neon-pink': '#2a2a2a',
    '--terminal-bg': 'rgba(248, 248, 248, 0.98)',
    '--border-glow': '0 0 6px rgba(0, 0, 0, 0.25)',
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

function setBodyThemeClass(themeId: string | null): void {
  const body = document.body;
  body.className = body.className.replace(/\btheme-\S+/g, '').trim();
  if (themeId) {
    const normalized = themeId.startsWith('theme-') ? themeId.slice(6) : themeId;
    body.classList.add(`theme-${normalized}`);
  }
}

/** Apply the equipped theme by shop item id, or restore defaults when null. */
export function applyTheme(shopItemId: string | null): void {
  setBodyThemeClass(shopItemId);
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
    const state = await api.getPlayerState();
    if (!state.success || !state.data?.userId) return;
    const profile = await api.getMyMeProfile(state.data.userId);
    if (profile.success && profile.data?.equipped_theme?.id) {
      applyTheme(profile.data.equipped_theme.id);
    } else {
      const storedTheme = localStorage.getItem('preferred-theme');
      if (storedTheme === WHITE_HIGH_CONTRAST_ID) {
        applyTheme(WHITE_HIGH_CONTRAST_ID);
      } else if (storedTheme === TERMINAL_DARK_ID) {
        applyTheme(TERMINAL_DARK_ID);
      } else {
        applyTheme(null);
      }
    }
  } catch (err) {
    console.warn('[themeEngine] Could not load equipped theme:', err);
  }
}

/** Restore persisted built-in theme from localStorage (synchronous, for non-game routes). */
export function restorePersistedTheme(): void {
  const storedTheme = localStorage.getItem('preferred-theme');
  if (storedTheme === WHITE_HIGH_CONTRAST_ID || storedTheme === TERMINAL_DARK_ID) {
    applyTheme(storedTheme);
  } else {
    applyTheme(null);
  }
}

/** Wire up the theme engine. Call once on client boot. */
export function initThemeEngine(): void {
  restorePersistedTheme();

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