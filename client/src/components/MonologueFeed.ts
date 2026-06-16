import { eventBus } from '../utils/EventBus';

interface MonologueEntry {
  id: string;
  text: string;
  timestamp: Date;
  type: 'thought' | 'observation' | 'feeling' | 'warning' | 'scan';
}

type MonologueType = MonologueEntry['type'];

const TYPE_CONFIG: Record<MonologueType, { color: string; prefix: string; label: string }> = {
  thought:      { color: '#4fc3f7', prefix: 'I.I.', label: 'INTROSPECTION' },
  observation:  { color: '#78909c', prefix: 'OBS',  label: 'OBSERVATION' },
  feeling:      { color: '#ce93d8', prefix: 'FEL',  label: 'EMOTIONAL' },
  warning:      { color: '#ffb74d', prefix: 'N&M',  label: 'SYSTEM' },
  scan:         { color: '#81c784', prefix: 'SCN',  label: 'ENV_SCAN' },
};

export class MonologueFeed {
  private container: HTMLDivElement;
  private scrollContainer!: HTMLDivElement;
  private entries: MonologueEntry[] = [];
  private maxEntries: number = 50;
  private currentTb: number = 48;
  private currentSceneId: string | null = null;
  private idleThoughts: string[] = [];
  private isVisible: boolean = true;

  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private idleIntervalMs: number = 20_000;
  private lastTravelTime: number = 0;
  private dialogueActive: boolean = false;

