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
import { ViewportManager } from './bridge/ViewportManager';
import { initThemeEngine, restorePersistedTheme } from './utils/themeEngine';
import { eventBus } from './utils/EventBus';
import { registerRoute, navigateTo, startRouter } from './router';
import { registerRoutes } from './router/routes.js';

declare global {
  interface Window {
    __lasFloresInitialized?: boolean;
  }
}

export let gameInstance: Phaser.Game | null = null;
export let phoneOverlayInstance: PhoneOverlay | null = null;
export let sleepOverlayInstance: SleepOverlay | null = null;
export let currentView: { destroy: () => void } | null = null;
export let isAuthenticated = false;
export let cachedPlayerState: any = null;

export function destroyGame(): void {
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

export function destroyCurrentView(): void {
  if (currentView) {
    currentView.destroy();
    currentView = null;
  }
}

async function mountReactView(component: any, props: Record<string, unknown>): Promise<void> {
  const container = document.getElementById('view-container') as HTMLDivElement;
  const mountEl = document.createElement('div');
  container.appendChild(mountEl);
  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');
  const root = createRoot(mountEl);
  root.render(createElement(component, props));
  currentView = { destroy: () => { root.unmount(); mountEl.remove(); } };
}

export function hideAllContainers(): void {
  document.getElementById('login-menu')!.style.display = 'none';
  document.getElementById('view-container')!.style.display = 'none';
  document.getElementById('game-container')!.style.display = 'none';
}

async function fetchPlayerData(): Promise<void> {
  const state = await (await import('./utils/api')).getPlayerState();
  if (!state.success) return;
  eventBus.emit('player:state-loaded', state.data);

  if (state.data.currentNodeId !== null) {
    eventBus.emit('ui:lock-phone-apps', true);
    eventBus.emit('dialogue:resume');
  } else {
    eventBus.emit('ui:lock-phone-apps', false);

    if (state.data.locationId) {
      const location = await (await import('./utils/api')).getLocation(state.data.locationId);
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

export function startGame(): void {
  hideAllContainers();
  document.getElementById('game-container')!.style.display = 'flex';

  destroyGame();

  gameInstance = new Phaser.Game(config);
  sleepOverlayInstance = new SleepOverlay();
  phoneOverlayInstance = new PhoneOverlay();
  initThemeEngine();
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

async function startGameForLocation(locationId: string): Promise<void> {
  hideAllContainers();
  document.getElementById('game-container')!.style.display = 'flex';

  destroyGame();

  gameInstance = new Phaser.Game(config);
  sleepOverlayInstance = new SleepOverlay();
  phoneOverlayInstance = new PhoneOverlay();
  initThemeEngine();

  let attempts = 0;
  const maxAttempts = 600;
  const waitForReady = () => {
    if (gameInstance?.scene.isActive('LocationScene')) {
      eventBus.emit('city:travel-to', { locationId });
    } else if (++attempts < maxAttempts) {
      requestAnimationFrame(waitForReady);
    } else {
      console.warn('[main] LocationScene did not become active, falling back to /city');
      navigateTo('/city', true);
    }
  };
  waitForReady();
}

registerRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  startGame,
  startGameForLocation,
  isAuthenticated,
  cachedPlayerState,
  mountReactView,
  gameInstance,
});

window.addEventListener('lf:dialogue-start', (e: Event) => {
  eventBus.emit('dialogue:start', (e as CustomEvent).detail);
});

window.addEventListener('lf:show_confirm', (e: Event) => {
  eventBus.emit('ui:show_confirm', (e as CustomEvent).detail);
});
window.addEventListener('lf:show_error', (e: Event) => {
  eventBus.emit('ui:show_error', (e as CustomEvent).detail);
});

async function initOnce() {
  if (window.__lasFloresInitialized) return;

  window.__lasFloresInitialized = true;
  const viewportManager = new ViewportManager();
  (window as any).__viewportManager = viewportManager;
  new DialogueUI();
  new MonologueFeed();
  new BreakthroughAlert();
  new TerminalModal();

  startRouter();

  eventBus.on('tb:updated', (remaining: number) => {
    const tbEl = document.getElementById('tb-display');
    if (tbEl) {
      tbEl.textContent = `${remaining}/48`;
      tbEl.style.color = remaining <= 5 ? '#ff0000' : remaining <= 10 ? '#ffff00' : '';
    }
  });

  eventBus.on('player:state-loaded', (data: any) => {
    const tbEl = document.getElementById('tb-display');
    if (tbEl && data.timeBlocks !== undefined) tbEl.textContent = `${data.timeBlocks}/48`;
    const creditsEl = document.getElementById('credits-display');
    if (creditsEl && data.credits !== undefined) creditsEl.textContent = data.credits.toString();
    const locationEl = document.getElementById('location-display');
    if (locationEl && data.locationId) locationEl.textContent = data.locationName || 'Unknown';
  });

  eventBus.on('travel:complete', (data: any) => {
    if (data.locationId) navigateTo(`/city/loc/${data.locationId}`, true);
  });

  eventBus.on('city:travel-to', async (data: { locationId: string }) => {
    const scene = gameInstance?.scene.getScene('LocationScene');
    if (scene && typeof (scene as any).travelTo === 'function') {
      (scene as any).travelTo(data.locationId);
    }
  });

  eventBus.on('auth:login', () => { isAuthenticated = true; });
  eventBus.on('auth:logout', () => {
    isAuthenticated = false;
    destroyGame();
    destroyCurrentView();
    navigateTo('/', true);
  });
  eventBus.on('game:start', () => {
    if (!isAuthenticated) { navigateTo('/', true); return; }
    destroyCurrentView();
    navigateTo('/map');
  });

  initializeUI();
  restoreSession();
}

function initializeUI(): void {
  new LoginMenu();
  hideAllContainers();
  document.getElementById('login-menu')!.style.display = 'flex';
  navigateTo('/', true);
}

async function restoreSession(): Promise<void> {
  void (async () => {
    try {
      const state = await (await import('./utils/api')).getPlayerState();
      if (state.success) {
        cachedPlayerState = state.data;
        isAuthenticated = true;
        const initialPath = window.location.pathname;
        navigateTo(initialPath !== '/' ? initialPath : '/main', true);
      }
    } catch (error: any) {
      if (error?.status !== 401) console.error('Session restore failed:', error);
    }
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOnce);
} else {
  initOnce();
}