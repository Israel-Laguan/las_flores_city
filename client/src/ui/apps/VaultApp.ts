import { eventBus } from '../../utils/EventBus';
import { phoneStore } from '../../store/PhoneStore';
import * as api from '../../utils/api';
import { VaultItem as ApiVaultItem } from '../../utils/api';

export type VaultItem = ApiVaultItem;

export class VaultApp {
  private container: HTMLElement;
  private items: VaultItem[] = [];
  private lastOpenedCard: HTMLElement | null = null;
  private subs: Array<[string, (...a: any[]) => void]> = [];
  private docListeners: Array<(e: KeyboardEvent) => void> = [];

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    void this.init();

    const onOpen = (key: string) => {
      if (key === 'vault') {
        phoneStore.updateState({ hasNewVaultItem: false });
        void this.loadItems();
      }
    };
    this.subs.push(['phone:app-opened', onOpen]);
    eventBus.on('phone:app-opened', onOpen);

    const onUnlock = () => { void this.loadItems(); };
    this.subs.push(['vault:new_item_unlocked', onUnlock]);
    eventBus.on('vault:new_item_unlocked', onUnlock);
  }

  destroy(): void {
    for (const [e, h] of this.subs) eventBus.off(e, h);
    this.subs = [];
    for (const h of this.docListeners) document.removeEventListener('keydown', h);
    this.docListeners = [];
  }

  private async init(): Promise<void> {
    await this.loadItems();
  }

  private async loadItems(): Promise<void> {
    this.container.innerHTML = '<div class="loading-spinner">Decrypting secure file system...</div>';

    try {
      const response = await api.getVaultItems();
      if (!response.success) throw new Error('File system access denied');
      this.items = response.data ?? [];
      this.renderGrid();
    } catch {
      this.container.innerHTML = '<div class="app-error"><p>Decryption failed.</p></div>';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private renderGrid(): void {
    const gridHtml = this.items
      .map(
        (item) => `
      <div class="vault-card" id="vault-item-${item.id}" role="button" tabindex="0" aria-label="View ${this.escapeHtml(item.title)}">
        <div class="vault-thumb" style="background-image: url('${this.escapeHtml(item.thumbnailUrl)}')"></div>
        <span class="vault-title">${this.escapeHtml(item.title)}</span>
      </div>
    `
      )
      .join('');

    this.container.innerHTML = `
      <div class="vault-app">
        <div class="vault-header">
          <h2>THE VAULT</h2>
          <span class="subnet-badge">LOCAL ENCRYPTED STORAGE</span>
        </div>
        <div class="vault-grid">
          ${gridHtml.length > 0 ? gridHtml : '<div class="empty-vault">No files found in local storage.</div>'}
        </div>
        <div id="vault-modal" class="vault-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <button id="close-modal" class="btn-close" aria-label="Close inspection view">✕</button>
          <img id="modal-image" class="modal-image" src="" alt="Evidence" />
          <div class="modal-info">
            <h3 id="modal-title"></h3>
            <p id="modal-desc"></p>
          </div>
        </div>
      </div>
    `;

    this.items.forEach((item) => {
      const card = document.getElementById(`vault-item-${item.id}`);
      card?.addEventListener('click', () => {
        this.lastOpenedCard = card;
        void this.openModal(item, card);
      });
      card?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.lastOpenedCard = card;
          void this.openModal(item, card);
        }
      });
    });

    const closeBtn = document.getElementById('close-modal');
    closeBtn?.addEventListener('click', () => { void this.closeModal(); });

    const onEscape = (e: KeyboardEvent) => {
      const modal = document.getElementById('vault-modal');
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        void this.closeModal();
      }
    };
    document.addEventListener('keydown', onEscape);
    this.docListeners.push(onEscape);
  }

  private async openModal(item: VaultItem, cardElement: HTMLElement): Promise<void> {
    const modal = document.getElementById('vault-modal');
    const image = document.getElementById('modal-image') as HTMLImageElement | null;
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');

    if (!modal || !image || !title || !desc) return;

    // ── FIRST: capture card rect relative to .vault-app ──
    const cardRect = cardElement.getBoundingClientRect();
    const vaultApp = this.container.querySelector<HTMLElement>('.vault-app');
    if (!vaultApp) {
      modal.style.display = 'flex'; // graceful fallback
      return;
    }
    const containerRect = vaultApp.getBoundingClientRect();

    // Zero-width guard: skip FLIP if container is hidden/offscreen
    if (containerRect.width === 0 || containerRect.height === 0) {
      this.resetAndShowModal(modal, image, title, desc, item);
      await this.fetchModalContent(item, image, title, desc);
      return;
    }

    const startX = cardRect.left - containerRect.left;
    const startY = cardRect.top - containerRect.top;
    const startW = cardRect.width;
    const startH = cardRect.height;

    // ── Reset modal contents ──
    this.resetAndShowModal(modal, image, title, desc, item);

    // ── INVERT: position modal at card location (no transition) ──
    modal.style.transition = 'none';
    modal.style.transformOrigin = 'top left';
    modal.style.transform = `translate(${startX}px, ${startY}px) scale(${startW / containerRect.width}, ${startH / containerRect.height})`;
    modal.style.opacity = '0.6';
    modal.style.display = 'flex';

    // Force reflow to commit INVERT before animating away from it
    void modal.offsetWidth;

    // ── PLAY: animate from card position to full-screen ──
    modal.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease';
    modal.style.transform = 'translate(0px, 0px) scale(1, 1)';
    modal.style.opacity = '1';

    // ── Fetch content concurrently with the animation ──
    await this.fetchModalContent(item, image, title, desc);
  }

  private resetAndShowModal(
    modal: HTMLElement,
    image: HTMLImageElement,
    title: HTMLElement,
    desc: HTMLElement,
    item: VaultItem
  ): void {
    image.src = '';
    image.alt = item.title;
    title.textContent = 'DECRYPTING...';
    title.style.color = '';
    desc.textContent = '';
    modal.style.display = 'flex';
  }

  private async fetchModalContent(
    item: VaultItem,
    image: HTMLImageElement,
    title: HTMLElement,
    desc: HTMLElement
  ): Promise<void> {
    try {
      const url = await api.fetchVaultMediaUrl(item.id);
      image.src = url;
      title.textContent = item.title;
      desc.textContent = item.description;
    } catch (err) {
      const error = err as api.VaultMediaError;
      title.textContent = 'UPLINK FAILURE';
      title.style.color = '#ff3333';
      desc.textContent =
        error.code === 'ENTITLEMENT_REVOKED'
          ? 'ACCESS REVOKED: External authorization required (Patreon).'
          : error.code === 'ACCESS_DENIED_OR_NOT_OWNED'
            ? 'FILE CORRUPTED OR UNAUTHORIZED'
            : error.message || 'FILE CORRUPTED OR UNAUTHORIZED';
    }
  }

  private async closeModal(): Promise<void> {
    const modal = document.getElementById('vault-modal');
    if (!modal) return;

    if (this.lastOpenedCard) {
      const vaultApp = this.container.querySelector<HTMLElement>('.vault-app');
      const cardRect = this.lastOpenedCard.getBoundingClientRect();
      if (vaultApp) {
        const containerRect = vaultApp.getBoundingClientRect();
        // Detached-card guard: if grid re-rendered, cardRect is all zeros
        // and the modal collapses to scale-0 — looks intentional, no crash.
        const endX = cardRect.left - containerRect.left;
        const endY = cardRect.top - containerRect.top;
        const endW = cardRect.width;
        const endH = cardRect.height;

        modal.style.transition = 'transform 0.3s cubic-bezier(0.5, 0, 0.75, 0), opacity 0.25s ease';
        modal.style.transformOrigin = 'top left';
        const scaleX = containerRect.width > 0 ? endW / containerRect.width : 0;
        const scaleY = containerRect.height > 0 ? endH / containerRect.height : 0;
        modal.style.transform = `translate(${endX}px, ${endY}px) scale(${scaleX}, ${scaleY})`;
        modal.style.opacity = '0';

        await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
      }
    }

    // Reset and hide (also the no-card fallback path)
    modal.style.transition = 'none';
    modal.style.transform = '';
    modal.style.opacity = '';
    modal.style.display = 'none';
    this.lastOpenedCard = null;
  }
}
