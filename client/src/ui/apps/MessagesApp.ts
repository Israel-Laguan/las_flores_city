import { phoneStore } from '../../store/PhoneStore.js';
import { eventBus } from '../../utils/EventBus.js';
import type {
  SMSThreadPreview,
  SMSThreadDetail,
  SMSInboxResponse,
} from '../../../../shared/src/types/sms.js';
import {
  renderLoading,
  renderError,
  renderInbox,
  renderThread,
  renderBubbleContents,
  scrollThreadToBottom,
  setChoicesDisabled,
  appendInlineError,
  createBubble,
  createChoiceButton,
} from './MessagesApp.rendering.js';

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
    // Auth is handled by HttpOnly cookie (credentials:'same-origin' on fetch).
    return { 'Content-Type': 'application/json' };
  }

  private async init(): Promise<void> {
    this.view = 'inbox';
    this.activeCharacterId = null;
    this.activeThread = null;
    await this.loadInbox();
  }

  private async loadInbox(): Promise<void> {
    this.container.innerHTML = renderLoading('Decrypting message queue...');
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
      renderInbox(threads, this.container, (id) => this.openThread(id));
    } catch (e: any) {
      this.view = 'error';
      renderError(e?.message ?? 'Net Connection lost.', () => this.loadInbox(), this.container);
    }
  }

  private async openThread(characterId: string): Promise<void> {
    this.activeCharacterId = characterId;
    this.container.innerHTML = renderLoading('Establishing secure channel...');
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
      await this.renderThreadInternal(json.data);
      void this.markRead(characterId);
    } catch (e: any) {
      this.view = 'error';
      renderError(e?.message ?? 'Uplink failure.', () => this.openThread(characterId), this.container);
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
    setChoicesDisabled(this.container, true);
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
      await this.renderThreadInternal(json.data);
      void this.loadInbox();
    } catch (e: any) {
      setChoicesDisabled(this.container, false);
      appendInlineError(this.container, e?.message ?? 'Reply failed.');
    } finally {
      this.replying = false;
    }
  }

  async startThread(characterId: string): Promise<void> {
    this.container.innerHTML = renderLoading('Opening channel...');
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
      await this.renderThreadInternal(json.data);
      void this.loadInbox();
    } catch (e: any) {
      this.view = 'error';
      renderError(e?.message ?? 'Channel open failed.', () => this.startThread(characterId), this.container);
    }
  }

  private updateUnreadCount(threads: SMSThreadPreview[]): void {
    const unreadMessagesCount = threads.filter((t) => t.unread).length;
    const previousCount = phoneStore.getState().unreadMessagesCount;
    phoneStore.updateState({ unreadMessagesCount });
    if (unreadMessagesCount > previousCount) {
      eventBus.emit('comms:new_message', { count: unreadMessagesCount });
    }
  }

  private async renderThreadInternal(detail: SMSThreadDetail): Promise<void> {
    renderThread(
      detail,
      this.container,
      () => {
        this.activeCharacterId = null;
        this.activeThread = null;
        void this.loadInbox();
      },
      (choiceId) => this.sendReply(choiceId),
      () => {
        this.skipRequested = true;
        if (this.activePacingTimeout) {
          window.clearTimeout(this.activePacingTimeout);
          this.activePacingTimeout = null;
        }
        if (this.resolveActivePacing) {
          this.resolveActivePacing();
          this.resolveActivePacing = null;
        }
      }
    );
    await this.pacedDelivery(detail);
    scrollThreadToBottom(this.container);
  }

  // ── Paced delivery () ───────────────────────────────────────────────

  private async pacedDelivery(detail: SMSThreadDetail): Promise<void> {
    this.isPacing = true;
    this.skipRequested = false;
    const scroll = this.container.querySelector<HTMLElement>('.thread-scroll');
    if (!scroll) { this.isPacing = false; return; }

    const npcMessages = detail.chatHistory.filter((m) => m.author === 'npc');

    for (const m of npcMessages) {
      if (this.aborted || this.skipRequested) break;

      const bubbleText = scroll.querySelector<HTMLElement>(
        `[data-message-id="${(window as any).CSS?.escape ? (window as any).CSS.escape(m.id) : m.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}"] .bubble-text`
      );
      if (!bubbleText) continue;

      bubbleText.textContent = '';
      const bubbleEl = bubbleText.parentElement;

      if (bubbleEl) {
        await this.showTypingBubble(scroll, bubbleEl, m.text.length);
      }
      if (this.aborted || this.skipRequested) {
        bubbleText.textContent = '';
        bubbleText.appendChild(renderBubbleContents(m.text));
        scrollThreadToBottom(this.container);
        continue;
      }

      await this.typewriterReveal(bubbleText, m.text);
    }

    this.isPacing = false;
  }

  private async showTypingBubble(_container: HTMLElement, bubbleEl: HTMLElement, textLength: number): Promise<void> {
    const typing = document.createElement('div');
    typing.className = 'bubble npc typing';
    typing.innerHTML = '<div class="typing-dot"></div>'.repeat(3);

    bubbleEl.after(typing);
    scrollThreadToBottom(this.container);

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
    const segments: Array<{ type: 'plain' | 'important'; text: string }> = [];
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
          bubbleText.appendChild(renderBubbleContents(text));
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

        if (charsEmitted % 2 === 0) {
          eventBus.emit('audio:play_sfx', {
            key: 'sfx_mech_click',
            url: 'https://cdn.lasflores2077.com/audio/sfx_mech_click.mp3',
          });
        }
        scrollThreadToBottom(this.container);
      }, 30);
    });
  }
}
