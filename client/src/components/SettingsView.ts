import '../styles/view.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import { getInventory, PlayerInventoryItem, equipShopItem, getMyMeProfile } from '../utils/api';
import { eventBus } from '../utils/EventBus';

export class SettingsView {
  private container: HTMLDivElement;
  private displayNameInput: HTMLInputElement | null = null;
  private themeSelect: HTMLSelectElement | null = null;
  private themeItems: PlayerInventoryItem[] = [];
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
        <input type="text" class="display-name-input" placeholder="NEW DISPLAY NAME" style="width:100%;padding:10px;background:rgba(0,20,0,0.6);border:1px solid rgba(0,255,0,0.3);color:#00ff00;font-family:monospace;">
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
    this.themeSelect = this.container.querySelector('.theme-select') as HTMLSelectElement;

    const inventory = await getInventory();
    if (inventory.success) {
      this.themeItems = inventory.data.filter(item => item.item.item_type === 'ui_theme');
      this.populateThemes();
    }

    const state = await api.getPlayerState();
    if (state.success && state.data?.userId) {
      const profile = await getMyMeProfile(state.data.userId);
      if (profile.success && profile.data?.equipped_theme) {
        const themeId = profile.data.equipped_theme.id;
        this.themeSelect!.value = themeId || '';
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

  private bindEvents(): void {
    this.boundClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'back') {
        navigateTo('/main');
      } else if (action === 'logout') {
        this.handleLogout();
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