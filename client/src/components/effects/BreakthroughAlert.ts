import { eventBus } from '../../utils/EventBus';

/**
 * BreakthroughAlert
 *
 * Renders the global Breakthrough visual effect when a player is the
 * first to solve a mystery (isBreakthrough = true). Listens for the
 * `breakthrough:winner` event from DialogueUI and renders a full-screen
 * overlay with: screen-shake, neon flash, "BREAKTHROUGH" banner, and
 * an optional synth-bass thud (best-effort via the Phaser audio scene
 * if available, otherwise skipped).
 *
 * Late solvers and latecomers skip this component — their UX is a
 * textual monologue line emitted by DialogueUI.
 */
export class BreakthroughAlert {
  private container: HTMLDivElement | null = null;
  private shakeFrame: number | null = null;
  private flashEl: HTMLDivElement | null = null;
  private bannerEl: HTMLDivElement | null = null;
  private removeTimeout: number | null = null;

  constructor() {
    eventBus.on('breakthrough:winner', () => this.fire());
  }

  private fire(): void {
    if (this.container) return;
    this.injectDOM();
    this.playShake();
    this.playFlash();
    this.playBanner();
    this.playThud();

    this.removeTimeout = window.setTimeout(() => this.teardown(), 2400);
  }

  private injectDOM(): void {
    const root = document.createElement('div');
    root.id = 'breakthrough-alert';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '3000';
    document.body.appendChild(root);
    this.container = root;

    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.inset = '0';
    flash.style.backgroundColor = 'rgba(0, 255, 240, 0.85)';
    flash.style.opacity = '0';
    flash.style.transition = 'opacity 0.15s ease-out';
    root.appendChild(flash);
    this.flashEl = flash;

    const banner = document.createElement('div');
    banner.style.position = 'absolute';
    banner.style.top = '20%';
    banner.style.left = '50%';
    banner.style.transform = 'translate(-50%, -50%) scale(0.7)';
    banner.style.fontFamily = 'monospace';
    banner.style.fontSize = '64px';
    banner.style.fontWeight = 'bold';
    banner.style.color = '#0ff';
    banner.style.textShadow = '0 0 20px #0ff, 0 0 40px #0ff, 0 0 80px #0ff';
    banner.style.letterSpacing = '8px';
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.2s ease-out, transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2)';
    banner.textContent = 'BREAKTHROUGH';
    root.appendChild(banner);
    this.bannerEl = banner;
  }

  private playFlash(): void {
    requestAnimationFrame(() => {
      if (!this.flashEl) return;
      this.flashEl.style.opacity = '1';
      window.setTimeout(() => {
        if (this.flashEl) this.flashEl.style.opacity = '0';
      }, 80);
    });
  }

  private playBanner(): void {
    requestAnimationFrame(() => {
      if (!this.bannerEl) return;
      this.bannerEl.style.opacity = '1';
      this.bannerEl.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  }

  private playShake(): void {
    let start: number | null = null;
    const duration = 350;
    const amplitude = 8;
    const tick = (t: number) => {
      if (start === null) start = t;
      const elapsed = t - start;
      if (elapsed >= duration) {
        document.body.style.transform = '';
        this.shakeFrame = null;
        return;
      }
      const decay = 1 - elapsed / duration;
      const x = (Math.random() * 2 - 1) * amplitude * decay;
      const y = (Math.random() * 2 - 1) * amplitude * decay;
      document.body.style.transform = `translate(${x}px, ${y}px)`;
      this.shakeFrame = requestAnimationFrame(tick);
    };
    this.shakeFrame = requestAnimationFrame(tick);
  }

  private playThud(): void {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const ctx: AudioContext = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio is best-effort; never block the visual effect.
    }
  }

  private teardown(): void {
    if (this.shakeFrame !== null) {
      cancelAnimationFrame(this.shakeFrame);
      this.shakeFrame = null;
    }
    if (this.removeTimeout !== null) {
      clearTimeout(this.removeTimeout);
      this.removeTimeout = null;
    }
    document.body.style.transform = '';
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.flashEl = null;
    this.bannerEl = null;
  }
}
