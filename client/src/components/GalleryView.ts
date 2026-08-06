import '../styles/view.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import type { VaultItem } from '../utils/api';

export class GalleryView {
  private container: HTMLDivElement;
  private items: VaultItem[] = [];

  private boundClick: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildView());
    this.bindEvents();
    void this.loadGallery();
  }

  private buildView(): HTMLDivElement {
    const view = document.createElement('div');
    view.className = 'view-terminal';
    view.innerHTML = `
      <h2>GALLERY — VAULT</h2>
      <div class="gallery-grid"></div>
      <div class="gallery-transcript hidden">
        <div class="gallery-transcript-header">
          <span class="gallery-transcript-title"></span>
          <button class="gallery-transcript-close" data-action="close-transcript">×</button>
        </div>
        <div class="gallery-transcript-body"></div>
      </div>
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
    } catch {
      grid.innerHTML = '<p style="color:#ff4444;">Error loading vault.</p>';
    }
  }

  private bindEvents(): void {
    this.boundClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'back') {
        this.closeTranscript();
        navigateTo('/main');
      }
      if (action === 'close-transcript') {
        this.closeTranscript();
      }
      if (action === 'view-image') {
        const itemId = btn.getAttribute('data-item-id');
        if (itemId) {
          const tab = window.open('about:blank', '_blank');
          void (async () => {
            try {
              const url = await api.fetchVaultMediaUrl(itemId);
              if (tab) tab.location.href = url;
            } catch {
              console.error('Could not open vault media');
              if (tab) tab.close();
            }
          })();
        }
      }
    };
    this.container.addEventListener('click', this.boundClick);
  }

  private closeTranscript(): void {
    const transcript = this.container.querySelector('.gallery-transcript');
    if (transcript) {
      transcript.classList.add('hidden');
    }
  }

  private async openItem(item: VaultItem): Promise<void> {
    if (item.itemType === 'premium_cg') {
      const transcript = this.container.querySelector('.gallery-transcript') as HTMLDivElement | null;
      if (!transcript) return;
      const title = transcript.querySelector('.gallery-transcript-title') as HTMLSpanElement | null;
      const body = transcript.querySelector('.gallery-transcript-body') as HTMLDivElement | null;
      if (title) title.textContent = item.title;
      if (body) {
        body.innerHTML = '';
        const text = document.createElement('div');
        text.className = 'gallery-transcript-text';
        text.textContent = item.description || '';
        body.appendChild(text);
        const viewBtn = document.createElement('button');
        viewBtn.className = 'view-back-btn';
        viewBtn.setAttribute('data-action', 'view-image');
        viewBtn.setAttribute('data-item-id', item.id);
        viewBtn.textContent = '> VIEW IMAGE';
        body.appendChild(viewBtn);
      }
      transcript.classList.remove('hidden');
      return;
    }

    try {
      const url = await api.fetchVaultMediaUrl(item.id);
      window.open(url, '_blank');
    } catch {
      console.error('Could not open vault item');
    }
  }

  destroy(): void {
    if (this.boundClick) {
      this.container.removeEventListener('click', this.boundClick);
    }
    this.container.innerHTML = '';
  }
}