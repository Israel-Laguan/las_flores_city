import '../styles/view.css';
import '../styles/themes.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import { getInventory, PlayerInventoryItem, equipShopItem, getMyMeProfile, updateDisplayName, changePassword } from '../utils/api';
import { eventBus } from '../utils/EventBus';
import { WHITE_HIGH_CONTRAST_ID, TERMINAL_DARK_ID, applyTheme } from '../utils/themeEngine';

export class SettingsView {
  private container: HTMLDivElement;
  private displayNameInput: HTMLInputElement | null = null;
  private displayNameRef: HTMLDivElement | null = null;
  private displayNameStatus: HTMLDivElement | null = null;
  private currentPasswordInput: HTMLInputElement | null = null;
  private newPasswordInput: HTMLInputElement | null = null;
  private passwordStatus: HTMLDivElement | null = null;
  private themeSelect: HTMLSelectElement | null = null;
  private themeStatus: HTMLDivElement | null = null;
  private themeItems: PlayerInventoryItem[] = [];
  private currentDisplayName: string = '';
  private boundClick: ((e: MouseEvent) => void) | null = null;

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
        <div class="current-display-name"></div>
        <input type="text" class="theme-input display-name-input" placeholder="NEW DISPLAY NAME">
        <button class="theme-btn view-action-btn" data-action="save-display-name" style="border-color:rgba(0,255,0,0.6);">> SAVE DISPLAY NAME</button>
        <div class="status-text display-name-status"></div>
      </div>

      <div class="view-section">
        <div class="view-section-label">> CHANGE PASSWORD</div>
        <input type="password" class="theme-input current-password-input" placeholder="CURRENT PASSWORD">
        <input type="password" class="theme-input new-password-input" placeholder="NEW PASSWORD">
        <button class="theme-btn view-action-btn" data-action="change-password" style="border-color:rgba(200,200,0,0.5);">> CHANGE PASSWORD</button>
        <div class="status-text password-status"></div>
      </div>

      <div class="view-section">
        <div class="view-section-label">> THEME SELECTION</div>
        <select class="theme-select"></select>
        <button class="theme-btn view-action-btn" data-action="apply-theme">> APPLY THEME</button>
        <div class="status-text theme-status"></div>
      </div>

      <div class="view-section">
        <div class="view-section-label">> AI KEY MANAGEMENT</div>
        <button class="theme-btn manage-ai-key-btn">MANAGE AI KEY</button>
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
    this.themeStatus = this.container.querySelector('.theme-status') as HTMLDivElement;

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
          this.themeSelect!.value = profile.data.equipped_theme.id;
        } else {
          const storedTheme = localStorage.getItem('preferred-theme');
          if (storedTheme === WHITE_HIGH_CONTRAST_ID || storedTheme === TERMINAL_DARK_ID) {
            this.themeSelect!.value = storedTheme;
          }
        }
      }
    }

    this.bindEvents();
  }

  private populateThemes(): void {
    if (!this.themeSelect) return;
    this.themeSelect.innerHTML = '<option value="">—</option>';

    const tdOption = document.createElement('option');
    tdOption.value = TERMINAL_DARK_ID;
    tdOption.textContent = 'N&M Standard (Terminal Dark)';
    this.themeSelect.appendChild(tdOption);

    const whcOption = document.createElement('option');
    whcOption.value = WHITE_HIGH_CONTRAST_ID;
    whcOption.textContent = 'White High Contrast';
    this.themeSelect.appendChild(whcOption);

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
    if (isError) {
      el.style.color = '#ff4444';
    } else {
      el.style.color = '';
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
      } else if (action === 'apply-theme') {
        void this.handleApplyTheme();
      }
    };
    this.container.addEventListener('click', this.boundClick);
  }

  private async equipTheme(shopItemId: string | null): Promise<void> {
    if (shopItemId === WHITE_HIGH_CONTRAST_ID || shopItemId === TERMINAL_DARK_ID) {
      await equipShopItem('theme', null);
      localStorage.setItem('preferred-theme', shopItemId);
    } else {
      localStorage.removeItem('preferred-theme');
      await equipShopItem('theme', shopItemId);
    }
    eventBus.emit('inventory:item_equipped', { slot: 'theme', shop_item_id: shopItemId });
    applyTheme(shopItemId);
  }

  private async handleApplyTheme(): Promise<void> {
    try {
      const shopItemId = this.themeSelect!.value || null;
      await this.equipTheme(shopItemId);
      this.setStatus(this.themeStatus, 'THEME APPLIED', false);
    } catch (err: any) {
      this.setStatus(this.themeStatus, err.message || 'Failed to apply theme', true);
    }
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
    this.container.innerHTML = '';
  }
}
