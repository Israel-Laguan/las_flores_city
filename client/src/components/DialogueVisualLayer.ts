// ============================================================
// DialogueVisualLayer — the Visual Novel viewport
//
// A full-screen DOM layer behind the dialogue bottom bar
// (#dialogue-overlay) that renders:
//   - #vn-bg       → dialogue background (node.visual.background or scene)
//   - #vn-mood     → CSS/Canvas2D mood treatment (rain/tense/night/...)
//   - #vn-portrait → expression portrait, positioned per visual.position
//
// Pure DOM component: no Phaser dependency. The Phaser map
// (LocationScene) keeps rendering underneath; the opaque layer covers
// it while a dialogue is open.
//
// Events:
//   dialogue:opened        → fade the layer in
//   dialogue:node_rendered → apply the node's visual state
//   dialogue:closed        → fade the layer out and reset
//   location:background    → capture the current scene backdrop fallback
// ============================================================

import { eventBus } from '../utils/EventBus';
import {
  resolvePortraitUrl,
  resolveBackgroundUrl,
} from '../utils/resolvePortraitUrl';
import type { DialogueNodeVisual, DialogueSpeakers } from '../types/dialogue';
import '../styles/dialogue-visual.css';

interface NodeRenderedPayload {
  type?: string;
  speaker?: { id?: string; name?: string } | null;
  thought?: string;
  speakerId?: string;
  visual?: DialogueNodeVisual;
  speakers?: DialogueSpeakers;
}

const MOODS: DialogueNodeVisual['mood'][] = ['rain', 'tense', 'night', 'soft_bloom', 'alert', 'none'];
const POSITIONS: DialogueNodeVisual['position'][] = ['left', 'center', 'right'];
const TRANSITIONS: Array<NonNullable<DialogueNodeVisual['transition']>> = ['fade', 'slide', 'flash', 'none'];

export class DialogueVisualLayer {
  private root: HTMLDivElement;
  private bg: HTMLDivElement;
  private mood: HTMLDivElement;
  private moodCanvas: HTMLCanvasElement;
  private portrait: HTMLDivElement;
  private portraitImg: HTMLImageElement;

  private sceneBackground: string | null = null;
  private currentBackground = '';
  private rainRaf: number | null = null;
  private visible = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'vn-root';
    this.root.className = 'vn-root';
    this.root.setAttribute('aria-hidden', 'true');

    this.bg = document.createElement('div');
    this.bg.id = 'vn-bg';
    this.bg.className = 'vn-bg';

    this.mood = document.createElement('div');
    this.mood.id = 'vn-mood';
    this.mood.className = 'vn-mood';

    this.moodCanvas = document.createElement('canvas');
    this.moodCanvas.className = 'vn-mood-canvas';
    this.mood.appendChild(this.moodCanvas);

    this.portrait = document.createElement('div');
    this.portrait.id = 'vn-portrait';
    this.portrait.className = 'vn-portrait';
    this.portrait.style.visibility = 'hidden';

    this.portraitImg = document.createElement('img');
    this.portraitImg.alt = '';
    this.portrait.appendChild(this.portraitImg);

    this.root.appendChild(this.bg);
    this.root.appendChild(this.mood);
    this.root.appendChild(this.portrait);
    document.body.appendChild(this.root);

