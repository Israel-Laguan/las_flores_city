import '../styles/view.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import { getInventory, PlayerInventoryItem, equipShopItem, getMyMeProfile, updateDisplayName, changePassword } from '../utils/api';
import { eventBus } from '../utils/EventBus';

const INPUT_STYLE = 'width:100%;padding:10px;background:rgba(0,20,0,0.6);border:1px solid rgba(0,255,0,0.3);color:#00ff00;font-family:monospace;margin-bottom:8px;';
const BTN_STYLE = 'width:100%;padding:10px;background:transparent;border:1px solid rgba(0,255,0,0.5);color:#00ff00;cursor:pointer;font-family:monospace;font-size:12px;letter-spacing:1px;margin-bottom:4px;';

export class SettingsView {
  private container: HTMLDivElement;
  private displayNameInput: HTMLInputElement | null = null;
  private displayNameRef: HTMLDivElement | null = null;
  private displayNameStatus: HTMLDivElement | null = null;
  private currentPasswordInput: HTMLInputElement | null = null;
  private newPasswordInput: HTMLInputElement | null = null;
  private passwordStatus: HTMLDivElement | null = null;
  private themeSelect: HTMLSelectElement | null = null;
  private themeItems: PlayerInventoryItem[] = [];
  private currentDisplayName: string = '';
  private boundClick: ((e: MouseEvent) => void) | null = null;
  private boundThemeChange: (() => void) | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildView());
    void this.loadSettings();
  }

  private buildView(): HTMLDivElement {
    const view = document.createElement('div');
    view.className = 'view-terminal';
    view.innerHTML = `
      <h2>SETTINGS</h2>

      <div class="view-section">
        <div class="view-section-label">> DISPLAY NAME</div>
        <div class="current-display-name" style="color:#008800;font-size:11px;margin-bottom:6px;padding:6px 10px;background:rgba(0,40,0,0.3);border:1px solid rgba(0,255,0,0.15);"></div>
        <input type="text" class="display-name-input" placeholder="NEW DISPLAY NAME" style="${INPUT_STYLE}">
        <button class="view-action-btn" data-action="save-display-name" style="${BTN_STYLE}border-color:rgba(0,255,0,0.6);">> SAVE DISPLAY NAME</button>
        <div class="status-text display-name-status" style="font-size:10px;min-height:14px;color:#008800;"></div>
      </div>

      <div class="view-section">
        <div class="view-section-label">> CHANGE PASSWORD</div>
        <input type="password" class="current-password-input" placeholder="CURRENT PASSWORD" style="${INPUT_STYLE}">
        <input type="password" class="new-password-input" placeholder="NEW PASSWORD" style="${INPUT_STYLE}">
        <button class="view-action-btn" data-action="change-password" style="${BTN_STYLE}border-color:rgba(200,200,0,0.5);">> CHANGE PASSWORD</button>
        <div class="status-text password-status" style="font-size:10px;min-height:14px;color:#008800;"></div>
      </div>

      <div class="view-section">
        <div class="view-section-label">> THEME SELECTION</div>
        <select class="theme-select" style="width:100%;padding:10px;background:rgba(0,20,0,0.6);border:1px solid rgba(0,255,0,0.3);color:#00ff00;font-family:monospace;"></select>
      </div>

      <div class="view-section">
        <div class="view-section-label">> AI KEY MANAGEMENT</div>
        <button class="manage-ai-key-btn" style="width:100%;padding:10px;background:transparent;border:1px solid rgba(0,255,0,0.5);color:#00ff00;cursor:pointer;">MANAGE AI KEY</button>
      </div>

      <button class="view-back-btn" data-action="back">> BACK</button>
      <button class="view-back-btn" data-action="logout">> LOGOUT</button>
    `;
    return view;
  }

  private async loadSettings(): Promise<void> {
    this.displayNameInput = this.container.querySelector('.display-name-input') as HTMLInputElement;
    this.displayNameRef = this.container.querySelector('.current-display-name') as HTMLDivElement;
    this.displayNameStatus = this.container.querySelector('.display-name-status') as HTMLDivElement;
    this.currentPasswordInput = this.container.querySelector('.current-password-input') as HTMLInputElement;
    this.newPasswordInput = this.container.querySelector('.new-password-input') as HTMLInputElement;
    this.passwordStatus = this.container.querySelector('.password-status') as HTMLDivElement;
    this.themeSelect = this.container.querySelector('.theme-select') as HTMLSelectElement;

    const inventory = await getInventory();
    if (inventory.success) {
      this.themeItems = inventory.data.filter(item => item.item.item_type === 'ui_theme');
      this.populateThemes();
    }

    const state = await api.getPlayerState();
    if (state.success && state.data?.userId) {
      const profile = await getMyMeProfile(state.data.userId);
      if (profile.success && profile.data) {
        this.currentDisplayName = profile.data.display_name || profile.data.username;
        if (this.displayNameRef) {
          this.displayNameRef.textContent = `CURRENT: ${this.currentDisplayName}`;
        }
        if (this.displayNameInput) {
          this.displayNameInput.value = this.currentDisplayName;
        }
        if (profile.data.equipped_theme) {
          const themeId = profile.data.equipped_theme.id;
          this.themeSelect!.value = themeId || '';
        }
      }
    }

    this.bindEvents();
  }

  private populateThemes(): void {
    if (!this.themeSelect) return;
    this.themeSelect.innerHTML = '<option value="">DEFAULT THEME</option>';
    for (const item of this.themeItems) {
      const option = document.createElement('option');
      option.value = item.item.id;
      option.textContent = item.item.name;
      this.themeSelect.appendChild(option);
    }
  }

  private setStatus(el: HTMLDivElement | null, msg: string, isError: boolean): void {
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#ff4444' : '#00cc66';
    if (!isError) {
      setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; } }, 3000);
    }
  }

  private async saveDisplayName(): Promise<void> {
    const value = this.displayNameInput?.value.trim();
    if (!value) {
      this.setStatus(this.displayNameStatus, 'Display name cannot be empty', true);
      return;
    }
    try {
      const result = await updateDisplayName(value);
      if (result.success) {
        this.currentDisplayName = value;
        if (this.displayNameRef) {
          this.displayNameRef.textContent = `CURRENT: ${this.currentDisplayName}`;
        }
        this.setStatus(this.displayNameStatus, 'SAVED', false);
      }
    } catch (err: any) {
      this.setStatus(this.displayNameStatus, err.message || 'Failed to save display name', true);
    }
  }

  private async handleChangePassword(): Promise<void> {
    const current = this.currentPasswordInput?.value;
    const newPw = this.newPasswordInput?.value;
    if (!current || !newPw) {
      this.setStatus(this.passwordStatus, 'Both password fields are required', true);
      return;
    }
    if (newPw.length < 6) {
      this.setStatus(this.passwordStatus, 'Password must be at least 6 characters', true);
      return;
    }
    try {
      const result = await changePassword(current, newPw);
      if (result.success) {
        if (this.currentPasswordInput) this.currentPasswordInput.value = '';
        if (this.newPasswordInput) this.newPasswordInput.value = '';
        this.setStatus(this.passwordStatus, 'PASSWORD CHANGED', false);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to change password';
      if (msg.includes('NO_PASSWORD_SET')) {
        this.setStatus(this.passwordStatus, 'No password set on this account', true);
      } else if (msg.includes('INVALID_PASSWORD')) {
        this.setStatus(this.passwordStatus, 'Current password is incorrect', true);
      } else if (msg.includes('PASSWORD_TOO_SHORT')) {
        this.setStatus(this.passwordStatus, 'Password must be at least 6 characters', true);
      } else {
        this.setStatus(this.passwordStatus, msg, true);
      }
    }
  }

  private bindEvents(): void {
    this.boundClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'back') {
        navigateTo('/main');
      } else if (action === 'logout') {
        this.handleLogout();
      } else if (action === 'save-display-name') {
        void this.saveDisplayName();
      } else if (action === 'change-password') {
        void this.handleChangePassword();
      }
    };
    this.container.addEventListener('click', this.boundClick);

    this.boundThemeChange = () => {
      const shopItemId = this.themeSelect!.value || null;
      void this.equipTheme(shopItemId);
    };
    this.themeSelect?.addEventListener('change', this.boundThemeChange);
  }

  private async equipTheme(shopItemId: string | null): Promise<void> {
    await equipShopItem('theme', shopItemId);
    eventBus.emit('inventory:item_equipped', { slot: 'theme', shop_item_id: shopItemId });
  }

  private async handleLogout(): Promise<void> {
    try {
      await api.logout();
      eventBus.emit('auth:logout');
      navigateTo('/', true);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  destroy(): void {
    if (this.boundClick) this.container.removeEventListener('click', this.boundClick);
    if (this.boundThemeChange && this.themeSelect) this.themeSelect.removeEventListener('change', this.boundThemeChange);
    this.container.innerHTML = '';
  }
}
