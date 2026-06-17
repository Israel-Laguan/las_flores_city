import { eventBus } from '../../utils/EventBus';
import { phoneStore } from '../../store/PhoneStore';
import * as api from '../../utils/api';

export interface VaultItem {
  id: string;
  title: string;
  description: string;
  mediaUrl: string;
  itemType: string;
  unlockedAt: string;
}

export class VaultApp {
  private container: HTMLElement;
  private items: VaultItem[] = [];

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    void this.init();

    eventBus.on('phone:app-opened', (key: string) => {
      if (key === 'vault') {
        phoneStore.updateState({ hasNewVaultItem: false });
        void this.loadItems();
      }
    });

    eventBus.on('vault:new_item_unlocked', () => {
      void this.loadItems();
    });
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
        <div class="vault-thumb" style="background-image: url('${this.escapeHtml(item.mediaUrl)}')"></div>
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
      card?.addEventListener('click', () => this.openModal(item));
      card?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openModal(item);
        }
      });
    });

    document.getElementById('close-modal')?.addEventListener('click', () => {
      const modal = document.getElementById('vault-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  private openModal(item: VaultItem): void {
    const modal = document.getElementById('vault-modal');
    const image = document.getElementById('modal-image') as HTMLImageElement | null;
    const title = document.getElementById('modal-title');
    const desc = document.getElementById('modal-desc');

    if (!modal || !image || !title || !desc) return;

    image.src = item.mediaUrl;
    image.alt = item.title;
    title.textContent = item.title;
    desc.textContent = item.description;
    modal.style.display = 'flex';
  }
}
