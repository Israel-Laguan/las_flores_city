import { registerRoute, navigateTo } from '../router';
import { restorePersistedTheme } from '../utils/themeEngine';
import MapView from '../components/MapView';
import { MainMenu } from '../components/MainMenu';
import { SettingsView } from '../components/SettingsView';
import { GalleryView } from '../components/GalleryView';
import { CityNav } from '../components/CityNav';
import { eventBus } from '../utils/EventBus';

interface RouteDeps {
  destroyGame: () => void;
  destroyCurrentView: () => void;
  hideAllContainers: () => void;
  startGame: () => void;
  startGameForLocation: (locationId: string) => void;
  getIsAuthenticated: () => boolean;
  getCachedPlayerState: () => any;
  mountReactView: (component: any, props: Record<string, unknown>) => Promise<void>;
  getGameInstance: () => Phaser.Game | null;
  reportBootFailure: (err: Error) => void;
}

export function registerRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  startGame: _startGame,
  startGameForLocation,
  getIsAuthenticated,
  getCachedPlayerState,
  mountReactView,
  getGameInstance,
  reportBootFailure,
}: RouteDeps): void {
  registerHomeOrCity({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    getIsAuthenticated,
    getCachedPlayerState,
  });
  registerMainMenu({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    getIsAuthenticated,
    getCachedPlayerState,
  });
  registerMapRoutes({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    mountReactView,
    getIsAuthenticated,
    getCachedPlayerState,
    reportBootFailure,
  });
  registerGameRoutes({
    getIsAuthenticated,
    destroyCurrentView,
    hideAllContainers,
    startGameForLocation,
    getGameInstance,
  });
}

function registerHomeOrCity({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  getIsAuthenticated,
  getCachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'getIsAuthenticated' | 'getCachedPlayerState'>): void {
  registerRoute('/', () => {
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('login-menu')!.style.display = 'flex';
    window.__lasFloresBootReady = true;
  });

  registerRoute('/city', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new CityNav(container, getCachedPlayerState());
    window.__lasFloresBootReady = true;
  });
}

function registerMainMenu({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  getIsAuthenticated,
  getCachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'getIsAuthenticated' | 'getCachedPlayerState'>): void {
  registerRoute('/main', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    restorePersistedTheme();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new MainMenu(container, getCachedPlayerState());
    window.__lasFloresBootReady = true;
  });

  registerRoute('/main/settings', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new SettingsView(container);
    window.__lasFloresBootReady = true;
  });

  registerRoute('/main/gallery', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new GalleryView(container);
    window.__lasFloresBootReady = true;
  });
}

let mapMountGeneration = 0;

function registerMapRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  mountReactView,
  getIsAuthenticated,
  getCachedPlayerState,
  reportBootFailure,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'mountReactView' | 'getIsAuthenticated' | 'getCachedPlayerState' | 'reportBootFailure'>): void {
  registerRoute('/map', async () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    // Capture a per-mount generation so that a mount completing after a
    // newer /map or /map/ navigation is ignored. Comparing pathname alone
    // is not enough: re-entering the same URL while the previous mount is
    // still pending would still let the stale completion set boot-ready or
    // report a failure on the new view.
    const generation = ++mapMountGeneration;
    try {
      await mountReactView(MapView, { playerState: getCachedPlayerState() });
      if (generation === mapMountGeneration) {
        window.__lasFloresBootReady = true;
      }
    } catch (err) {
      if (generation === mapMountGeneration) {
        reportBootFailure(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });

  registerRoute('/map/', async () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const districtSlug = extractDistrictSlug();
    const generation = ++mapMountGeneration;
    try {
      await mountReactView(MapView, { initialDistrict: districtSlug, playerState: getCachedPlayerState() });
      if (generation === mapMountGeneration) {
        window.__lasFloresBootReady = true;
      }
    } catch (err) {
      if (generation === mapMountGeneration) {
        reportBootFailure(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

function registerGameRoutes({
  getIsAuthenticated,
  destroyCurrentView,
  hideAllContainers,
  startGameForLocation,
  getGameInstance,
}: Pick<RouteDeps, 'getIsAuthenticated' | 'destroyCurrentView' | 'hideAllContainers' | 'startGameForLocation' | 'getGameInstance'>): void {
  registerRoute('/city/loc/', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    const locationId = extractLocationId();
    if (!locationId) {
      navigateTo('/city', true);
      return;
    }
    destroyCurrentView();
    if (getGameInstance()) {
      hideAllContainers();
      document.getElementById('game-container')!.style.display = 'flex';
      eventBus.emit('city:travel-to', { locationId });
    } else {
      startGameForLocation(locationId);
    }
  });
}

function extractDistrictSlug(): string | undefined {
  const match = window.location.pathname.match(/^\/map\/([^\/]+)/);
  return match ? match[1] : undefined;
}

function extractLocationId(): string | null {
  const match = window.location.pathname.match(/^\/city\/loc\/(.+)$/);
  return match ? match[1] : null;
}
