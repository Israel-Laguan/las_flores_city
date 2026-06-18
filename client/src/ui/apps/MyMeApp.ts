import { eventBus } from '../../utils/EventBus';
import { phoneStore } from '../../store/PhoneStore';
import * as api from '../../utils/api';
import type { ShopItem, PlayerInventoryItem, PublicProfile } from '../../utils/api';

type MyMeTab = 'profile' | 'catalog' | 'inventory' | 'topup';

export class MyMeApp {
  private container: HTMLElement;
  private currentTab: MyMeTab = 'profile';
  private catalog: ShopItem[] = [];
  private inventory: PlayerInventoryItem[] = [];
  private profile: PublicProfile | null = null;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    void this.init();

    eventBus.on('phone:app-opened', (key: string) => {
      if (key === 'myme') void this.loadAll();
    });

    eventBus.on('inventory:item_purchased', () => {
      void this.loadAll();
    });

    eventBus.on('inventory:item_equipped', () => {
      void this.loadAll();
    });
  }

  private async init(): Promise<void> {
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    this.container.innerHTML = '<div class="loading-spinner">Loading MyMe marketplace...</div>';
    try {
      const [catalogRes, invRes, state] = await Promise.all([
        api.getShopCatalog(),
        api.getInventory(),
        api.getPlayerState(),
      ]);
      this.catalog = catalogRes.data ?? [];
      this.inventory = invRes.data ?? [];

      if (state.success && state.data) {
        phoneStore.updateState({
          credits: state.data.credits ?? phoneStore.getState().credits,
          goldCredits: state.data.gold_credits ?? phoneStore.getState().goldCredits,
        });
      }

      const myUserId = state.data?.id ?? state.data?.user_id;
      if (myUserId) {
        try {
          const profRes = await api.getMyMeProfile(myUserId);
          this.profile = profRes.data ?? null;
        } catch {
          this.profile = null;
        }
      }
      this.render();
    } catch {
      this.container.innerHTML = '<div class="app-error"><p>Marketplace unreachable.</p></div>';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private setTab(tab: MyMeTab): void {
    this.currentTab = tab;
    this.render();
  }

  private render(): void {
    const s = phoneStore.getState();
    const tabBtn = (id: MyMeTab, label: string) =>
      `<button class="myme-tab" data-tab="${id}" style="${
        this.currentTab === id
          ? 'background:var(--neon-cyan);color:#001;'
          : 'background:transparent;color:var(--neon-cyan);'
      }">${label}</button>`;

    this.container.innerHTML = `
      <div class="myme-app">
        <div class="myme-header">
          <h2>MYME MARKETPLACE</h2>
          <span class="myme-balances">
            <span title="Credits">${s.credits.toLocaleString()} C$</span>
            &nbsp;·&nbsp;
            <span title="Gold Credits">${s.goldCredits.toLocaleString()} G$</span>
          </span>
        </div>
        <div class="myme-tabs" style="display:flex;gap:6px;margin:10px 0;">
          ${tabBtn('profile', 'Profile')}
          ${tabBtn('catalog', 'Shop')}
          ${tabBtn('inventory', 'Inventory')}
          ${tabBtn('topup', 'Top-Up')}
        </div>
        <div class="myme-body">${this.renderTab()}</div>
      </div>
    `;

    this.container.querySelectorAll<HTMLButtonElement>('button.myme-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab as MyMeTab));
    });

    this.wireActions();
  }

  private renderTab(): string {
    switch (this.currentTab) {
      case 'profile': return this.renderProfile();
      case 'catalog': return this.renderCatalog();
      case 'inventory': return this.renderInventory();
      case 'topup': return this.renderTopUp();
    }
  }

  private renderProfile(): string {
    const p = this.profile;
    if (!p) {
      return `<p style="color:#888;">No public profile yet.</p>`;
    }
    const themeCard = p.equipped_theme
      ? this.itemCard(p.equipped_theme, null, false, true)
      : '<p style="color:#888;">No UI theme equipped.</p>';
    const borderCard = p.equipped_border
      ? this.itemCard(p.equipped_border, null, false, true)
      : '<p style="color:#888;">No avatar border equipped.</p>';
    return `
      <div class="myme-profile">
        <h3 style="color:var(--neon-cyan);">@${this.escapeHtml(p.username)}</h3>
        <p style="color:#888;">${this.escapeHtml(p.display_name ?? '')}</p>
        <h4 style="margin-top:18px;">Equipped Theme</h4>
        ${themeCard}
        <h4 style="margin-top:18px;">Equipped Border</h4>
        ${borderCard}
        ${p.badges.length > 0
          ? `<h4 style="margin-top:18px;">Badges</h4><p>${p.badges.map((b) => this.escapeHtml(b)).join(' · ')}</p>`
          : ''}
      </div>
    `;
  }

  private renderCatalog(): string {
    if (this.catalog.length === 0) {
      return '<p style="color:#888;">No shop items available.</p>';
    }
    return `<div class="myme-grid">${this.catalog.map((it) => this.itemCard(it, 'buy', true)).join('')}</div>`;
  }

  private renderInventory(): string {
    if (this.inventory.length === 0) {
      return '<p style="color:#888;">Inventory is empty.</p>';
    }
    return `<div class="myme-grid">${this.inventory.map((it) => this.invItemCard(it)).join('')}</div>`;
  }

  private renderTopUp(): string {
    return `
      <div class="myme-topup">
        <p style="color:#888;">Buy G$ via PayPal. 1 USD = 100 G$ (configurable).</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
          ${[5, 10, 25, 50].map((usd) => `
            <button class="myme-topup-btn" data-amount="${usd}"
                    style="padding:10px 14px;background:var(--neon-cyan);color:#001;border:0;cursor:pointer;">
              $${usd} USD → ${usd * 100} G$
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  private itemCard(item: ShopItem, action: 'buy' | null, allowAction: boolean, equipped = false): string {
    const priceLabel = `${item.price.toLocaleString()} ${item.currency_type === 'gold_credits' ? 'G$' : 'C$'}`;
    return `
      <div class="myme-card" id="myme-${item.id}">
        <div class="myme-thumb" style="background-image:url('${this.escapeHtml(item.asset_url)}')"></div>
        <div class="myme-card-body">
          <div class="myme-name">${this.escapeHtml(item.name)}</div>
          <div class="myme-desc">${this.escapeHtml(item.description ?? '')}</div>
          <div class="myme-price">${priceLabel}</div>
          ${equipped ? '<div class="myme-equipped" style="color:var(--neon-cyan);">EQUIPPED</div>' : ''}
          ${allowAction && action === 'buy'
            ? `<button class="myme-buy" data-id="${item.id}" style="margin-top:6px;padding:6px 10px;background:var(--neon-cyan);color:#001;border:0;cursor:pointer;">Buy</button>`
            : ''}
        </div>
      </div>
    `;
  }

  private invItemCard(inv: PlayerInventoryItem): string {
    const item = inv.item;
    const slot = item.item_type === 'ui_theme' ? 'theme' : item.item_type === 'avatar_border' ? 'border' : null;
    const canEquip = slot === 'theme' || slot === 'border';
    return `
      <div class="myme-card" id="myme-${item.id}">
        <div class="myme-thumb" style="background-image:url('${this.escapeHtml(item.asset_url)}')"></div>
        <div class="myme-card-body">
          <div class="myme-name">${this.escapeHtml(item.name)}</div>
          <div class="myme-desc">${this.escapeHtml(item.description ?? '')}</div>
          <div class="myme-price" style="color:#888;">acquired ${new Date(inv.acquired_at).toLocaleDateString()}</div>
          ${canEquip
            ? `<button class="myme-equip" data-slot="${slot}" data-id="${item.id}" style="margin-top:6px;padding:6px 10px;background:var(--neon-cyan);color:#001;border:0;cursor:pointer;">Equip</button>`
            : ''}
          ${canEquip
            ? `<button class="myme-unequip" data-slot="${slot}" style="margin-top:6px;margin-left:4px;padding:6px 10px;background:transparent;color:var(--neon-cyan);border:1px solid var(--neon-cyan);cursor:pointer;">Unequip</button>`
            : ''}
        </div>
      </div>
    `;
  }

  private wireActions(): void {
    this.container.querySelectorAll<HTMLButtonElement>('button.myme-buy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        btn.disabled = true;
        btn.textContent = 'Buying…';
        void this.handleBuy(id);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('button.myme-equip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = btn.dataset.slot as 'theme' | 'border';
        const id = btn.dataset.id!;
        void this.handleEquip(slot, id);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('button.myme-unequip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = btn.dataset.slot as 'theme' | 'border';
        void this.handleEquip(slot, null);
      });
    });

    this.container.querySelectorAll<HTMLButtonElement>('button.myme-topup-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const amount = parseFloat(btn.dataset.amount!);
        void this.handleTopUp(amount);
      });
    });
  }

  private async handleBuy(shopItemId: string): Promise<void> {
    try {
      const res = await api.buyShopItem(shopItemId);
      if (!res.success) throw new Error('Buy failed');
      const s = phoneStore.getState();
      const newBal =
        res.data.currency_type === 'gold_credits' ? res.data.new_balance : s.goldCredits;
      const newCreds =
        res.data.currency_type === 'credits' ? res.data.new_balance : s.credits;
      phoneStore.updateState({ credits: newCreds, goldCredits: newBal });
      eventBus.emit('inventory:item_purchased', res.data.inventory_item);
    } catch (err) {
      console.error('[MyMe] buy error:', err);
      alert((err as Error).message || 'Purchase failed.');
    } finally {
      await this.loadAll();
    }
  }

  private async handleEquip(slot: 'theme' | 'border', shopItemId: string | null): Promise<void> {
    try {
      const res = await api.equipShopItem(slot, shopItemId);
      if (!res.success) throw new Error('Equip failed');
      eventBus.emit('inventory:item_equipped', { slot, shop_item_id: shopItemId });
    } catch (err) {
      console.error('[MyMe] equip error:', err);
      alert((err as Error).message || 'Equip failed.');
    } finally {
      await this.loadAll();
    }
  }

  private async handleTopUp(amountUsd: number): Promise<void> {
    try {
      const res = await api.startPayPalCheckout(amountUsd);
      if (!res.success || !res.data?.approve_url) throw new Error('No approval URL');
      window.location.href = res.data.approve_url;
    } catch (err) {
      console.error('[MyMe] top-up error:', err);
      alert((err as Error).message || 'Top-up failed.');
    }
  }
}
