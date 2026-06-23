import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';

export class WorldScene extends Phaser.Scene {
  private isPaused: boolean = false;
  private currentLocationId: string = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
  private currentNpcs: Array<{ characterId: string; canInteract?: boolean }> = [];

  private navigationLocked: boolean = false;
  private uplinkNoticeEl: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    this.cameras.main.setBackgroundColor('#0a0a1a');

    this.add.text(width / 2, 30, 'Las Flores 2077', {
      font: 'bold 28px monospace', color: '#00ff00', align: 'center',
    }).setOrigin(0.5);

    this.add.text(width / 2, 65, 'The Minimum Viable World', {
      font: '14px monospace', color: '#888888', align: 'center',
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 50, 'Press [SPACE] to interact • Use Travel menu to move', {
      font: '12px monospace', color: '#666666', align: 'center',
    }).setOrigin(0.5);

    this.createUplinkNotice();
    eventBus.emit('world:ready');
    this.setupEventListeners();
  }

  private setupEventListeners() {
    eventBus.on('location:loaded', (data: any) => {
      this.currentLocationId = data.id;
      this.updateLocationDisplay(data);
    });

    eventBus.on('travel:complete', (data: any) => {
      this.currentLocationId = data.locationId;
      this.updateStatusBar(data);
    });

    eventBus.on('tb:updated', (remaining: number) => {
      this.updateTBDisplay(remaining);
    });

    eventBus.on('phaser:pause-input', () => {
      this.isPaused = true;
      this.input.enabled = false;
    });

    eventBus.on('phaser:resume-input', () => {
      this.isPaused = false;
      this.input.enabled = true;
    });

    eventBus.on('player:state-loaded', (data: any) => {
      if (data.timeBlocks !== undefined) this.updateTBDisplay(data.timeBlocks);
      if (data.credits !== undefined) this.updateCreditsDisplay(data.credits);
      if (!this.navigationLocked && data.currentNodeId) this.engageNavigationLock();
    });

    eventBus.on('dialogue:closed', () => this.liftNavigationLock());

    eventBus.on('navigation:request', () => {
      if (this.navigationLocked) {
        this.showUplinkNotice();
        eventBus.emit('navigation:blocked');
      }
    });

    window.addEventListener('lf:dialogue-start', (event) => {
      const detail = (event as CustomEvent).detail as { characterId?: string; sceneId?: string; dialogueId?: string };
      if (detail) eventBus.emit('dialogue:start', detail);
    });

    this.input.on('pointerdown', () => {
      if (this.isPaused) return;
      const npc = this.currentNpcs.find((entry) => entry.canInteract !== false);
      if (!npc) return;
      eventBus.emit('dialogue:start', {
        characterId: npc.characterId,
        sceneId: this.currentLocationId,
      });
    });

    eventBus.on('audio:play_sfx', (data: { key: string }) => {
      if (data.key !== 'sfx_system_crash') return;
      try {
        const ctx = (this.sound as any).context as AudioContext;
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      } catch (err) {
        console.warn('[audio] SFX synthesis failed:', err);
      }
    });
  }

  private createUplinkNotice(): void {
    const existing = document.getElementById('uplink-notice');
    if (existing) {
      this.uplinkNoticeEl = existing as HTMLDivElement;
      return;
    }
    const el = document.createElement('div');
    el.id = 'uplink-notice';
    Object.assign(el.style, {
      position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.85)', border: '1px solid rgba(0, 255, 0, 0.6)',
      borderRadius: '4px', color: '#00ff00', fontFamily: 'monospace', fontSize: '13px',
      padding: '8px 16px', zIndex: '3000', display: 'none', pointerEvents: 'none',
      textAlign: 'center', whiteSpace: 'nowrap',
    });
    el.textContent = '[ACTIVE UPLINK — Complete conversation to continue]';
    document.body.appendChild(el);
    this.uplinkNoticeEl = el;
  }

  private showUplinkNotice(): void {
    if (!this.uplinkNoticeEl) return;
    this.uplinkNoticeEl.style.display = 'block';
    setTimeout(() => {
      if (this.uplinkNoticeEl) this.uplinkNoticeEl.style.display = 'none';
    }, 2500);
  }

  private engageNavigationLock(): void {
    this.navigationLocked = true;
    eventBus.emit('navigation:locked');
  }

  private liftNavigationLock(): void {
    this.navigationLocked = false;
    if (this.uplinkNoticeEl) this.uplinkNoticeEl.style.display = 'none';
    eventBus.emit('navigation:unlocked');
  }

  private updateLocationDisplay(data: any) {
    const locationDisplay = document.getElementById('location-display');
    if (locationDisplay) locationDisplay.textContent = data.name || 'Unknown';
    this.currentNpcs = Array.isArray(data.npcs) ? data.npcs : [];
  }

  private updateStatusBar(data: any) {
    if (data.time_blocks_remaining !== undefined) this.updateTBDisplay(data.time_blocks_remaining);
  }

  private updateTBDisplay(remaining: number) {
    const tbDisplay = document.getElementById('tb-display');
    if (!tbDisplay) return;
    tbDisplay.textContent = `${remaining}/48`;
    if (remaining <= 5) tbDisplay.style.color = '#ff0000';
    else if (remaining <= 10) tbDisplay.style.color = '#ffff00';
    else tbDisplay.style.color = '#00ff00';
  }

  private updateCreditsDisplay(credits: number) {
    const creditsDisplay = document.getElementById('credits-display');
    if (creditsDisplay) creditsDisplay.textContent = credits.toString();
  }
}