    this.setupEvents();
    this.sizeCanvas();
    window.addEventListener('resize', () => this.sizeCanvas());
  }

  private setupEvents(): void {
    eventBus.on('dialogue:opened', () => this.show());
    eventBus.on('dialogue:node_rendered', (payload: NodeRenderedPayload) => this.renderNode(payload));
    eventBus.on('dialogue:closed', () => this.hide());
    eventBus.on('location:background', (data: { backgroundUrl?: string }) => {
      if (data && typeof data.backgroundUrl === 'string') this.sceneBackground = data.backgroundUrl;
    });
  }

  private show(): void {
    this.visible = true;
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
  }

  private hide(): void {
    this.visible = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.clearMood();
    this.portrait.style.visibility = 'hidden';
    this.toggleCinematic(false);
    // Keep the last background briefly for a soft fade-out, then clear.
    setTimeout(() => {
      if (!this.visible) this.bg.classList.remove('has-bg');
    }, 400);
  }

  private renderNode(payload: NodeRenderedPayload): void {
    const visual = payload.visual;
    this.renderBackground(visual?.background);
    this.renderPortrait(payload.speakerId, payload.speakers?.[payload.speakerId ?? ''], visual);
    this.renderMood(visual?.mood);
    this.toggleCinematic(visual?.cinematic === true);
  }

  private renderBackground(visualBackground: string | undefined): void {
    const url = resolveBackgroundUrl(visualBackground, this.sceneBackground ?? undefined);
    if (url && url !== this.currentBackground) {
      this.currentBackground = url;
      this.bg.style.backgroundImage = `url("${cssEscapeUrl(url)}")`;
      void this.bg.offsetHeight; // force reflow so the crossfade animates
      this.bg.classList.add('has-bg');
    } else if (!url) {
      this.currentBackground = '';
      this.bg.style.backgroundImage = '';
      this.bg.classList.remove('has-bg');
    }
  }

  private renderPortrait(
    speakerId: string | undefined,
    speaker: { name?: string; portrait_urls?: unknown } | undefined,
    visual: DialogueNodeVisual | undefined
  ): void {
    const resolved = speaker ? resolvePortraitUrl(speaker as never, visual?.expression) : null;

    if (speakerId && resolved) {
      const position = visual?.position ?? 'right';
      this.portrait.classList.remove(...POSITIONS.map((p) => `pos-${p}`));
      this.portrait.classList.add(`pos-${position}`);

      const transition = visual?.transition ?? 'fade';
      this.portrait.classList.remove(...TRANSITIONS.map((t) => `trans-${t}`));
      this.portrait.classList.add(`trans-${transition}`);

      if (this.portraitImg.src !== resolved) {
        this.portraitImg.src = resolved;
      }
      this.portrait.title = speaker?.name
        ? `${speaker.name}${visual?.expression ? ` · ${visual.expression}` : ''}`
        : '';
      this.portrait.style.visibility = 'visible';
    } else {
      this.portrait.style.visibility = 'hidden';
    }
  }

  private renderMood(mood: DialogueNodeVisual['mood']): void {
    this.clearMood();
    this.mood.classList.remove(...MOODS.map((m) => `mood-${m}`));
    if (mood && mood !== 'none') {
      this.mood.classList.add(`mood-${mood}`);
    }
    if (mood === 'rain') {
      this.startRain();
    }
  }

  private clearMood(): void {
    this.mood.classList.remove(...MOODS.map((m) => `mood-${m}`));
    this.stopRain();
  }

  private toggleCinematic(on: boolean): void {
    const overlay = document.getElementById('dialogue-overlay');
    this.root.classList.toggle('cinematic', on);
    if (overlay) overlay.classList.toggle('cinematic', on);
  }
  // ---- Rain (Canvas 2D port of the Phaser rain emitter) ----

  private sizeCanvas(): void {
    this.moodCanvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    this.moodCanvas.height = Math.floor(window.innerHeight * devicePixelRatio);
  }

  private newDrop(): { x: number; y: number; len: number; speed: number } {
    return {
      x: Math.random() * this.moodCanvas.width,
      y: Math.random() * -this.moodCanvas.height,
      len: 6 + Math.random() * 14,
      speed: 8 + Math.random() * 8,
    };
  }

  private startRain(): void {
    if (this.rainRaf !== null) return;
    const canvas = this.moodCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drops: Array<ReturnType<DialogueVisualLayer['newDrop']>> = [];
    for (let i = 0; i < 90; i++) drops.push(this.newDrop());

    const drawFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const scale = h / window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(170, 170, 204, 0.5)';
      ctx.lineWidth = Math.max(1, devicePixelRatio);

      for (const drop of drops) {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.len * 0.3 * scale, drop.y + drop.len * scale);
        ctx.stroke();

        drop.y += drop.speed * scale;
        drop.x -= 0.18 * scale;
        if (drop.y > h) Object.assign(drop, this.newDrop(), { y: -10 * scale });
      }

      this.rainRaf = requestAnimationFrame(drawFrame);
    };

    this.rainRaf = requestAnimationFrame(drawFrame);
  }

  private stopRain(): void {
    if (this.rainRaf !== null) {
      cancelAnimationFrame(this.rainRaf);
      this.rainRaf = null;
    }
    const ctx = this.moodCanvas.getContext('2d');
    ctx?.clearRect(0, 0, this.moodCanvas.width, this.moodCanvas.height);
  }
}

/** Minimal CSS url() escaping (strip quote-breaking chars from asset paths). */
function cssEscapeUrl(url: string): string {
  return url.replace(/["\\]/g, '');
}

