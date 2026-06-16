import { eventBus } from '../utils/EventBus';
const TYPE_CONFIG = {
    thought: { color: '#4fc3f7', prefix: 'I.I.', label: 'INTROSPECTION' },
    observation: { color: '#78909c', prefix: 'OBS', label: 'OBSERVATION' },
    feeling: { color: '#ce93d8', prefix: 'FEL', label: 'EMOTIONAL' },
    warning: { color: '#ffb74d', prefix: 'N&M', label: 'SYSTEM' },
    scan: { color: '#81c784', prefix: 'SCN', label: 'ENV_SCAN' },
};
export class MonologueFeed {
    container;
    scrollContainer;
    entries = [];
    maxEntries = 50;
    currentTb = 48;
    currentSceneId = null;
    idleThoughts = [];
    isVisible = true;
    idleTimer = null;
    idleIntervalMs = 20_000;
    lastTravelTime = 0;
    dialogueActive = false;
    constructor() {
        this.container = document.getElementById('monologue-feed');
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
    setupStyles() {
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
    createStructure() {
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
        const toggleBtn = header.querySelector('#toggle-feed');
        toggleBtn.addEventListener('click', () => this.toggleVisibility());
    }
    // ==================== Event Listeners ====================
    setupEventListeners() {
        eventBus.on('monologue:push', (payload) => {
            this.addEntry(payload.text, payload.type);
        });
        eventBus.on('monologue:thought', (text) => {
            this.addEntry(text, 'thought');
        });
        eventBus.on('monologue:observation', (text) => {
            this.addEntry(text, 'observation');
        });
        eventBus.on('monologue:feeling', (text) => {
            this.addEntry(text, 'feeling');
        });
        eventBus.on('monologue:clear', () => {
            this.clearFeed();
        });
        eventBus.on('dialogue:node-rendered', (node) => {
            if (node.thought) {
                this.addEntry(node.thought, 'thought');
            }
            else if (node.type === 'character' && node.speaker) {
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
        eventBus.on('travel:complete', (data) => {
            this.addEntry('Transition complete. New environmental parameters loading.', 'scan');
        });
        eventBus.on('tb:updated', (remaining) => {
            this.currentTb = remaining;
            if (remaining <= 5 && remaining > 0) {
                this.addEntry(`Warning: Time block allocation critical. ${remaining} units remaining.`, 'warning');
            }
            else if (remaining === 0) {
                this.addEntry('Time blocks exhausted. Entering low-power mode.', 'warning');
            }
        });
        eventBus.on('location:loaded', (data) => {
            if (data?.scene?.id) {
                this.currentSceneId = data.scene.id;
            }
            if (data?.scene?.metadata?.idle_thoughts) {
                this.idleThoughts = data.scene.metadata.idle_thoughts;
            }
        });
        eventBus.on('location:rendered', (payload) => {
            if (payload?.scene?.metadata?.idle_thoughts) {
                this.idleThoughts = payload.scene.metadata.idle_thoughts;
            }
            const mood = payload?.scene?.mood || 'unknown';
            this.addEntry(`Scene loaded. Ambient mood: ${mood.toUpperCase()}. Monitoring.`, 'scan');
        });
    }
    // ==================== Entry Management ====================
    addEntry(text, type) {
        const entry = {
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
    pruneOldEntries() {
        while (this.entries.length > this.maxEntries) {
            const oldest = this.entries.shift();
            if (oldest) {
                const el = this.scrollContainer.querySelector(`[data-entry-id="${oldest.id}"]`);
                if (el)
                    el.remove();
            }
        }
    }
    renderEntry(entry) {
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
    smartAutoScroll() {
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
    startIdleTimer() {
        this.stopIdleTimer();
        this.idleTimer = setInterval(() => this.onIdleTick(), this.idleIntervalMs);
    }
    stopIdleTimer() {
        if (this.idleTimer !== null) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
    }
    onIdleTick() {
        if (this.dialogueActive)
            return;
        const timeSinceTravel = Date.now() - this.lastTravelTime;
        if (timeSinceTravel < 15_000)
            return;
        if (this.idleThoughts.length > 0) {
            const idx = Math.floor(Math.random() * this.idleThoughts.length);
            this.addEntry(this.idleThoughts[idx], 'thought');
        }
    }
    // ==================== Visibility Toggle ====================
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        const btn = this.container.querySelector('#toggle-feed');
        if (this.isVisible) {
            this.scrollContainer.style.display = 'flex';
            btn.textContent = '[MIN]';
        }
        else {
            this.scrollContainer.style.display = 'none';
            btn.textContent = '[EXP]';
        }
    }
    // ==================== Public API ====================
    clearFeed() {
        this.entries = [];
        this.scrollContainer.innerHTML = '';
    }
    destroy() {
        this.stopIdleTimer();
        this.clearFeed();
    }
}
