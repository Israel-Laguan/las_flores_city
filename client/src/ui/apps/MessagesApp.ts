import { phoneStore } from '../../store/PhoneStore.js';
import { eventBus } from '../../utils/EventBus.js';
import type {
  SMSThreadPreview,
  SMSThreadDetail,
  SMSThreadChoice,
  SMSInboxResponse,
} from '../../../../shared/src/types/sms.js';

type View = 'inbox' | 'thread' | 'loading' | 'error';

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

const API_BASE = '/comms';

export class MessagesApp {
  private container: HTMLElement;
  private view: View = 'inbox';
  private activeCharacterId: string | null = null;
  private activeThread: SMSThreadDetail | null = null;
  private replying = false;
  private typewriterInterval: number | null = null;
  private skipRequested = false;
  private isPacing = false;
  private aborted = false;
  private activePacingTimeout: number | null = null;
  private resolveActivePacing: (() => void) | null = null;
  private subs: Array<[string, (...a: any[]) => void]> = [];

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    void this.init();
    const onOpen = (key: string) => {
      if (key === 'messages' && (this.view === 'inbox' || this.view === 'error')) {
        void this.loadInbox();
      }
    };
    this.subs.push(['phone:app-opened', onOpen]);
    eventBus.on('phone:app-opened', onOpen);
  }

  destroy(): void {
    this.aborted = true;
    if (this.activePacingTimeout) window.clearTimeout(this.activePacingTimeout);
    if (this.typewriterInterval) window.clearInterval(this.typewriterInterval);
    for (const [e, h] of this.subs) eventBus.off(e, h);
    this.subs = [];
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('jwt');
    return token
      ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }

  private async init(): Promise<void> {
    this.view = 'inbox';
    this.activeCharacterId = null;
    this.activeThread = null;
    await this.loadInbox();
  }

  private async loadInbox(): Promise<void> {
    this.renderLoading('Decrypting message queue...');
    try {
      const res = await fetch(`${API_BASE}/inbox?_t=${Date.now()}`, {
        headers: this.getAuthHeaders(),
      });
      const json: Envelope<SMSInboxResponse> = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const threads = json.data.threads ?? [];
      this.updateUnreadCount(threads);
      this.view = 'inbox';
      this.renderInbox(threads);
    } catch (e: any) {
      this.view = 'error';
      this.renderError('Net Connection lost.', () => this.loadInbox());
    }
  }

  private async openThread(characterId: string): Promise<void> {
    this.activeCharacterId = characterId;
    this.renderLoading('Establishing secure channel...');
    try {
      const res = await fetch(`${API_BASE}/thread/${encodeURIComponent(characterId)}`, {
        headers: this.getAuthHeaders(),
      });
      const json: Envelope<SMSThreadDetail> = await res.json();
      if (!res.ok || !json.success) {
        if (res.status === 404) {
          throw new Error('Thread not found.');
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      this.activeThread = json.data;
      this.view = 'thread';
      void this.renderThread(json.data);
      void this.markRead(characterId);
    } catch (e: any) {
      this.view = 'error';
      this.renderError(e?.message ?? 'Uplink failure.', () => this.openThread(characterId));
    }
  }

  private async markRead(characterId: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/read`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ characterId }),
      });
      const json: Envelope<{ updated: number }> = await res.json();
      if (res.ok && json.success) {
        const wasUnread = this.activeThread?.unread === true;
        if (wasUnread) {
          const current = phoneStore.getState().unreadMessagesCount;
          phoneStore.updateState({ unreadMessagesCount: Math.max(0, current - 1) });
          if (this.activeThread) this.activeThread = { ...this.activeThread, unread: false };
        }
      }
    } catch (e) {
      console.warn('comms.read fire-and-forget failed:', e);
    }
  }

  private async sendReply(choiceId: string): Promise<void> {
    if (this.replying || !this.activeCharacterId) return;
    this.replying = true;
    this.setChoicesDisabled(true);
    try {
      const res = await fetch(`${API_BASE}/reply`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          characterId: this.activeCharacterId,
          choiceId,
        }),
      });
      const json: Envelope<SMSThreadDetail> = await res.json();
      if (!res.ok || !json.success) {
        if (res.status === 402) {
          throw new Error('Insufficient time-blocks.');
        }
        if (res.status === 404) {
          throw new Error('Choice unavailable.');
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      this.activeThread = json.data;
      void this.renderThread(json.data);
      void this.loadInbox();
    } catch (e: any) {
      this.setChoicesDisabled(false);
      this.appendInlineError(e?.message ?? 'Reply failed.');
    } finally {
      this.replying = false;
    }
  }

  async startThread(characterId: string): Promise<void> {
    this.renderLoading('Opening channel...');
    try {
      const res = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ characterId }),
      });
      const json: Envelope<SMSThreadDetail> = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      this.activeThread = json.data;
      this.activeCharacterId = characterId;
      this.view = 'thread';
      void this.renderThread(json.data);
      void this.loadInbox();
    } catch (e: any) {
      this.view = 'error';
      this.renderError(e?.message ?? 'Channel open failed.', () => this.startThread(characterId));
    }
  }

  private updateUnreadCount(threads: SMSThreadPreview[]): void {
    const unreadMessagesCount = threads.filter((t) => t.unread).length;
    const previousCount = phoneStore.getState().unreadMessagesCount;
    phoneStore.updateState({ unreadMessagesCount });
    // Emit comms:new_message when new unread messages arrive
    if (unreadMessagesCount > previousCount) {
      eventBus.emit('comms:new_message', { count: unreadMessagesCount });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────────────────

  private renderLoading(message: string): void {
    this.container.innerHTML = `
      <div class="comms-app">
        <div class="comms-header">
          <h2>MESSAGES</h2>
          <span class="comms-conn">SECURE MESH // AES-256</span>
        </div>
        <div class="loading-spinner">${this.escapeHtml(message)}</div>
      </div>`;
  }

  private renderError(message: string, onRetry: () => void): void {
    this.container.innerHTML = `
      <div class="comms-app">
        <div class="comms-header">
          <h2>MESSAGES</h2>
          <span class="comms-conn">SECURE MESH // AES-256</span>
        </div>
        <div class="app-error">
          <p>${this.escapeHtml(message)}</p>
          <button id="comms-retry">Reconnect</button>
        </div>
      </div>`;
    this.container.querySelector('#comms-retry')?.addEventListener('click', onRetry);
  }

  private renderInbox(threads: SMSThreadPreview[]): void {
    const rows = threads.length === 0
      ? `<div class="inbox-empty">No messages yet. Visit a location to start a conversation.</div>`
      : threads.map((t) => this.createInboxRow(t)).join('');

    this.container.innerHTML = `
      <div class="comms-app">
        <div class="comms-header">
          <h2>MESSAGES</h2>
          <span class="comms-conn">SECURE MESH // AES-256</span>
        </div>
        <div class="inbox-list">${rows}</div>
      </div>`;

    threads.forEach((t) => {
      this.container
        .querySelector(`[data-character-id="${this.cssEscape(t.characterId)}"]`)
        ?.addEventListener('click', () => this.openThread(t.characterId));
    });
  }

  private createInboxRow(t: SMSThreadPreview): string {
    const unreadClass = t.unread ? ' unread' : '';
    const dot = t.unread ? `<span class="inbox-unread-dot" aria-label="unread"></span>` : '';
    const initial = (t.characterName ?? '?').charAt(0).toUpperCase();
    const previewText = t.lastMessage?.text ?? '—';
    const preview = previewText.length > 60 ? previewText.slice(0, 57) + '...' : previewText;
    const time = this.formatRelativeTime(t.lastNpcMessageAt);
    const rel = `F:${t.friendshipLevel} R:${t.romanceLevel}`;

    return `
      <div class="inbox-row${unreadClass}" data-character-id="${this.escapeAttr(t.characterId)}">
        <div class="inbox-avatar">${this.escapeHtml(initial)}</div>
        <div class="inbox-row-body">
          <div class="inbox-row-top">
            <span class="inbox-name">${this.escapeHtml(t.characterName)}${dot}</span>
            <span class="inbox-time">${this.escapeHtml(time)}</span>
          </div>
          <div class="inbox-preview">${this.escapeHtml(preview)}</div>
          <div class="inbox-rel">${this.escapeHtml(rel)}</div>
        </div>
      </div>`;
  }

  private async renderThread(detail: SMSThreadDetail): Promise<void> {
    const titleSuffix = detail.characterTitle ? ` <span style="opacity:0.6">// ${this.escapeHtml(detail.characterTitle)}</span>` : '';
    const bubbles = detail.chatHistory.map((m) => this.createBubble(m)).join('');
    const endMarker = detail.isEnd
      ? `<div class="thread-end">— conversation ended —</div>`
      : '';
    const choices = (!detail.isEnd && detail.choices.length > 0)
      ? `<div class="choices">${detail.choices.map((c) => this.createChoiceButton(c)).join('')}</div>`
      : (!detail.isEnd ? `<div class="no-choices">No replies available right now.</div>` : '');
    const rel = `F:${detail.friendshipLevel}  R:${detail.romanceLevel}`;

    this.container.innerHTML = `
      <div class="comms-app">
        <div class="comms-header">
          <div>
            <button class="comms-back" id="comms-back">◀ INBOX</button>
          </div>
          <h2>${this.escapeHtml(detail.characterName)}${titleSuffix}</h2>
          <span class="comms-conn">${this.escapeHtml(rel)}</span>
        </div>
        <div class="thread-scroll">${bubbles}${endMarker}</div>
        ${choices}
      </div>`;

    detail.chatHistory.forEach((m) => {
      const node = this.container.querySelector<HTMLElement>(
        `[data-message-id="${this.cssEscape(m.id)}"] .bubble-text`
      );
      if (node) node.appendChild(this.renderBubbleContents(m.text));
    });

    this.container.querySelector('#comms-back')?.addEventListener('click', () => {
      this.activeCharacterId = null;
      this.activeThread = null;
      void this.loadInbox();
    });

    detail.choices.forEach((c) => {
      this.container
        .querySelector(`[data-choice-id="${this.cssEscape(c.id)}"]`)
        ?.addEventListener('click', () => this.sendReply(c.id));
    });

    // Wire skip-on-tap: click anywhere in thread-scroll to instantly complete pacing
    const scroll = this.container.querySelector<HTMLElement>('.thread-scroll');
    if (scroll) {
      scroll.addEventListener('click', () => {
        this.skipRequested = true;
        if (this.activePacingTimeout) {
          window.clearTimeout(this.activePacingTimeout);
          this.activePacingTimeout = null;
        }
        if (this.resolveActivePacing) {
          this.resolveActivePacing();
          this.resolveActivePacing = null;
        }
      });
    }

    await this.pacedDelivery(detail);
    this.scrollThreadToBottom();
  }

  private createBubble(m: { id: string; author: 'npc' | 'player'; text: string; createdAt: string }): string {
    const cls = m.author === 'npc' ? 'npc' : 'player';
    const time = this.formatRelativeTime(m.createdAt);
    return `<div class="bubble ${cls}" data-message-id="${this.escapeAttr(m.id)}"><span class="bubble-text"></span><span class="bubble-time">${this.escapeHtml(time)}</span></div>`;
  }

  // ── Task 6.2: Paced NPC message delivery ──────────────────────────────

  private async pacedDelivery(detail: SMSThreadDetail): Promise<void> {
    this.isPacing = true;
    this.skipRequested = false;
    const scroll = this.container.querySelector<HTMLElement>('.thread-scroll');
    if (!scroll) { this.isPacing = false; return; }

    const npcMessages = detail.chatHistory.filter((m) => m.author === 'npc');

    for (const m of npcMessages) {
      if (this.aborted || this.skipRequested) break;

      const bubbleText = scroll.querySelector<HTMLElement>(
        `[data-message-id="${this.cssEscape(m.id)}"] .bubble-text`
      );
      if (!bubbleText) continue;

      // Hide the pre-rendered text so we can reveal it progressively
      bubbleText.textContent = '';
      const bubbleEl = bubbleText.parentElement;

      if (bubbleEl) {
        await this.showTypingBubble(scroll, bubbleEl, m.text.length);
      }
      if (this.aborted || this.skipRequested) {
        // Restore full text and move on
        bubbleText.textContent = '';
        bubbleText.appendChild(this.renderBubbleContents(m.text));
        this.scrollThreadToBottom();
        continue;
      }

      await this.typewriterReveal(bubbleText, m.text);
    }

    this.isPacing = false;
  }

  private async showTypingBubble(
    _container: HTMLElement,
    bubbleEl: HTMLElement,
    textLength: number
  ): Promise<void> {
    const typing = document.createElement('div');
    typing.className = 'bubble npc typing';
    typing.innerHTML = '<div class="typing-dot"></div>'.repeat(3);

    bubbleEl.after(typing);
    this.scrollThreadToBottom();

    eventBus.emit('audio:play_sfx', {
      key: 'sfx_sms_typing_loop',
      url: 'https://cdn.lasflores2077.com/audio/sfx_sms_typing.mp3',
    });

    const delay = Math.max(600, Math.min(2000, textLength * 25));
    await new Promise<void>((resolve) => {
      this.resolveActivePacing = resolve;
      this.activePacingTimeout = window.setTimeout(() => {
        this.resolveActivePacing = null;
        this.activePacingTimeout = null;
        resolve();
      }, delay);
    });

    typing.remove();
  }

  private typewriterReveal(bubbleText: HTMLElement, text: string): Promise<void> {
    // Parse into segments: plain strings and <important> tags
    const segments: Array<
      { type: 'plain'; text: string } | { type: 'important'; text: string }
    > = [];
    const re = /<important>([\s\S]*?)<\/important>/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIdx) {
        segments.push({ type: 'plain', text: text.slice(lastIdx, match.index) });
      }
      segments.push({ type: 'important', text: match[1] });
      lastIdx = re.lastIndex;
    }
    if (lastIdx < text.length) {
      segments.push({ type: 'plain', text: text.slice(lastIdx) });
    }

    bubbleText.textContent = '';
    let segIdx = 0;
    let charIdx = 0;
    let currentText: Text | null = null;
    let charsEmitted = 0;

    return new Promise<void>((resolve) => {
      this.typewriterInterval = window.setInterval(() => {
        if (this.skipRequested || this.aborted) {
          window.clearInterval(this.typewriterInterval!);
          this.typewriterInterval = null;
          bubbleText.textContent = '';
          bubbleText.appendChild(this.renderBubbleContents(text));
          resolve();
          return;
        }

        if (segIdx >= segments.length) {
          window.clearInterval(this.typewriterInterval!);
          this.typewriterInterval = null;
          resolve();
          return;
        }

        const seg = segments[segIdx];
        if (seg.type === 'important') {
          const el = document.createElement('important');
          el.textContent = seg.text;
          bubbleText.appendChild(el);
          segIdx++;
          charsEmitted += seg.text.length;
        } else {
          if (!currentText) {
            currentText = document.createTextNode('');
            bubbleText.appendChild(currentText);
          }
          currentText.textContent += seg.text[charIdx];
          charIdx++;
          charsEmitted++;
          if (charIdx >= seg.text.length) {
            segIdx++;
            charIdx = 0;
            currentText = null;
          }
        }

        // SFX every 2nd character (matches DialogueUI throttle)
        if (charsEmitted % 2 === 0) {
          eventBus.emit('audio:play_sfx', {
            key: 'sfx_mech_click',
            url: 'https://cdn.lasflores2077.com/audio/sfx_mech_click.mp3',
          });
        }
        this.scrollThreadToBottom();
      }, 30);
    });
  }

  // ── End Task 6.2 pacing ────────────────────────────────────────────────

  private createChoiceButton(c: SMSThreadChoice): string {
    const relBadge = c.relationship_change
      ? `<span class="choice-cost">${c.relationship_change.stat === 'friendship' ? '💕 +' : '💜 +'}${c.relationship_change.amount} ${c.relationship_change.stat}</span>`
      : '';
    const costAmount = c.time_block_cost?.amount;
    const costBadge = costAmount && costAmount > 0
      ? `<span class="choice-cost">🕒 -${costAmount} TB</span>`
      : '';
    return `
      <button class="choice-btn" data-choice-id="${this.escapeAttr(c.id)}">
        ${this.escapeHtml(c.text)}
        ${relBadge}${costBadge}
      </button>`;
  }

  private setChoicesDisabled(disabled: boolean): void {
    this.container.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach((b) => {
      b.disabled = disabled;
    });
  }

  private appendInlineError(message: string): void {
    const scroll = this.container.querySelector('.thread-scroll');
    if (!scroll) return;
    const errEl = document.createElement('div');
    errEl.className = 'app-error';
    errEl.style.cssText = 'padding:8px;border:1px solid #f88;color:#f88;font-size:0.7rem;';
    errEl.textContent = message;
    scroll.appendChild(errEl);
    this.scrollThreadToBottom();
    setTimeout(() => errEl.remove(), 4000);
  }

  private scrollThreadToBottom(): void {
    const scroll = this.container.querySelector<HTMLElement>('.thread-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Rich text: render <important>...</important> as styled <important> nodes
  // Returns a DocumentFragment — appends to a bubble <div> after setting
  // innerHTML. The CSS styles `important { color: var(--neon-magenta); ... }`.
  // ───────────────────────────────────────────────────────────────────────

  private renderBubbleContents(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const re = /<important>([\s\S]*?)<\/important>/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }
      const imp = document.createElement('important');
      imp.textContent = m[1];
      frag.appendChild(imp);
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    return frag;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────

  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttr(s: string): string {
    return this.escapeHtml(s);
  }

  private cssEscape(s: string): string {
    return (window as any).CSS?.escape ? (window as any).CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  private formatRelativeTime(dateString: string | null | undefined): string {
    if (!dateString) return '';
    const diff = Date.now() - new Date(dateString).getTime();
    if (Number.isNaN(diff) || diff < 0) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
