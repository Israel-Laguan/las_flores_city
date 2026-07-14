import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import '@las-flores/ui/styles/themes.css';

function getThemeColors() {
  const computed = getComputedStyle(document.body);
  return {
    sceneBg: computed.getPropertyValue('--scene-bg').trim() || '#0a0a1a',
    sceneTitle: computed.getPropertyValue('--scene-title').trim() || '#00ff00',
    sceneMuted: computed.getPropertyValue('--scene-muted').trim() || '#888888',
  };
}

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
    const colors = getThemeColors();
    this.cameras.main.setBackgroundColor(colors.sceneBg);

    this.createUplinkNotice();
    eventBus.emit('world:ready');
    this.setupEventListeners();
  }

  private setupEventListeners() {
    eventBus.on('theme:changed', () => {
      const colors = getThemeColors();
      this.cameras.main.setBackgroundColor(colors.sceneBg);
    });

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
    const colors = getThemeColors();
    const el = document.createElement('div');
    el.id = 'uplink-notice';
    Object.assign(el.style, {
      position: 'fixed', top: '60px', left: '50%', transform: 'translateX(-50%)',
      background: colors.sceneBg === '#0a0a1a' ? 'rgba(0, 0, 0, 0.85)' : `rgba(248, 248, 248, 0.95)`,
      border: `1px solid ${colors.sceneTitle}`,
      borderRadius: '4px', color: colors.sceneTitle, fontFamily: 'monospace', fontSize: '13px',
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
    const computed = getComputedStyle(document.documentElement);
    if (remaining <= 5) {
      tbDisplay.style.color = '#ff0000';
    } else if (remaining <= 10) {
      tbDisplay.style.color = '#ffff00';
    } else {
      tbDisplay.style.color = computed.getPropertyValue('--neon-cyan').trim() || '#00ff00';
    }
  }

  private updateCreditsDisplay(credits: number) {
    const creditsDisplay = document.getElementById('credits-display');
    if (creditsDisplay) creditsDisplay.textContent = credits.toString();
  }
}
