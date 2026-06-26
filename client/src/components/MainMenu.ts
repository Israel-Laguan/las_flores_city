import '../styles/main-menu.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';
import { eventBus } from '../utils/EventBus';
import type { PlayerState } from '../../../shared/src';

// Deliberately no persistent "CONTINUE" vs "NEW GAME" preference — the action
// is a single "START GAME" button that dynamically labels itself based on
// current player activity. Once a time block is spent the story is committed;
// there is no undo. This is marketed as a feature: truly important decisions
// cannot be reversed.
function hasActivity(state: PlayerState): boolean {
  return (
    state.storyBeat !== 'prologue' ||
    state.currentDay > 1 ||
    state.timeBlocks < 48 ||
    state.currentNodeId != null ||
    Object.keys(state.flags).length > 0
  );
}

export class MainMenu {
  private container: HTMLDivElement;
  private boundClick: (e: MouseEvent) => void;
  private buttonLabel: string = 'NEW GAME';
  private startBtn: HTMLButtonElement | null = null;

  constructor(container: HTMLDivElement, playerState?: PlayerState) {
    this.container = container;
    this.container.innerHTML = '';
    this.boundClick = this.onClick.bind(this);

    if (playerState) {
      this.buttonLabel = hasActivity(playerState) ? 'CONTINUE' : 'NEW GAME';
    }

    this.container.appendChild(this.buildTerminal());
    this.container.addEventListener('click', this.boundClick);

    if (!playerState) {
      this.resolveState();
    }
  }

  private async resolveState(): Promise<void> {
    try {
      const res = await api.getPlayerState();
      if (res.success && hasActivity(res.data)) {
        this.buttonLabel = 'CONTINUE';
        if (this.startBtn) {
          this.startBtn.textContent = `> ${this.buttonLabel}`;
        }
      }
    } catch {
      // Stay on NEW GAME
    }
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

      <button class="menu-btn" data-action="start-game">> ${this.buttonLabel}</button>
      <button class="menu-btn" data-action="settings">> SETTINGS</button>
      <button class="menu-btn" data-action="gallery">> GALLERY</button>
      ${aboutBtn}
      <button class="menu-btn" data-action="logout">> LOGOUT</button>
    `;
    this.startBtn = terminal.querySelector('.menu-btn[data-action="start-game"]');
    return terminal;
  }

  private onClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest('.menu-btn');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    this.handleAction(action!);
  }

  private async handleAction(action: string): Promise<void> {
    switch (action) {
      case 'settings':
        navigateTo('/main/settings');
        break;
      case 'gallery':
        navigateTo('/main/gallery');
        break;
      case 'start-game':
        this.startGame();
        break;
      case 'about':
        this.handleAbout();
        break;
      case 'logout':
        await this.handleLogout();
        break;
    }
  }

  private startGame(): void {
    navigateTo('/city');
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
    this.container.removeEventListener('click', this.boundClick);
    this.container.innerHTML = '';
  }
}
