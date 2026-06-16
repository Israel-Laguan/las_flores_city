import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import { calculateInGameTime } from '../utils/time';
export class PhoneBridge {
    containerElement;
    statusBarElement;
    unsubscribeStore;
    constructor(containerId) {
        this.containerElement = document.getElementById(containerId);
        this.statusBarElement = document.getElementById('phone-status-bar');
        this.unsubscribeStore = phoneStore.subscribe((state) => this.render(state));
        this.initEventBindings();
        // Render initial state
        this.render(phoneStore.getState());
    }
    initEventBindings() {
        eventBus.on('phone:toggle', (forceState) => {
            const current = phoneStore.getState().isOpen;
            phoneStore.updateState({ isOpen: forceState !== undefined ? forceState : !current });
        });
        eventBus.on('phone:open', () => phoneStore.updateState({ isOpen: true }));
        eventBus.on('phone:close', () => phoneStore.updateState({ isOpen: false }));
        eventBus.on('tb:updated', (remaining) => {
            phoneStore.updateState({ timeBlocks: remaining });
        });
        eventBus.on('player:state-loaded', (data) => {
            phoneStore.updateState({
                ...(data.credits !== undefined && { credits: data.credits }),
                ...(data.goldCredits !== undefined && { goldCredits: data.goldCredits }),
                ...(data.timeBlocks !== undefined && { timeBlocks: data.timeBlocks }),
            });
        });
        eventBus.on('api:notification_received', (data) => {
            phoneStore.updateState({ unreadMessagesCount: data.unreadCount });
        });
    }
    render(state) {
        const isCurrentlyOpen = this.containerElement.classList.contains('open');
        if (state.isOpen && !isCurrentlyOpen) {
            this.containerElement.classList.add('open');
            this.containerElement.style.pointerEvents = 'auto';
            eventBus.emit('phaser:disable_inputs');
        }
        else if (!state.isOpen && isCurrentlyOpen) {
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
    destroy() {
        this.unsubscribeStore();
    }
}
