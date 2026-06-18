import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { LocationScene } from './scenes/LocationScene';
import './components/PhoneOverlay';
import './components/SleepOverlay';
import './styles/comms.css';
import './styles/vault.css';
import { DialogueUI } from './components/DialogueUI';
import { MonologueFeed } from './components/MonologueFeed';
import { BreakthroughAlert } from './components/effects/BreakthroughAlert';
import * as api from './utils/api';
import { eventBus } from './utils/EventBus';

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
  // Auto-login for development
  try {
    const token = api.getAuthToken();
    if (!token) {
      console.log('No auth token found, attempting dev login...');
      await api.devLogin();
    }

    // Load initial player state (flat interface)
    const state = await api.getPlayerState();
    if (state.success) {
      console.log('Player state loaded:', state.data);
      eventBus.emit('player:state-loaded', state.data);

      // Load initial location (flat interface uses locationId)
      if (state.data.locationId) {
        const location = await api.getLocation(state.data.locationId);
        if (location.success) {
          eventBus.emit('location:loaded', location.data);
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

// Bridge window CustomEvents (dispatched by E2E tests / external scripts)
// to the internal EventEmitter3-based eventBus so DialogueUI picks them up.
window.addEventListener('lf:dialogue-start', (e: Event) => {
  eventBus.emit('dialogue:start', (e as CustomEvent).detail);
});

function initOnce() {
  if (window.__lasFloresInitialized) {
    return;
  }

  window.__lasFloresInitialized = true;
  new DialogueUI();
  new MonologueFeed();
  new BreakthroughAlert();
  initApp();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnce);
} else {
  initOnce();
}

export default game;
