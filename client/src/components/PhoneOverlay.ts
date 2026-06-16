import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import { PhoneBridge } from '../bridge/PhoneBridge';
import * as api from '../utils/api';

export class PhoneOverlay {
  private viewport: HTMLElement;
  private navBar: HTMLElement;
  private apps: Map<string, HTMLElement> = new Map();
  private bridge: PhoneBridge;

  constructor() {
    this.viewport = document.getElementById('phone-app-content') as HTMLElement;
    this.navBar = document.getElementById('phone-nav-bar') as HTMLElement;

    // PhoneBridge owns open/close transitions and status-bar rendering
    this.bridge = new PhoneBridge('phone-overlay');

    this.createApps();
    this.createNavBar();
    this.setupEventListeners();

    // Mount default app
    this.switchApp('feed');
  }

  // ── App content builders ──────────────────────────────────────────────────

  private createApps(): void {
    const feed = document.createElement('div');
    feed.innerHTML = `
      <h3 id="phone-tb-display" style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">FEED — TB: 48/48</h3>
      <p style="color:#888;">Visit locations and meet people to fill your feed with stories.</p>
    `;
    this.apps.set('feed', feed);

    const messages = document.createElement('div');
    messages.innerHTML = `
      <h3 style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">MESSAGES</h3>
      <div style="border:1px solid var(--neon-blue);padding:10px;margin-bottom:10px;border-radius:5px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <strong>The Handler</strong><span style="color:#888;font-size:11px;">NOW</span>
        </div>
        <p style="margin:0;font-size:12px;color:#aaa;">Subject 7, report to your assigned location. The experiment has begun.</p>
      </div>
    `;
    this.apps.set('messages', messages);

    const vault = document.createElement('div');
    vault.innerHTML = `
      <h3 style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">VAULT</h3>
      <p style="color:#888;">Collect items during your adventures.</p>
    `;
    this.apps.set('vault', vault);

    const identity = document.createElement('div');
    identity.id = 'identity-app';
    identity.innerHTML = `
      <h3 style="margin:0 0 15px;color:var(--neon-cyan);border-bottom:1px solid var(--neon-cyan);padding-bottom:5px;">IDENTITY</h3>
      <p style="margin:5px 0;"><strong>Status:</strong> <span style="color:var(--neon-cyan);">ACTIVE</span></p>
      <p style="margin:5px 0;"><strong>Subject:</strong> <span id="identity-name">Test Player</span></p>
      <p style="margin:5px 0;"><strong>Time-Blocks:</strong> <span id="identity-tb">48/48</span></p>
      <p style="margin:5px 0;"><strong>Credits:</strong> <span id="identity-credits">100</span></p>
      <p style="margin:5px 0;"><strong>Gold Credits:</strong> <span id="identity-gold">0</span></p>
      <p style="color:#888;font-size:11px;margin-top:10px;border-top:1px solid #333;padding-top:10px;">Your identity is verified by N&amp;M LTD.</p>
    `;
    this.apps.set('identity', identity);
  }

  private createNavBar(): void {
    const tabs: Array<{ label: string; key: string }> = [
      { label: 'Feed', key: 'feed' },
      { label: 'Messages', key: 'messages' },
      { label: 'Vault', key: 'vault' },
      { label: 'Identity', key: 'identity' },
    ];

    tabs.forEach(({ label, key }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        flex:1;padding:8px;border:none;background:transparent;
        color:var(--neon-cyan);cursor:pointer;font-family:monospace;
        font-size:11px;text-transform:uppercase;
      `;
      btn.addEventListener('click', () => this.switchApp(key));
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,255,255,0.08)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      this.navBar.appendChild(btn);
    });
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
