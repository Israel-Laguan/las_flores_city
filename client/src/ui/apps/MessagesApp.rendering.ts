import type { SMSThreadPreview, SMSThreadDetail, SMSThreadChoice } from '../../../../shared/src/types/sms.js';

export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export function cssEscape(s: string): string {
  return (window as any).CSS?.escape ? (window as any).CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function formatRelativeTime(dateString: string | null | undefined): string {
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

// ── Rich text rendering ───────────────────────────────────────────────────────

export function renderBubbleContents(text: string): DocumentFragment {
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

// ── Inbox rendering ──────────────────────────────────────────────────────────

export function createInboxRow(t: SMSThreadPreview): string {
  const unreadClass = t.unread ? ' unread' : '';
  const dot = t.unread ? `<span class="inbox-unread-dot" aria-label="unread"></span>` : '';
  const initial = (t.characterName ?? '?').charAt(0).toUpperCase();
  const previewText = t.lastMessage?.text ?? '—';
  const preview = previewText.length > 60 ? previewText.slice(0, 57) + '...' : previewText;
  const time = formatRelativeTime(t.lastNpcMessageAt);
  const rel = `F:${t.friendshipLevel} R:${t.romanceLevel}`;

  return `
    <div class="inbox-row${unreadClass}" data-character-id="${escapeAttr(t.characterId)}">
      <div class="inbox-avatar">${escapeHtml(initial)}</div>
      <div class="inbox-row-body">
        <div class="inbox-row-top">
          <span class="inbox-name">${escapeHtml(t.characterName)}${dot}</span>
          <span class="inbox-time">${escapeHtml(time)}</span>
        </div>
        <div class="inbox-preview">${escapeHtml(preview)}</div>
        <div class="inbox-rel">${escapeHtml(rel)}</div>
      </div>
    </div>`;
}

export function renderLoading(message: string): string {
  return `
    <div class="comms-app">
      <div class="comms-header">
        <h2>MESSAGES</h2>
        <span class="comms-conn">SECURE MESH // AES-256</span>
      </div>
      <div class="loading-spinner">${escapeHtml(message)}</div>
    </div>`;
}

export function renderError(message: string, onRetry: () => void, container: HTMLElement): void {
  container.innerHTML = `
    <div class="comms-app">
      <div class="comms-header">
        <h2>MESSAGES</h2>
        <span class="comms-conn">SECURE MESH // AES-256</span>
      </div>
      <div class="app-error">
        <p>${escapeHtml(message)}</p>
        <button id="comms-retry">Reconnect</button>
      </div>
    </div>`;
  container.querySelector('#comms-retry')?.addEventListener('click', onRetry);
}

export function renderInbox(threads: SMSThreadPreview[], container: HTMLElement, onThreadClick: (id: string) => void): void {
  const rows = threads.length === 0
    ? `<div class="inbox-empty">No messages yet. Visit a location to start a conversation.</div>`
    : threads.map((t) => createInboxRow(t)).join('');

  container.innerHTML = `
    <div class="comms-app">
      <div class="comms-header">
        <h2>MESSAGES</h2>
        <span class="comms-conn">SECURE MESH // AES-256</span>
      </div>
      <div class="inbox-list">${rows}</div>
    </div>`;

  threads.forEach((t) => {
    container
      .querySelector(`[data-character-id="${cssEscape(t.characterId)}"]`)
      ?.addEventListener('click', () => onThreadClick(t.characterId));
  });
}

// ── Thread rendering ─────────────────────────────────────────────────────────

export function createBubble(m: { id: string; author: 'npc' | 'player'; text: string; createdAt: string }): string {
  const cls = m.author === 'npc' ? 'npc' : 'player';
  const time = formatRelativeTime(m.createdAt);
  return `<div class="bubble ${cls}" data-message-id="${escapeAttr(m.id)}"><span class="bubble-text"></span><span class="bubble-time">${escapeHtml(time)}</span></div>`;
}

export function createChoiceButton(c: SMSThreadChoice): string {
  const relBadge = c.relationship_change
    ? `<span class="choice-cost">${c.relationship_change.stat === 'friendship' ? '💕 +' : '💜 +'}${c.relationship_change.amount} ${c.relationship_change.stat}</span>`
    : '';
  const costAmount = c.time_block_cost?.amount;
  const costBadge = costAmount && costAmount > 0
    ? `<span class="choice-cost">🕒 -${costAmount} TB</span>`
    : '';
  return `
    <button class="choice-btn" data-choice-id="${escapeAttr(c.id)}">
      ${escapeHtml(c.text)}
      ${relBadge}${costBadge}
    </button>`;
}

export function renderThread(
  detail: SMSThreadDetail,
  container: HTMLElement,
  onBack: () => void,
  onChoiceClick: (choiceId: string) => void,
  onSkipClick: () => void
): void {
  const titleSuffix = detail.characterTitle 
    ? ` <span style="opacity:0.6">// ${escapeHtml(detail.characterTitle)}</span>` 
    : '';
  const bubbles = detail.chatHistory.map((m) => createBubble(m)).join('');
  const endMarker = detail.isEnd
    ? `<div class="thread-end">— conversation ended —</div>`
    : '';
  const choices = (!detail.isEnd && detail.choices.length > 0)
    ? `<div class="choices">${detail.choices.map((c) => createChoiceButton(c)).join('')}</div>`
    : (!detail.isEnd ? `<div class="no-choices">No replies available right now.</div>` : '');
  const rel = `F:${detail.friendshipLevel}  R:${detail.romanceLevel}`;

  container.innerHTML = `
    <div class="comms-app">
      <div class="comms-header">
        <div>
          <button class="comms-back" id="comms-back">◀ INBOX</button>
        </div>
        <h2>${escapeHtml(detail.characterName)}${titleSuffix}</h2>
        <span class="comms-conn">${escapeHtml(rel)}</span>
      </div>
      <div class="thread-scroll">${bubbles}${endMarker}</div>
      ${choices}
    </div>`;

  detail.chatHistory.forEach((m) => {
    const node = container.querySelector<HTMLElement>(
      `[data-message-id="${cssEscape(m.id)}"] .bubble-text`
    );
    if (node) node.appendChild(renderBubbleContents(m.text));
  });

  container.querySelector('#comms-back')?.addEventListener('click', onBack);

  detail.choices.forEach((c) => {
    container
      .querySelector(`[data-choice-id="${cssEscape(c.id)}"]`)
      ?.addEventListener('click', () => onChoiceClick(c.id));
  });

  // Wire skip-on-tap
  const scroll = container.querySelector<HTMLElement>('.thread-scroll');
  if (scroll) {
    scroll.addEventListener('click', onSkipClick);
  }
}

export function scrollThreadToBottom(container: HTMLElement): void {
  const scroll = container.querySelector<HTMLElement>('.thread-scroll');
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}

export function setChoicesDisabled(container: HTMLElement, disabled: boolean): void {
  container.querySelectorAll<HTMLButtonElement>('.choice-btn').forEach((b) => {
    b.disabled = disabled;
  });
}

export function appendInlineError(container: HTMLElement, message: string): void {
  const scroll = container.querySelector('.thread-scroll');
  if (!scroll) return;
  const errEl = document.createElement('div');
  errEl.className = 'app-error';
  errEl.style.cssText = 'padding:8px;border:1px solid #f88;color:#f88;font-size:0.7rem;';
  errEl.textContent = message;
  scroll.appendChild(errEl);
  scrollThreadToBottom(container);
  setTimeout(() => errEl.remove(), 4000);
}
