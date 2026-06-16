import { phoneStore } from '../../store/PhoneStore.js';
import { eventBus } from '../../utils/EventBus.js';
import type { Gig } from '../../../../shared/src/schemas/gig.js';

export class TrabajandoApp {
  private container: HTMLElement;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    this.init();
  }

  private async init(): Promise<void> {
    this.container.innerHTML = `<div class="loading-spinner">Querying local gig contracts...</div>`;

    try {
      const token = localStorage.getItem('jwt');
      const response = await fetch('/api/gigs', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Network response failed');
      const gigs: Gig[] = await response.json();
      this.render(gigs);
    } catch {
      this.container.innerHTML = `
        <div class="app-error">
          <p>Uplink Error: Net Connection lost.</p>
          <button id="btn-home-nav">Return Home</button>
        </div>
      `;
      this.container.querySelector('#btn-home-nav')
        ?.addEventListener('click', () => eventBus.emit('phone:navigate', 'home'));
    }
  }

  private render(gigs: Gig[]): void {
    const currentTBs = phoneStore.getState().timeBlocks;

    this.container.innerHTML = `
      <div class="trabajando-app">
        <div class="app-header">
          <h2>TRABAJANDO</h2>
          <span class="sub-header">GIG-ECONOMY CENTRAL // OLD TOWN NODES</span>
        </div>
        <div class="gig-list">
          ${gigs.map(g => this.createGigCard(g, currentTBs)).join('')}
        </div>
        <div id="shift-overlay" class="shift-overlay" style="display:none;">
          <div class="progress-box">
            <span class="pulse-text">SHIFT IN PROGRESS</span>
            <div class="progress-bar-container">
              <div class="progress-bar-fill"></div>
            </div>
            <span class="meta-label">EXECUTING COPROCESSOR DIRECTIVE</span>
          </div>
        </div>
      </div>
    `;

    gigs.forEach(gig => {
      document.getElementById(`btn-gig-${gig.id}`)
        ?.addEventListener('click', () => this.handleAcceptGig(gig));
    });
  }

  private createGigCard(gig: Gig, currentTBs: number): string {
    const hours = gig.time_block_cost / 2;
    const canAfford = currentTBs >= gig.time_block_cost;
    return `
      <div class="gig-card">
        <div class="gig-main">
          <span class="gig-title">${gig.title}</span>
          <span class="gig-payout">+${gig.credit_payout} C$</span>
        </div>
        <p class="gig-desc">${gig.description}</p>
        <div class="gig-footer">
          <span class="gig-time-cost">🕒 ${hours} hours (-${gig.time_block_cost} TB)</span>
          <button id="btn-gig-${gig.id}" class="${canAfford ? 'btn-accept' : 'btn-disabled'}" ${canAfford ? '' : 'disabled'}>
            ${canAfford ? 'ACCEPT CONTRACT' : 'EXHAUSTED'}
          </button>
        </div>
      </div>
    `;
  }

  private async handleAcceptGig(gig: Gig): Promise<void> {
    const overlay = document.getElementById('shift-overlay') as HTMLElement;
    overlay.style.display = 'flex';

    try {
      const token = localStorage.getItem('jwt');
      const response = await fetch('/api/gigs/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ gigId: gig.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Execution failed');

      eventBus.emit('phaser:transition_time', { duration: 1500 });
      phoneStore.updateState({ timeBlocks: data.newTimeBlocks });
      this.init();
    } catch (err: any) {
      alert(`Uplink Error: ${err.message}`);
    } finally {
      overlay.style.display = 'none';
    }
  }
}
