import '../styles/view.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import type { VaultItem } from '../utils/api';

export class GalleryView {
  private container: HTMLDivElement;
  private items: VaultItem[] = [];

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildView());
    void this.loadGallery();
  }

  private buildView(): HTMLDivElement {
    const view = document.createElement('div');
    view.className = 'view-terminal';
    view.innerHTML = `
      <h2>GALLERY — VAULT</h2>
      <div class="gallery-grid"></div>
      <button class="view-back-btn" data-action="back">> BACK</button>
    `;
    return view;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async loadGallery(): Promise<void> {
    const grid = this.container.querySelector('.gallery-grid') as HTMLDivElement;
    try {
      const result = await api.getVaultItems();
      if (!result.success) {
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load vault items.</p>';
        return;
      }
      this.items = result.data;
      if (this.items.length === 0) {
        grid.innerHTML = '<p style="color:#888;">No vault items unlocked yet.</p>';
        return;
      }
      for (const item of this.items) {
        const el = document.createElement('div');
        el.className = 'gallery-item';
        el.innerHTML = `
          <img src="${this.escapeHtml(item.thumbnailUrl)}" alt="${this.escapeHtml(item.title)}" loading="lazy" />
          <div class="item-title">${this.escapeHtml(item.title)}</div>
        `;
        el.addEventListener('click', () => this.openItem(item));
        grid.appendChild(el);
      }
    } catch (err) {
      grid.innerHTML = '<p style="color:#ff4444;">Error loading vault.</p>';
    }
  }

  private async openItem(item: VaultItem): Promise<void> {
    try {
      const url = await api.fetchVaultMediaUrl(item.id);
      window.open(url, '_blank');
    } catch {
      console.error('Could not open vault item');
    }
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}