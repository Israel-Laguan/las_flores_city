import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { LocationScene } from './scenes/LocationScene';
import './components/PhoneOverlay';
import './components/SleepOverlay';
import './styles/comms.css';
import './styles/vault.css';
import './styles/banco.css';
import { DialogueUI } from './components/DialogueUI';
import { MonologueFeed } from './components/MonologueFeed';
import { BreakthroughAlert } from './components/effects/BreakthroughAlert';
import { TerminalModal } from './components/TerminalModal';
import * as api from './utils/api';
import { eventBus } from './utils/EventBus';
import { ViewportManager } from './bridge/ViewportManager';
import { initThemeEngine } from './utils/themeEngine';

declare global {
  interface Window {
    __lasFloresInitialized?: boolean;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#0a0a1a',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, WorldScene, LocationScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// Initialize components
async function initApp() {
  // Try loading player state first. If 401 (no session cookie), dev-login then retry.
  try {
    const state = await api.getPlayerState();
    if (state.success) {
      console.log('Player state loaded:', state.data);
      eventBus.emit('player:state-loaded', state.data);

      // 7.5.2 — Onboarding Lock: if the player is mid-dialogue, lock the
      // phone apps and resume the conversation immediately.
      if (state.data.currentNodeId !== null) {
        eventBus.emit('ui:lock-phone-apps', true);
        eventBus.emit('dialogue:resume');
      } else {
        eventBus.emit('ui:lock-phone-apps', false);

        // Load initial location only when not locked in dialogue
        if (state.data.locationId) {
          const location = await api.getLocation(state.data.locationId);
          if (location.success) {
            const flatLocation = {
              id: location.data.scene?.id,
              name: location.data.scene?.title || 'Unknown',
              npcs: location.data.npcs,
            };
            eventBus.emit('location:loaded', flatLocation);
          }
        }
      }
    }
  } catch (error: any) {
    const isUnauthorized = error?.status === 401;
    if (isUnauthorized) {
      console.log('No session cookie found, attempting dev login...');
      await api.devLogin();
      const state = await api.getPlayerState();
      if (state.success) {
        console.log('Player state loaded after dev login:', state.data);
        eventBus.emit('player:state-loaded', state.data);

        // 7.5.2 — Onboarding Lock (post-dev-login path)
        if (state.data.currentNodeId !== null) {
          eventBus.emit('ui:lock-phone-apps', true);
          eventBus.emit('dialogue:resume');
        } else {
          eventBus.emit('ui:lock-phone-apps', false);

          if (state.data.locationId) {
            const location = await api.getLocation(state.data.locationId);
            if (location.success) {
              const flatLocation = {
                id: location.data.scene?.id,
                name: location.data.scene?.title || 'Unknown',
                npcs: location.data.npcs,
              };
              eventBus.emit('location:loaded', flatLocation);
            }
          }
        }
      }
    } else {
      console.error('Failed to initialize app:', error);
    }
  }
}

// Bridge window CustomEvents (dispatched by E2E tests / external scripts)
// to the internal EventEmitter3-based eventBus so DialogueUI picks them up.
window.addEventListener('lf:dialogue-start', (e: Event) => {
  eventBus.emit('dialogue:start', (e as CustomEvent).detail);
});

// Bridge modal CustomEvents so the TerminalModal confirm/error paths are
// reachable from E2E tests and external integrations without reaching into the
// internal eventBus singleton. Mirrors the lf:dialogue-start bridge above.
window.addEventListener('lf:show_confirm', (e: Event) => {
  eventBus.emit('ui:show_confirm', (e as CustomEvent).detail);
});
window.addEventListener('lf:show_error', (e: Event) => {
  eventBus.emit('ui:show_error', (e as CustomEvent).detail);
});

function initOnce() {
  if (window.__lasFloresInitialized) {
    return;
  }

  window.__lasFloresInitialized = true;
  const viewportManager = new ViewportManager();
  (window as any).__viewportManager = viewportManager;
  new DialogueUI();
  new MonologueFeed();
  new BreakthroughAlert();
  new TerminalModal();
  initThemeEngine();
  initApp();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnce);
} else {
  initOnce();
}

export default game;
