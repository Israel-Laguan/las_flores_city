import '../styles/main-menu.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import { eventBus } from '../utils/EventBus';

export class MainMenu {
  private container: HTMLDivElement;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildTerminal());
    this.bindEvents();
  }

  private buildTerminal(): HTMLDivElement {
    const terminal = document.createElement('div');
    terminal.className = 'main-menu-terminal';
    const aboutUrl = import.meta.env.VITE_ABOUT_US_URL as string | undefined;
    const aboutBtn = aboutUrl
      ? `<button class="menu-btn" data-action="about">> ABOUT US</button>`
      : '';
    terminal.innerHTML = `
      <h1>LAS FLORES 2077</h1>
      <div class="menu-subtitle">MAIN TERMINAL v2.0</div>

      <button class="menu-btn" data-action="settings">> SETTINGS</button>
      <button class="menu-btn" data-action="gallery">> GALLERY</button>
      <button class="menu-btn" data-action="new">> NEW GAME</button>
      <button class="menu-btn" data-action="continue">> CONTINUE</button>
      ${aboutBtn}
      <button class="menu-btn" data-action="logout">> LOGOUT</button>
    `;
    return terminal;
  }

  private bindEvents(): void {
    this.container.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.menu-btn');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      this.handleAction(action!);
    });
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'settings':
        navigateTo('/main/settings');
        break;
      case 'gallery':
        navigateTo('/main/gallery');
        break;
      case 'new':
        this.startNewGame();
        break;
      case 'continue':
        this.startContinueGame();
        break;
      case 'about':
        this.handleAbout();
        break;
      case 'logout':
        await this.handleLogout();
        break;
    }
  }

  private startNewGame(): void {
    eventBus.emit('game:start', { isNew: true });
  }

  private startContinueGame(): void {
    eventBus.emit('game:start', { isNew: false });
  }

  private handleAbout(): void {
    const url = import.meta.env.VITE_ABOUT_US_URL as string;
    if (url) {
      window.open(url, '_blank');
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
    this.container.innerHTML = '';
  }
}