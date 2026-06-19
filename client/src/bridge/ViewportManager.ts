import { eventBus } from '../utils/EventBus';

export class ViewportManager {
  private rafId: number | null = null;

  constructor() {
    if (!window.visualViewport) return;
    window.visualViewport.addEventListener('resize', this.scheduleUpdate);
    window.visualViewport.addEventListener('scroll', this.scheduleUpdate);
    this.update();
  }

  private scheduleUpdate = (): void => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.update();
    });
  };

  private update(): void {
    const vp = window.visualViewport!;
    const height = vp.height;
    const offsetTop = vp.offsetTop;

    document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-offset-top', `${offsetTop}px`);

    eventBus.emit('viewport:resize', { height, offsetTop });
  }

  destroy(): void {
    if (!window.visualViewport) return;
    window.visualViewport.removeEventListener('resize', this.scheduleUpdate);
    window.visualViewport.removeEventListener('scroll', this.scheduleUpdate);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
