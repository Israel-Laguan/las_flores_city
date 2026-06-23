import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

export class SleepOverlay {
  private container: HTMLDivElement;
  private overlay!: HTMLDivElement;

  constructor() {
    this.container = document.getElementById('sleep-overlay') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'sleep-overlay';
      document.body.appendChild(this.container);
    }
    this.setupStyles();
    this.createOverlay();
    this.setupEventListeners();
  }

  private setupStyles() {
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.zIndex = '2000';
    this.container.style.pointerEvents = 'none';
    this.container.style.opacity = '0';
    this.container.style.transition = 'opacity 1.5s ease-in-out';
  }

  private createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'absolute';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.backgroundColor = '#000000';
    this.overlay.style.display = 'flex';
    this.overlay.style.flexDirection = 'column';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.fontFamily = 'monospace';
    this.overlay.style.opacity = '0';
    this.overlay.style.transition = 'opacity 1s ease-in-out';
    this.container.appendChild(this.overlay);
  }

  private setupEventListeners() {
    eventBus.on('sleep:initiate', () => this.initiateSleep());

    eventBus.on('sleep:complete', (data: any) => this.showDaySummary(data));
  }

  private async initiateSleep() {
    this.container.style.pointerEvents = 'auto';

    // Fade to black
    this.container.style.opacity = '1';

    await this.delay(1500);

    // Call the sleep endpoint
    try {
      const result = await api.sleepPlayer();
      if (result.success) {
        eventBus.emit('sleep:complete', result.data);
      } else {
        eventBus.emit('sleep:failed', result.error);
        this.hideOverlay();
      }
    } catch (error: any) {
      console.error('Sleep failed:', error);
      eventBus.emit('sleep:failed', error.message);
      this.hideOverlay();
    }
  }

  private showDaySummary(data: {
    current_day: number;
    credits_deducted: number;
    time_blocks: number;
    credits: number;
    overdraft?: boolean;
  }) {
    this.overlay.innerHTML = '';
    this.overlay.style.opacity = '0';

    this.overlay.appendChild(this.createDayHeader(data.current_day));
    this.overlay.appendChild(this.createBankSummary(data));

    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
    });

    setTimeout(() => {
      this.hideOverlay();
      eventBus.emit('sleep:dismissed', {
        timeBlocks: data.time_blocks,
        credits: data.credits,
        currentDay: data.current_day,
      });
    }, 3000);
  }

  private createDayHeader(currentDay: number): HTMLDivElement {
    const wrapper = document.createElement('div');

    const dayTitle = document.createElement('div');
    dayTitle.textContent = `DAY ${currentDay}`;
    dayTitle.style.color = '#00ccff';
    dayTitle.style.fontSize = '48px';
    dayTitle.style.fontWeight = 'bold';
    dayTitle.style.fontFamily = 'monospace';
    dayTitle.style.textShadow = '0 0 20px rgba(0, 204, 255, 0.5)';
    dayTitle.style.marginBottom = '10px';
    dayTitle.style.letterSpacing = '4px';
    wrapper.appendChild(dayTitle);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'of the Initiative';
    subtitle.style.color = '#666666';
    subtitle.style.fontSize = '16px';
    subtitle.style.fontFamily = 'monospace';
    subtitle.style.marginBottom = '40px';
    subtitle.style.letterSpacing = '2px';
    wrapper.appendChild(subtitle);

    return wrapper;
  }

  private createBankSummary(data: {
    current_day: number;
    credits_deducted: number;
    time_blocks: number;
    credits: number;
    overdraft?: boolean;
  }): HTMLDivElement {
    const summary = document.createElement('div');
    summary.style.border = '1px solid #00ff00';
    summary.style.padding = '20px 30px';
    summary.style.borderRadius = '5px';
    summary.style.backgroundColor = 'rgba(0, 20, 0, 0.8)';
    summary.style.minWidth = '280px';
    summary.style.textAlign = 'center';
    summary.appendChild(this.createBankHeader());

    const rentLine = document.createElement('div');
    rentLine.style.display = 'flex';
    rentLine.style.justifyContent = 'space-between';
    rentLine.style.color = '#ff4444';
    rentLine.style.fontSize = '14px';
    rentLine.style.marginBottom = '10px';
    rentLine.innerHTML = `<span>Daily Rent</span><span>-${data.credits_deducted} Creds</span>`;
    summary.appendChild(rentLine);

    const balanceLine = document.createElement('div');
    balanceLine.style.display = 'flex';
    balanceLine.style.justifyContent = 'space-between';
    balanceLine.style.fontSize = '14px';
    balanceLine.style.marginTop = '10px';
    balanceLine.style.paddingTop = '10px';
    balanceLine.style.borderTop = '1px solid #003300';

    const balanceColor = data.credits < 0 ? '#ff4444' : '#00ff00';
    balanceLine.innerHTML = `<span style="color: #888;">Balance</span><span style="color: ${balanceColor};">${data.credits} Creds</span>`;
    summary.appendChild(balanceLine);

    if (data.overdraft) {
      summary.appendChild(this.createOverdraftWarning());
    }

    return summary;
  }

  private createBankHeader(): HTMLDivElement {
    const bankTitle = document.createElement('div');
    bankTitle.textContent = 'BANCO DE LAS FLORES';
    bankTitle.style.color = '#00ff00';
    bankTitle.style.fontSize = '12px';
    bankTitle.style.letterSpacing = '2px';
    bankTitle.style.marginBottom = '15px';
    bankTitle.style.borderBottom = '1px solid #003300';
    bankTitle.style.paddingBottom = '10px';
    return bankTitle;
  }

  private createOverdraftWarning(): HTMLDivElement {
    const warning = document.createElement('div');
    warning.style.color = '#ff4444';
    warning.style.fontSize = '11px';
    warning.style.marginTop = '15px';
    warning.style.padding = '8px';
    warning.style.border = '1px solid #ff4444';
    warning.style.borderRadius = '3px';
    warning.textContent = 'ACCOUNT OVERDRAFT - Complete gigs to avoid contract termination.';
    return warning;
  }

  private hideOverlay() {
    this.overlay.style.opacity = '0';
    this.container.style.opacity = '0';
    this.container.style.pointerEvents = 'none';

    setTimeout(() => {
      this.overlay.innerHTML = '';
    }, 1000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy(): void {
    this.container.remove();
  }
}

