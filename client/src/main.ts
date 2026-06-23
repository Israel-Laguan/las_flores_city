import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { LocationScene } from './scenes/LocationScene';
import './styles/comms.css';
import './styles/vault.css';
import './styles/banco.css';
import { DialogueUI } from './components/DialogueUI';
import { MonologueFeed } from './components/MonologueFeed';
import { BreakthroughAlert } from './components/effects/BreakthroughAlert';
import { TerminalModal } from './components/TerminalModal';
import { PhoneOverlay } from './components/PhoneOverlay';
import { SleepOverlay } from './components/SleepOverlay';
import { LoginMenu } from './components/LoginMenu';
import { MainMenu } from './components/MainMenu';
import { SettingsView } from './components/SettingsView';
import { GalleryView } from './components/GalleryView';
import * as api from './utils/api';
import { eventBus } from './utils/EventBus';
import { ViewportManager } from './bridge/ViewportManager';
import { initThemeEngine } from './utils/themeEngine';
import { registerRoute, navigateTo, startRouter } from './router';

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

let gameInstance: Phaser.Game | null = null;
let phoneOverlayInstance: PhoneOverlay | null = null;
let sleepOverlayInstance: SleepOverlay | null = null;
let currentView: { destroy: () => void } | null = null;
let isAuthenticated = false;

function destroyGame(): void {
  if (phoneOverlayInstance) {
    phoneOverlayInstance.destroy();
    phoneOverlayInstance = null;
  }
  if (sleepOverlayInstance) {
    sleepOverlayInstance.destroy();
    sleepOverlayInstance = null;
  }
  if (gameInstance) {
    gameInstance.destroy(true);
    gameInstance = null;
  }
}

function destroyCurrentView(): void {
  if (currentView) {
    currentView.destroy();
    currentView = null;
  }
}

function hideAllContainers(): void {
  document.getElementById('login-menu')!.style.display = 'none';
  document.getElementById('view-container')!.style.display = 'none';
  document.getElementById('game-container')!.style.display = 'none';
}

async function fetchPlayerData(): Promise<void> {
  const state = await api.getPlayerState();
  if (!state.success) return;
  eventBus.emit('player:state-loaded', state.data);

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

function startGame(): void {
  hideAllContainers();
  document.getElementById('game-container')!.style.display = 'flex';

  destroyGame();

  gameInstance = new Phaser.Game(config);
  sleepOverlayInstance = new SleepOverlay();
  phoneOverlayInstance = new PhoneOverlay();
  initThemeEngine();
}

function registerRoutes(): void {
  registerRoute('/', () => {
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('login-menu')!.style.display = 'flex';
  });

  registerRoute('/main', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    currentView = new MainMenu(container);
  });

  registerRoute('/main/settings', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    currentView = new SettingsView(container);
  });

  registerRoute('/main/gallery', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    currentView = new GalleryView(container);
  });

  registerRoute('/main/new', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    startGame();
    fetchPlayerData();
  });

  registerRoute('/main/continue', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    startGame();
    fetchPlayerData();
  });
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

  registerRoutes();
  startRouter();

  eventBus.on('auth:logout', () => {
    isAuthenticated = false;
    destroyGame();
    destroyCurrentView();
    navigateTo('/', true);
  });

  eventBus.on('game:start', (payload: { isNew: boolean }) => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    startGame();
    fetchPlayerData();
  });

  // Show login menu immediately for fast visual feedback
  new LoginMenu();
  hideAllContainers();
  document.getElementById('login-menu')!.style.display = 'flex';
  const initialPath = window.location.pathname;
  navigateTo('/', true);

  // Then check session in background
  void (async () => {
    try {
      const state = await api.getPlayerState();
      if (state.success) {
        isAuthenticated = true;
        navigateTo(initialPath !== '/' ? initialPath : '/main', true);
      }
    } catch (error: any) {
      if (error?.status !== 401) {
        console.error('Session restore failed:', error);
      }
    }
  })();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnce);
} else {
  initOnce();
}
