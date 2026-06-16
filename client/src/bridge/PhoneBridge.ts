import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import { calculateInGameTime } from '../utils/time';

export class PhoneBridge {
  private containerElement: HTMLElement;
  private statusBarElement: HTMLElement;
  private unsubscribeStore: () => void;

  constructor(containerId: string) {
    this.containerElement = document.getElementById(containerId) as HTMLElement;
    this.statusBarElement = document.getElementById('phone-status-bar') as HTMLElement;

    this.unsubscribeStore = phoneStore.subscribe((state) => this.render(state));
    this.initEventBindings();

    // Render initial state
    this.render(phoneStore.getState());
  }

  private initEventBindings(): void {
    eventBus.on('phone:toggle', (forceState?: boolean) => {
      const current = phoneStore.getState().isOpen;
      phoneStore.updateState({ isOpen: forceState !== undefined ? forceState : !current });
    });

    eventBus.on('phone:open', () => phoneStore.updateState({ isOpen: true }));
    eventBus.on('phone:close', () => phoneStore.updateState({ isOpen: false }));

    eventBus.on('tb:updated', (remaining: number) => {
      phoneStore.updateState({ timeBlocks: remaining });
    });

    eventBus.on('player:state-loaded', (data: { credits?: number; goldCredits?: number; timeBlocks?: number }) => {
      phoneStore.updateState({
        ...(data.credits !== undefined && { credits: data.credits }),
        ...(data.goldCredits !== undefined && { goldCredits: data.goldCredits }),
        ...(data.timeBlocks !== undefined && { timeBlocks: data.timeBlocks }),
      });
    });

    eventBus.on('api:notification_received', (data: { unreadCount: number }) => {
      phoneStore.updateState({ unreadMessagesCount: data.unreadCount });
    });
  }

  private render(state: ReturnType<typeof phoneStore.getState>): void {
    const isCurrentlyOpen = this.containerElement.classList.contains('open');

    if (state.isOpen && !isCurrentlyOpen) {
      this.containerElement.classList.add('open');
      this.containerElement.style.pointerEvents = 'auto';
      eventBus.emit('phaser:disable_inputs');
    } else if (!state.isOpen && isCurrentlyOpen) {
      this.containerElement.classList.remove('open');
      this.containerElement.style.pointerEvents = 'none';
      eventBus.emit('phaser:enable_inputs');
    }

    if (this.statusBarElement) {
      const formattedTime = calculateInGameTime(state.timeBlocks);
      this.statusBarElement.innerHTML = `
        <span class="status-time">${formattedTime}</span>
        <div class="status-icons">
          <span class="credits-pill">${state.credits} C$</span>
          <span class="battery-icon">⚡ 100%</span>
        </div>
      `;
    }
  }

  public destroy(): void {
    this.unsubscribeStore();
  }
}
