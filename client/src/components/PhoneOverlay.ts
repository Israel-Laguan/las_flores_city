import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import { PhoneBridge } from '../bridge/PhoneBridge';
import { MessagesApp } from '../ui/apps/MessagesApp';
import { VaultApp } from '../ui/apps/VaultApp';
import { SettingsApp } from '../ui/apps/SettingsApp';
import { IdentityApp } from '../ui/apps/IdentityApp';
import { MyMeApp } from '../ui/apps/MyMeApp';
import * as api from '../utils/api';

export class PhoneOverlay {
  private viewport: HTMLElement;
  private navBar: HTMLElement;
  private navButtons: Map<string, HTMLButtonElement> = new Map();
  private apps: Map<string, HTMLElement> = new Map();
  private bridge: PhoneBridge;

  constructor() {
    this.viewport = document.getElementById('phone-app-content') ?? document.body.appendChild(
      Object.assign(document.createElement('main'), {
        id: 'phone-app-content',
        className: 'app-viewport',
      })
    );
    this.navBar = document.getElementById('phone-nav-bar') ?? document.body.appendChild(
      Object.assign(document.createElement('footer'), {
        id: 'phone-nav-bar',
        className: 'nav-bar',
      })
    );

    // PhoneBridge owns open/close transitions and status-bar rendering
    this.bridge = new PhoneBridge('phone-overlay');

    this.createApps();
    this.createNavBar();
    this.setupEventListeners();

    const overlay = document.getElementById('phone-overlay');
    const hasAuthToken = Boolean(localStorage.getItem('auth_token') || localStorage.getItem('jwt'));
    if (overlay) overlay.style.pointerEvents = hasAuthToken ? 'all' : 'none';

    // Mount default app
    this.switchApp('feed');
  }

  // ── App content builders ──────────────────────────────────────────────────

  private createApps(): void {
    const feed = document.createElement('div');
    feed.innerHTML = `
      <h3 id="phone-tb-display" style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">FEED — TB: 48/48</h3>
      <p style="color:#888;">Your personalized news feed is empty.</p>
    `;
    this.apps.set('feed', feed);

    const messages = document.createElement('div');
    new MessagesApp(messages);
    this.apps.set('messages', messages);

    const home = document.createElement('div');
    home.innerHTML = `
      <h3 style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">HOME</h3>
      <p style="color:#888;">Phone OS home.</p>
    `;
    this.apps.set('home', home);

    const banco = document.createElement('div');
    banco.innerHTML = `
      <h3 style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">BANCO</h3>
      <p style="color:#888;">Banco de Las Flores placeholder.</p>
    `;
    this.apps.set('banco', banco);

    const trabajando = document.createElement('div');
    trabajando.innerHTML = `
      <h3 id="phone-tb-display" data-testid="tb-display" style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">TRABAJANDO — TB: 48/48</h3>
      <p style="color:#888;">Local gig contracts available.</p>
      <button data-testid="gig-execute" style="margin-top:10px;padding:8px 12px;background:var(--neon-cyan);color:#001;border:0;">Execute</button>
    `;
    trabajando.querySelector<HTMLButtonElement>('[data-testid="gig-execute"]')?.addEventListener('click', () => {
      const state = phoneStore.getState();
      phoneStore.updateState({
        timeBlocks: Math.max(0, state.timeBlocks - 1),
        credits: state.credits + 25,
      });
      this.updateTBDisplay(state.timeBlocks - 1);
      this.updatePlayerInfo({ credits: state.credits + 25 });
    });
    this.apps.set('trabajando', trabajando);

    const vault = document.createElement('div');
    new VaultApp(vault);
    this.apps.set('vault', vault);

    const identity = document.createElement('div');
    new IdentityApp(identity);
    this.apps.set('identity', identity);

    const settings = document.createElement('div');
    new SettingsApp(settings);
    this.apps.set('settings', settings);

    const myme = document.createElement('div');
    new MyMeApp(myme);
    this.apps.set('myme', myme);
  }

