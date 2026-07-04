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
  isAuthenticated: boolean;
  cachedPlayerState: any;
  mountReactView: (component: any, props: Record<string, unknown>) => Promise<void>;
  gameInstance: Phaser.Game | null;
}

export function registerRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  startGame,
  startGameForLocation,
  isAuthenticated,
  cachedPlayerState,
  mountReactView,
  gameInstance,
}: RouteDeps): void {
  registerHomeOrCity({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    isAuthenticated,
    cachedPlayerState,
  });
  registerMainMenu({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    isAuthenticated,
    cachedPlayerState,
  });
  registerMapRoutes({
    destroyGame,
    destroyCurrentView,
    hideAllContainers,
    mountReactView,
    isAuthenticated,
    cachedPlayerState,
  });
  registerGameRoutes({
    isAuthenticated,
    destroyCurrentView,
    hideAllContainers,
    startGameForLocation,
    gameInstance,
  });
}

function registerHomeOrCity({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  isAuthenticated,
  cachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'isAuthenticated' | 'cachedPlayerState'>): void {
  registerRoute('/', () => {
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('login-menu')!.style.display = 'flex';
  });

  registerRoute('/city', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new CityNav(container, cachedPlayerState);
  });
}

function registerMainMenu({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  isAuthenticated,
  cachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'isAuthenticated' | 'cachedPlayerState'>): void {
  registerRoute('/main', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    restorePersistedTheme();
    document.getElementById('view-container')!.style.display = 'flex';
    const container = document.getElementById('view-container') as HTMLDivElement;
    new MainMenu(container, cachedPlayerState);
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
    new SettingsView(container);
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
    new GalleryView(container);
  });
}

function registerMapRoutes({
  destroyGame,
  destroyCurrentView,
  hideAllContainers,
  mountReactView,
  isAuthenticated,
  cachedPlayerState,
}: Pick<RouteDeps, 'destroyGame' | 'destroyCurrentView' | 'hideAllContainers' | 'mountReactView' | 'isAuthenticated' | 'cachedPlayerState'>): void {
  registerRoute('/map', () => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    void mountReactView(MapView, { playerState: cachedPlayerState });
  });

  registerRoute('/map/', (params) => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    destroyGame();
    destroyCurrentView();
    hideAllContainers();
    document.getElementById('view-container')!.style.display = 'flex';
    const districtSlug = extractDistrictSlug();
    void mountReactView(MapView, { initialDistrict: districtSlug, playerState: cachedPlayerState });
  });
}

function registerGameRoutes({
  isAuthenticated,
  destroyCurrentView,
  hideAllContainers,
  startGameForLocation,
  gameInstance,
}: Pick<RouteDeps, 'isAuthenticated' | 'destroyCurrentView' | 'hideAllContainers' | 'startGameForLocation' | 'gameInstance'>): void {
  registerRoute('/city/loc/', (params) => {
    if (!isAuthenticated) {
      navigateTo('/', true);
      return;
    }
    const locationId = extractLocationId();
    if (!locationId) {
      navigateTo('/city', true);
      return;
    }
    destroyCurrentView();
    if (gameInstance) {
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