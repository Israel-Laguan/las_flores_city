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
}

export function registerRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  startGame,
  startGameForLocation,
  getIsAuthenticated,
  getCachedPlayerState,
  mountReactView,
  getGameInstance,
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
  });
}

function registerMapRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  mountReactView,
  getIsAuthenticated,
  getCachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'mountReactView' | 'getIsAuthenticated' | 'getCachedPlayerState'>): void {
  registerRoute('/map', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    void mountReactView(MapView, { playerState: getCachedPlayerState() });
  });

  registerRoute('/map/', () => {
    if (!getIsAuthenticated()) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const districtSlug = extractDistrictSlug();
    void mountReactView(MapView, { initialDistrict: districtSlug, playerState: getCachedPlayerState() });
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