  private createNavBar(): void {
    const tabs: Array<{ label: string; key: string }> = [
      { label: 'Home', key: 'home' },
      { label: 'Feed', key: 'feed' },
      { label: 'Messages', key: 'messages' },
      { label: 'Banco', key: 'banco' },
      { label: 'Trabajando', key: 'trabajando' },
      { label: 'MyMe', key: 'myme' },
      { label: 'Vault', key: 'vault' },
      { label: 'Identity', key: 'identity' },
      { label: 'Settings', key: 'settings' },
    ];

    tabs.forEach(({ label, key }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.navKey = key;
      btn.style.cssText = `
        flex:1;padding:8px;border:none;background:transparent;
        color:var(--neon-cyan);cursor:pointer;font-family:monospace;
        font-size:11px;text-transform:uppercase;position:relative;
      `;
      btn.addEventListener('click', () => this.switchApp(key));
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,255,255,0.08)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      this.navButtons.set(key, btn);
      this.navBar.appendChild(btn);
    });

    phoneStore.subscribe((state) => this.updateNavBadges(state));
    this.updateNavBadges(phoneStore.getState());
  }

  private updateNavBadges(state: ReturnType<typeof phoneStore.getState>): void {
    const vaultBtn = this.navButtons.get('vault');
    if (!vaultBtn) return;

    const existingDot = vaultBtn.querySelector('.nav-unread-dot');
    existingDot?.remove();

    if (state.hasNewVaultItem) {
      const dot = document.createElement('span');
      dot.className = 'nav-unread-dot';
      dot.setAttribute('aria-label', 'new evidence');
      vaultBtn.appendChild(dot);
    }
  }

  private switchApp(key: string): void {
    const app = this.apps.get(key);
    if (!app) return;
    this.viewport.innerHTML = '';
    this.viewport.appendChild(app);
    eventBus.emit('phone:app-opened', key);
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  private setupEventListeners(): void {
    // Keyboard: block VN engine shortcuts while phone is open (§5.1)
    document.addEventListener('keydown', (e) => {
      if (phoneStore.getState().isOpen) return;
      if (e.code === 'KeyP') eventBus.emit('phone:toggle');
    });

    eventBus.on('tb:updated', (remaining: number) => {
      this.updateTBDisplay(remaining);
    });

    eventBus.on('player:state-loaded', (data: any) => {
      this.updatePlayerInfo(data);
    });

    eventBus.on('vault:new_item_unlocked', () => {
      phoneStore.updateState({ hasNewVaultItem: true });
    });
  }

  private updateTBDisplay(remaining: number): void {
    const tbHeader = document.getElementById('phone-tb-display');
    if (tbHeader) tbHeader.textContent = `FEED — TB: ${remaining}/48`;

    const identityTb = document.getElementById('identity-tb');
    if (identityTb) identityTb.textContent = `${remaining}/48`;
  }

  private updatePlayerInfo(data: any): void {
    const nameEl = document.getElementById('identity-name');
    if (nameEl && data.username) nameEl.textContent = data.username;

    const creditsEl = document.getElementById('identity-credits');
    if (creditsEl && data.credits !== undefined) creditsEl.textContent = data.credits.toString();

    const goldEl = document.getElementById('identity-gold');
    if (goldEl && data.goldCredits !== undefined) goldEl.textContent = data.goldCredits.toString();

    if (data.timeBlocks !== undefined) this.updateTBDisplay(data.timeBlocks);

    if (data.isNsfwUnlocked !== undefined) {
      phoneStore.updateState({ isNsfwUnlocked: data.isNsfwUnlocked });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PhoneOverlay());
} else {
  // DOM is already ready, but ensure element exists
  if (document.getElementById('phone-app-content')) {
    new PhoneOverlay();
  } else {
    // Wait for next tick to ensure element is available
    setTimeout(() => new PhoneOverlay(), 0);
  }
}
