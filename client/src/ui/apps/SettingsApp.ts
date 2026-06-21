import { eventBus } from '../../utils/EventBus';
import { phoneStore } from '../../store/PhoneStore';
import * as api from '../../utils/api';
import { getLocalKey, setLocalKey, removeSplitKey, setupSplitKey } from '../../utils/crypto';

export class SettingsApp {
  private container: HTMLElement;
  private keyInput: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private removeBtn: HTMLButtonElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private volumeValueEl: HTMLElement | null = null;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    this.render();

    eventBus.on('phone:app-opened', (key: string) => {
      if (key === 'settings') this.refresh();
    });

    phoneStore.subscribe((state) => {
      if (phoneStore.getState().currentRoute === 'settings') this.syncToggle(state.aiEnabled);
    });
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="settings-app">
        <div class="settings-header">
          <h2>SETTINGS</h2>
          <span class="subnet-badge">LOCAL CONFIG</span>
        </div>

        <section class="settings-section">
          <h3>AUDIO CONTROL</h3>
          <div class="settings-volume">
            <label class="settings-label" for="volume-slider">Master Volume</label>
            <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="100"
                value="80"
                step="1"
                style="flex:1;accent-color:var(--neon-cyan);"
              />
              <span id="volume-value" style="color:var(--neon-cyan);font-family:monospace;min-width:40px;">80%</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3>AI PRESENTATION LAYER (BYOK)</h3>
          <p class="settings-help">
            Bring Your Own Key. Las Flores 2077 never sees your raw API key.
            Your browser generates an AES-GCM key, encrypts the key, and stores
            only the ciphertext on the server. Calls to the LLM happen in a
            background Web Worker.
          </p>
          <p class="settings-status">
            <span class="settings-label">Status:</span>
            <span id="ai-status" class="settings-value">Checking…</span>
          </p>

          <label class="settings-label" for="ai-key-input">OpenAI-compatible API Key</label>
          <input
            id="ai-key-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="sk-…"
            style="width:100%;padding:8px;background:#0a0a1a;color:var(--neon-cyan);border:1px solid var(--neon-cyan);font-family:monospace;"
          />

          <div class="settings-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <button id="ai-save-btn" class="settings-btn">Save Key</button>
            <button id="ai-toggle-btn" class="settings-btn" disabled>Enable AI</button>
            <button id="ai-remove-btn" class="settings-btn settings-btn-danger" disabled>Remove Key</button>
          </div>

          <p id="ai-message" class="settings-message" role="status" aria-live="polite"></p>
        </section>
      </div>
    `;

    this.keyInput = this.container.querySelector<HTMLInputElement>('#ai-key-input');
    this.statusEl = this.container.querySelector<HTMLElement>('#ai-status');
    this.toggleBtn = this.container.querySelector<HTMLButtonElement>('#ai-toggle-btn');
    this.saveBtn = this.container.querySelector<HTMLButtonElement>('#ai-save-btn');
    this.removeBtn = this.container.querySelector<HTMLButtonElement>('#ai-remove-btn');
    this.volumeSlider = this.container.querySelector<HTMLInputElement>('#volume-slider');
    this.volumeValueEl = this.container.querySelector<HTMLElement>('#volume-value');

    this.saveBtn?.addEventListener('click', () => void this.handleSave());
    this.toggleBtn?.addEventListener('click', () => void this.handleToggle());
    this.removeBtn?.addEventListener('click', () => void this.handleRemove());
    this.volumeSlider?.addEventListener('input', (e) => this.handleVolumeChange(e));
  }

  private async refresh(): Promise<void> {
    const localKey = getLocalKey();
    const enabled = phoneStore.getState().aiEnabled;

    try {
      const res = await api.getAiKeyShare();
      if (res.success && res.data?.ciphertext) {
        this.setStatus(localKey ? (enabled ? 'ENABLED — local key + server ciphertext present' : 'READY — key saved, AI disabled') : 'PARTIAL — server ciphertext present, no local key');
        this.removeBtn!.disabled = false;
        this.toggleBtn!.disabled = !localKey;
        this.toggleBtn!.textContent = enabled ? 'Disable AI' : 'Enable AI';
      } else {
        this.setStatus('No key saved');
        this.removeBtn!.disabled = true;
        this.toggleBtn!.disabled = true;
        this.toggleBtn!.textContent = 'Enable AI';
      }
    } catch {
      this.setStatus(localKey ? 'Local key only (server unreachable)' : 'No key saved');
      this.removeBtn!.disabled = Boolean(localKey);
      this.toggleBtn!.disabled = !localKey;
      this.toggleBtn!.textContent = enabled ? 'Disable AI' : 'Enable AI';
    }
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private setMessage(text: string, kind: 'info' | 'error' = 'info'): void {
    const el = this.container.querySelector<HTMLElement>('#ai-message');
    if (!el) return;
    el.textContent = text;
    el.style.color = kind === 'error' ? '#ff7070' : 'var(--neon-cyan)';
  }

  private syncToggle(enabled: boolean): void {
    if (!this.toggleBtn) return;
    this.toggleBtn.textContent = enabled ? 'Disable AI' : 'Enable AI';
  }

  private async handleSave(): Promise<void> {
    const raw = this.keyInput?.value?.trim();
    if (!raw) {
      this.setMessage('Paste an API key first.', 'error');
      return;
    }
    // Auth is handled by HttpOnly cookie; no client-side token check needed.
    this.saveBtn!.disabled = true;
    this.setMessage('Generating local key and encrypting…');
    try {
      await setupSplitKey(raw);
      this.keyInput!.value = '';
      setLocalKey(localStorage.getItem('ai_local_key') || '');
      phoneStore.updateState({ aiEnabled: true });
      this.setMessage('Key saved. AI presentation is enabled.');
      void this.refresh();
    } catch (err: any) {
      this.setMessage(`Save failed: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      this.saveBtn!.disabled = false;
    }
  }

  private async handleToggle(): Promise<void> {
    // Auth is handled by HttpOnly cookie; no client-side token check needed.
    const next = !phoneStore.getState().aiEnabled;
    this.toggleBtn!.disabled = true;
    try {
      const res = await api.toggleAiEnabled(next);
      if (res.success) {
        phoneStore.updateState({ aiEnabled: next });
        this.setMessage(next ? 'AI presentation enabled.' : 'AI presentation disabled.');
        void this.refresh();
      } else {
        this.setMessage(res.error || 'Toggle failed.', 'error');
      }
    } catch (err: any) {
      this.setMessage(`Toggle failed: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      this.toggleBtn!.disabled = false;
    }
  }

  private async handleRemove(): Promise<void> {
    // Auth is handled by HttpOnly cookie; no client-side token check needed.
    this.removeBtn!.disabled = true;
    try {
      await removeSplitKey();
      phoneStore.updateState({ aiEnabled: false });
      this.setMessage('Key removed.');
      void this.refresh();
    } catch (err: any) {
      this.setMessage(`Remove failed: ${err?.message || 'unknown error'}`, 'error');
      this.removeBtn!.disabled = false;
    }
  }

  private handleVolumeChange(e: Event): void {
    const slider = e.target as HTMLInputElement;
    const volumePercent = parseInt(slider.value, 10);
    const normalizedVolume = volumePercent / 100;

    // Update the display
    if (this.volumeValueEl) {
      this.volumeValueEl.textContent = `${volumePercent}%`;
    }

    // Emit the volume change event to the AudioManager
    eventBus.emit('audio:volume_change', normalizedVolume);
  }
}