  constructor() {
    this.container = document.getElementById('monologue-feed') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'monologue-feed';
      document.body.appendChild(this.container);
    }
    this.setupStyles();
    this.createStructure();
    this.setupEventListeners();
    this.startIdleTimer();
  }

  // ==================== Styles ====================

  private setupStyles() {
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      width: '380px',
      maxHeight: '260px',
      backgroundColor: 'rgba(2, 4, 8, 0.88)',
      border: '1px solid rgba(79, 195, 247, 0.25)',
      borderRadius: '4px',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      fontSize: '11px',
      lineHeight: '1.45',
      zIndex: '1500',
      overflow: 'hidden',
      contain: 'content',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 0 20px rgba(79, 195, 247, 0.06)',
    });
  }

  private createStructure() {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 12px',
      borderBottom: '1px solid rgba(79, 195, 247, 0.15)',
      userSelect: 'none',
    });
    header.innerHTML = `
      <span style="color: #4fc3f7; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.8;">Introspection Console</span>
      <button id="toggle-feed" style="
        background: none; border: none; color: #546e7a; cursor: pointer;
        font-size: 10px; font-family: inherit; padding: 0 4px;
      ">[MIN]</button>
    `;
    this.container.appendChild(header);

    this.scrollContainer = document.createElement('div');
    Object.assign(this.scrollContainer.style, {
      overflowY: 'auto',
      scrollBehavior: 'smooth',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '220px',
      padding: '8px 12px',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(79, 195, 247, 0.3) transparent',
    });
    this.container.appendChild(this.scrollContainer);

    const toggleBtn = header.querySelector('#toggle-feed')!;
    toggleBtn.addEventListener('click', () => this.toggleVisibility());
  }

  // ==================== Event Listeners ====================

  private setupEventListeners() {
    eventBus.on('monologue:push', (payload: { text: string; type: MonologueType }) => {
      this.addEntry(payload.text, payload.type);
    });

    eventBus.on('monologue:thought', (text: string) => {
      this.addEntry(text, 'thought');
    });

    eventBus.on('monologue:observation', (text: string) => {
      this.addEntry(text, 'observation');
    });

    eventBus.on('monologue:feeling', (text: string) => {
      this.addEntry(text, 'feeling');
    });

    eventBus.on('monologue:clear', () => {
      this.clearFeed();
    });

    eventBus.on('dialogue:node-rendered', (node: any) => {
      if (node.thought) {
        this.addEntry(node.thought, 'thought');
      } else if (node.type === 'character' && node.speaker) {
        this.addEntry(`Receiving input from ${node.speaker.name}. Cross-referencing voiceprint.`, 'scan');
      }
    });

    eventBus.on('dialogue:opened', () => {
      this.dialogueActive = true;
      this.stopIdleTimer();
    });

    eventBus.on('dialogue:closed', () => {
      this.dialogueActive = false;
      this.startIdleTimer();
    });

    eventBus.on('travel:start', () => {
      this.lastTravelTime = Date.now();
    });

    eventBus.on('travel:complete', (data: any) => {
      this.addEntry('Transition complete. New environmental parameters loading.', 'scan');
    });

    eventBus.on('tb:updated', (remaining: number) => {
      this.currentTb = remaining;
      if (remaining <= 5 && remaining > 0) {
        this.addEntry(`Warning: Time block allocation critical. ${remaining} units remaining.`, 'warning');
      } else if (remaining === 0) {
        this.addEntry('Time blocks exhausted. Entering low-power mode.', 'warning');
      }
    });

    eventBus.on('location:loaded', (data: any) => {
      if (data?.scene?.id) {
        this.currentSceneId = data.scene.id;
      }
      if (data?.scene?.metadata?.idle_thoughts) {
        this.idleThoughts = data.scene.metadata.idle_thoughts;
      }
    });

    eventBus.on('location:rendered', (payload: any) => {
      if (payload?.scene?.metadata?.idle_thoughts) {
        this.idleThoughts = payload.scene.metadata.idle_thoughts;
      }
      const mood = payload?.scene?.mood || 'unknown';
      this.addEntry(`Scene loaded. Ambient mood: ${mood.toUpperCase()}. Monitoring.`, 'scan');
    });
  }

  // ==================== Entry Management ====================

  private addEntry(text: string, type: MonologueType) {
    const entry: MonologueEntry = {
      id: `mono-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      timestamp: new Date(),
      type,
    };

    this.entries.push(entry);
    this.pruneOldEntries();
    this.renderEntry(entry);
    this.smartAutoScroll();
  }

  private pruneOldEntries() {
    while (this.entries.length > this.maxEntries) {
      const oldest = this.entries.shift();
      if (oldest) {
        const el = this.scrollContainer.querySelector(`[data-entry-id="${oldest.id}"]`);
        if (el) el.remove();
      }
    }
  }

  private renderEntry(entry: MonologueEntry) {
    const config = TYPE_CONFIG[entry.type];
    const timeStr = entry.timestamp.toLocaleTimeString('en-US', { hour12: false });

    const el = document.createElement('div');
    el.setAttribute('data-entry-id', entry.id);
    Object.assign(el.style, {
      padding: '3px 0',
      opacity: '0',
      transform: 'translateY(4px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      wordBreak: 'break-word',
    });

    const prefix = document.createElement('span');
    prefix.style.color = config.color;
    prefix.style.opacity = '0.55';
    prefix.textContent = `[${timeStr} // ${config.prefix} // TB: ${this.currentTb}]`;

    const body = document.createElement('span');
    body.style.color = entry.type === 'warning' ? config.color : '#b0bec5';
    body.textContent = ` ${entry.text}`;

    el.appendChild(prefix);
    el.appendChild(body);

    this.scrollContainer.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  // ==================== Smart Auto-Scroll ====================

  private smartAutoScroll() {
    const el = this.scrollContainer;
    const threshold = 60;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (isNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  // ==================== Idle Thought Engine ====================

  private startIdleTimer() {
    this.stopIdleTimer();
    this.idleTimer = setInterval(() => this.onIdleTick(), this.idleIntervalMs);
  }

  private stopIdleTimer() {
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private onIdleTick() {
    if (this.dialogueActive) return;

    const timeSinceTravel = Date.now() - this.lastTravelTime;
    if (timeSinceTravel < 15_000) return;

    if (this.idleThoughts.length > 0) {
      const idx = Math.floor(Math.random() * this.idleThoughts.length);
      this.addEntry(this.idleThoughts[idx], 'thought');
    }
  }

  // ==================== Visibility Toggle ====================

  private toggleVisibility() {
    this.isVisible = !this.isVisible;
    const btn = this.container.querySelector('#toggle-feed')!;

    if (this.isVisible) {
      this.scrollContainer.style.display = 'flex';
      btn.textContent = '[MIN]';
    } else {
      this.scrollContainer.style.display = 'none';
      btn.textContent = '[EXP]';
    }
  }

  // ==================== Public API ====================

  private clearFeed() {
    this.entries = [];
    this.scrollContainer.innerHTML = '';
  }

  public destroy() {
    this.stopIdleTimer();
    this.clearFeed();
  }
}
