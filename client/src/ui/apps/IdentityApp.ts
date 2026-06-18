import { eventBus } from '../../utils/EventBus';
import { phoneStore } from '../../store/PhoneStore';
import * as api from '../../utils/api';

export class IdentityApp {
  private container: HTMLElement;
  private statusEl: HTMLElement | null = null;
  private linkBtn: HTMLButtonElement | null = null;
  private unlinkBtn: HTMLButtonElement | null = null;
  private messageEl: HTMLElement | null = null;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    this.render();

    eventBus.on('phone:app-opened', (key: string) => {
      if (key === 'identity') this.refresh();
    });
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="settings-app">
        <div class="settings-header">
          <h2>IDENTITY</h2>
          <span class="subnet-badge">N&M LTD VERIFIED</span>
        </div>

        <section class="settings-section">
          <h3>SUBJECT PROFILE</h3>
          <p class="settings-status">
            <span class="settings-label">Status:</span>
            <span id="identity-status" class="settings-value">ACTIVE</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">Subject:</span>
            <span id="identity-name" class="settings-value">Loading…</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">Time-Blocks:</span>
            <span id="identity-tb" class="settings-value">--/48</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">Credits:</span>
            <span id="identity-credits" class="settings-value">--</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">Gold Credits:</span>
            <span id="identity-gold" class="settings-value">0</span>
          </p>
        </section>

        <section class="settings-section">
          <h3>PATREON UPLINK</h3>
          <p class="settings-help">
            Link your Patreon account to unlock premium narrative content.
            Your Patreon status is verified server-side via OAuth 2.0.
          </p>
          <p class="settings-status">
            <span class="settings-label">Uplink:</span>
            <span id="patreon-status" class="settings-value">Checking…</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">Tier:</span>
            <span id="patreon-tier" class="settings-value">--</span>
          </p>
          <p class="settings-status">
            <span class="settings-label">NSFW Content:</span>
            <span id="patreon-nsfw" class="settings-value">--</span>
          </p>

          <div class="settings-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <button id="patreon-link-btn" class="settings-btn">ESTABLISH UPLINK</button>
            <button id="patreon-unlink-btn" class="settings-btn settings-btn-danger" disabled>Sever Uplink</button>
          </div>

          <p id="patreon-message" class="settings-message" role="status" aria-live="polite"></p>
        </section>
      </div>
    `;

    this.statusEl = this.container.querySelector<HTMLElement>('#identity-status');
    this.linkBtn = this.container.querySelector<HTMLButtonElement>('#patreon-link-btn');
    this.unlinkBtn = this.container.querySelector<HTMLButtonElement>('#patreon-unlink-btn');
    this.messageEl = this.container.querySelector<HTMLElement>('#patreon-message');

    this.linkBtn?.addEventListener('click', () => void this.handleLink());
    this.unlinkBtn?.addEventListener('click', () => void this.handleUnlink());

    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const state = phoneStore.getState();

    // Update identity display from phoneStore
    const nameEl = this.container.querySelector<HTMLElement>('#identity-name');
    const tbEl = this.container.querySelector<HTMLElement>('#identity-tb');
    const creditsEl = this.container.querySelector<HTMLElement>('#identity-credits');
    const goldEl = this.container.querySelector<HTMLElement>('#identity-gold');
    if (nameEl) nameEl.textContent = state.currentRoute || 'Unknown';
    if (tbEl) tbEl.textContent = `${state.timeBlocks}/48`;
    if (creditsEl) creditsEl.textContent = state.credits.toString();
    if (goldEl) goldEl.textContent = state.goldCredits.toString();

    // Fetch Patreon status
    try {
      const res = await api.getPatreonStatus();
      if (res.success && res.data) {
        const { linked, isNsfwUnlocked, tier } = res.data;
        this.setPatreonStatus(linked ? 'LINKED' : 'UNLINKED', linked);
        this.setPatreonTier(tier);
        this.setNsfwStatus(isNsfwUnlocked);

        this.linkBtn!.disabled = linked;
        this.unlinkBtn!.disabled = !linked;
        phoneStore.updateState({ isNsfwUnlocked });
      } else {
        this.setPatreonStatus('UNAVAILABLE');
        this.linkBtn!.disabled = true;
        this.unlinkBtn!.disabled = true;
      }
    } catch {
      this.setPatreonStatus('OFFLINE');
      this.linkBtn!.disabled = false;
      this.unlinkBtn!.disabled = true;
    }
  }

  private setPatreonStatus(text: string, linked?: boolean): void {
    const el = this.container.querySelector<HTMLElement>('#patreon-status');
    if (el) {
      el.textContent = text;
      el.style.color = linked ? 'var(--neon-magenta)' : '#888';
    }
  }

  private setPatreonTier(tier: string): void {
    const el = this.container.querySelector<HTMLElement>('#patreon-tier');
    if (el) {
      el.textContent = tier.toUpperCase();
      el.style.color = tier !== 'none' ? 'var(--neon-cyan)' : '#888';
    }
  }

  private setNsfwStatus(unlocked: boolean): void {
    const el = this.container.querySelector<HTMLElement>('#patreon-nsfw');
    if (el) {
      el.textContent = unlocked ? 'UNLOCKED' : 'LOCKED';
      el.style.color = unlocked ? 'var(--neon-magenta)' : '#888';
    }
  }

  private setMessage(text: string, kind: 'info' | 'error' = 'info'): void {
    if (!this.messageEl) return;
    this.messageEl.textContent = text;
    this.messageEl.style.color = kind === 'error' ? '#ff7070' : 'var(--neon-cyan)';
  }

  private async handleLink(): Promise<void> {
    this.linkBtn!.disabled = true;
    this.setMessage('Connecting to Patreon…');
    try {
      const res = await api.getPatreonLinkUrl();
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
      } else {
        this.setMessage('Failed to get Patreon link.', 'error');
        this.linkBtn!.disabled = false;
      }
    } catch (err: any) {
      this.setMessage(`Link failed: ${err?.message || 'unknown error'}`, 'error');
      this.linkBtn!.disabled = false;
    }
  }

  private async handleUnlink(): Promise<void> {
    this.unlinkBtn!.disabled = true;
    this.setMessage('Severing uplink…');
    try {
      const res = await api.unlinkPatreon();
      if (res.success) {
        this.setMessage('Uplink severed. NSFW content locked.');
        phoneStore.updateState({ isNsfwUnlocked: false });
        void this.refresh();
      } else {
        this.setMessage('Unlink failed.', 'error');
        this.unlinkBtn!.disabled = false;
      }
    } catch (err: any) {
      this.setMessage(`Unlink failed: ${err?.message || 'unknown error'}`, 'error');
      this.unlinkBtn!.disabled = false;
    }
  }
}
