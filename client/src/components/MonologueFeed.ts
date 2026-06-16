import { eventBus } from '../utils/EventBus';

interface MonologueEntry {
  id: string;
  text: string;
  timestamp: Date;
  type: 'thought' | 'observation' | 'feeling';
}

export class MonologueFeed {
  private container: HTMLDivElement;
  private feedContainer!: HTMLDivElement;
  private entries: MonologueEntry[] = [];
  private maxEntries: number = 20;
  private isVisible: boolean = true;

  constructor() {
    this.container = document.getElementById('monologue-feed') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'monologue-feed';
      document.body.appendChild(this.container);
    }
    this.setupStyles();
    this.createFeedStructure();
    this.setupEventListeners();
  }

  private setupStyles() {
    this.container.style.position = 'fixed';
    this.container.style.bottom = '20px';
    this.container.style.left = '20px';
    this.container.style.width = '350px';
    this.container.style.maxHeight = '200px';
    this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.container.style.border = '1px solid rgba(0, 255, 0, 0.3)';
    this.container.style.borderRadius = '8px';
    this.container.style.padding = '15px';
    this.container.style.fontFamily = 'monospace';
    this.container.style.zIndex = '1500';
    this.container.style.overflow = 'hidden';
  }

  private createFeedStructure() {
    this.container.innerHTML = `
      <div class="feed-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(0, 255, 0, 0.3);
      ">
        <span style="
          font-size: 11px;
          color: #00ff00;
          text-transform: uppercase;
          letter-spacing: 1px;
        ">Internal Thoughts</span>
        <button id="toggle-feed" style="
          background: none;
          border: none;
          color: #888;
          cursor: pointer;
          font-size: 10px;
          font-family: monospace;
        ">[HIDE]</button>
      </div>
      <div class="feed-content" style="
        max-height: 150px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #00ff00 #0a0a1a;
      "></div>
    `;

    this.feedContainer = this.container.querySelector('.feed-content') as HTMLDivElement;

    // Toggle button
    const toggleBtn = this.container.querySelector('#toggle-feed');
    toggleBtn?.addEventListener('click', () => {
      this.toggleVisibility();
    });
  }

  private setupEventListeners() {
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
        this.addEntry(`Listening to ${node.speaker.name}...`, 'observation');
      }
    });

    eventBus.on('travel:complete', (data: any) => {
      this.addEntry('The city shifts around me. New sights, new sounds.', 'observation');
    });

    eventBus.on('tb:updated', (remaining: number) => {
      if (remaining <= 5) {
        this.addEntry(`Time is running low... ${remaining} blocks left.`, 'feeling');
      }
    });
  }

  private addEntry(text: string, type: MonologueEntry['type']) {
    const entry: MonologueEntry = {
      id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      timestamp: new Date(),
      type,
    };

    this.entries.push(entry);

    // Limit entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    this.renderEntry(entry);
  }

  private renderEntry(entry: MonologueEntry) {
    const colors = {
      thought: '#00ff00',
      observation: '#888888',
      feeling: '#ff00ff',
    };

    const prefixes = {
      thought: '...',
      observation: '•',
      feeling: '~',
    };

    const entryElement = document.createElement('div');
    entryElement.className = 'feed-entry';
    entryElement.style.cssText = `
      margin-bottom: 8px;
      padding: 6px 10px;
      background: rgba(0, 255, 0, 0.05);
      border-left: 2px solid ${colors[entry.type]};
      font-size: 11px;
      color: ${colors[entry.type]};
      line-height: 1.4;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
    `;

    entryElement.innerHTML = `
      <span style="opacity: 0.6;">${prefixes[entry.type]}</span> ${entry.text}
    `;

    this.feedContainer.appendChild(entryElement);

    // Animate in
    requestAnimationFrame(() => {
      entryElement.style.opacity = '1';
      entryElement.style.transform = 'translateY(0)';
    });

    // Scroll to bottom
    this.feedContainer.scrollTop = this.feedContainer.scrollHeight;

    // Fade out old entries
    this.fadeOldEntries();
  }

  private fadeOldEntries() {
    const entries = this.feedContainer.querySelectorAll('.feed-entry');
    entries.forEach((entry, index) => {
      const age = entries.length - index;
      if (age > 5) {
        (entry as HTMLElement).style.opacity = '0.3';
      }
      if (age > 10) {
        (entry as HTMLElement).style.opacity = '0.1';
      }
    });
  }

  private toggleVisibility() {
    this.isVisible = !this.isVisible;
    const content = this.container.querySelector('.feed-content') as HTMLElement;
    const toggleBtn = this.container.querySelector('#toggle-feed');

    if (this.isVisible) {
      content.style.display = 'block';
      if (toggleBtn) toggleBtn.textContent = '[HIDE]';
    } else {
      content.style.display = 'none';
      if (toggleBtn) toggleBtn.textContent = '[SHOW]';
    }
  }

  private clearFeed() {
    this.entries = [];
    this.feedContainer.innerHTML = '';
  }
}
