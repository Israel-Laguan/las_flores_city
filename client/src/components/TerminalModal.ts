import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import '../styles/terminal-modal.css';

/**
 * TerminalModal — diegetic replacement for browser dialogs.
 *
 * Renders two kinds of overlay, both styled as in-fiction terminal surfaces:
 *   • confirm — faction-themed authorization prompt (replaces confirm())
 *   • error   — fatal system-exception screen with 5s auto-retry loop
 *               (replaces the implicit "page just broke" state on network/5xx)
 *
 * Lifecycle is single-flight: at most one modal is shown at a time. Concurrent
 * errors are FIFO-queued (or coalesced when their signature matches the active
 * error), so a background SMS poll failing 10× shows once, not 10×, and never
 * stacks DOM or leaks timers. See §1 of the Task 6.4 spec.
 *
 * The component knows nothing about fetch; it only consumes `ui:show_*` events.
 * fetchAPI knows nothing about the DOM; it only emits `ui:show_error`. The
 * eventBus is the only integration seam.
 */

type Mode = 'confirm' | 'error' | 'idle';

export interface ConfirmConfig {
  id: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface ErrorConfig {
  id: string;
  /** Normalized `${method} ${endpoint}` — used for coalescing duplicates. */
  signature: string;
  code: string;
  message: string;
  /** Modal-invoked. Resolves ⟹ close + drain queue. Rejects ⟹ re-render. */
  retry: () => Promise<unknown>;
  /** Modal-invoked on explicit dismiss / Escape. Rejects the suspended caller. */
  abort: () => void;
}

interface ActiveConfirm {
  config: ConfirmConfig;
}

interface ActiveError {
  config: ErrorConfig;
  countdown: number;
}

const COUNTDOWN_SECONDS = 5;

export class TerminalModal {
  private mode: Mode = 'idle';
  private overlay: HTMLElement;
  private contentBox: HTMLElement;

  private errorQueue: ErrorConfig[] = [];
  private activeError: ActiveError | null = null;
  private activeConfirm: ActiveConfirm | null = null;

  private countdownTimer: number | null = null;
  private lastFocused: HTMLElement | null = null;
  private boundKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'terminal-modal-overlay';
    this.overlay.className = 'terminal-modal-overlay';
    this.overlay.hidden = true;
    this.overlay.setAttribute('data-alignment', 'neutral');

    this.contentBox = document.createElement('div');
    this.contentBox.className = 'terminal-modal-content';
    this.contentBox.setAttribute('role', 'dialog');
    this.contentBox.setAttribute('aria-modal', 'true');
    this.contentBox.setAttribute('aria-labelledby', 'tm-title');
    this.overlay.appendChild(this.contentBox);

    // Mount inside .phone-screen so faction CSS custom properties cascade down
    // for free (no theme classes on the modal itself — see spec §2).
    const screen = document.querySelector('.phone-screen');
    (screen ?? document.body).appendChild(this.overlay);

    // Reflect alignment as an attribute for any future debugging; styling still
    // comes from the cascade, not from this attribute.
    phoneStore.subscribe((s) => {
      this.overlay.setAttribute('data-alignment', s.alignment);
    });

    // Single delegated click handler — no per-render addEventListener, no leaks.
    this.overlay.addEventListener('click', (e) => this.handleClick(e));

    this.boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    document.addEventListener('keydown', this.boundKeyDown);

    eventBus.on('ui:show_confirm', (cfg: ConfirmConfig) => this.onShowConfirm(cfg));
    eventBus.on('ui:show_error', (cfg: ErrorConfig) => this.onShowError(cfg));
    eventBus.on('ui:close_modal', () => this.handleExplicitClose());
  }

  // ── Event-bus entry points ───────────────────────────────────────────────

  private onShowConfirm(cfg: ConfirmConfig): void {
    // A confirm is high-intent. It preempts anything: an active error is
    // re-enqueued behind it so we don't yank the user mid-decision.
    if (this.mode === 'error' && this.activeError) {
      this.errorQueue.unshift(this.activeError.config);
      this.activeError = null;
      this.cleanupTimers();
    }
    this.activeConfirm = { config: cfg };
    this.mode = 'confirm';
    this.renderConfirm(cfg);
    this.showOverlay();
  }

  private onShowError(cfg: ErrorConfig): void {
    if (this.mode === 'confirm') {
      // Errors wait on explicit user choice (spec §1 UX decision).
      this.errorQueue.push(cfg);
      return;
    }
    if (this.mode === 'error' && this.activeError) {
      if (this.activeError.config.signature === cfg.signature) {
        return; // COALESCE — background poll failing repeatedly shows once.
      }
      this.errorQueue.push(cfg);
      return;
    }
    this.activateError(cfg);
  }

  // ── Activation / transitions ─────────────────────────────────────────────

  private activateError(cfg: ErrorConfig): void {
    this.mode = 'error';
    this.activeError = { config: cfg, countdown: COUNTDOWN_SECONDS };
    this.renderError(this.activeError);
    this.showOverlay();
    this.startCountdown();
  }

  private startCountdown(): void {
    this.cleanupTimers();
    if (!this.activeError) return;
    this.countdownTimer = window.setInterval(() => this.tickCountdown(), 1000);
  }

  private tickCountdown(): void {
    if (!this.activeError) return;
    this.activeError.countdown -= 1;
    if (this.activeError.countdown <= 0) {
      this.cleanupTimers();
      void this.executeRetry();
    } else {
      this.updateCountdownText(this.activeError.countdown);
    }
  }

  private async executeRetry(): Promise<void> {
    if (!this.activeError) return;
    this.setRetryingUI();
    try {
      await this.activeError.config.retry();
      // Success: tear down and drain the queue.
      this.activeError = null;
      this.closeOverlay();
      this.drainQueue();
    } catch {
      // Failure: keep the same request active, restart the countdown.
      if (this.activeError) {
        this.activeError.countdown = COUNTDOWN_SECONDS;
        this.renderError(this.activeError);
        this.startCountdown();
      }
    }
  }

  private drainQueue(): void {
    const next = this.errorQueue.shift();
    if (!next) {
      this.mode = 'idle';
      return;
    }
    this.activateError(next);
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private renderConfirm(cfg: ConfirmConfig): void {
    this.overlay.classList.remove('fatal-error');
    const confirmLabel = cfg.confirmLabel ?? 'EXECUTE';
    const cancelLabel = cfg.cancelLabel ?? 'ABORT';
    this.contentBox.innerHTML = `
      <div class="terminal-modal-header">
        <span>CRITICAL AUTHORIZATION REQUIRED</span>
      </div>
      <div class="terminal-modal-body">
        <h4 id="tm-title">${escapeHtml(cfg.title)}</h4>
        <p>${escapeHtml(cfg.message)}</p>
      </div>
      <div class="terminal-modal-footer">
        <button class="modal-btn cancel" data-action="cancel">${escapeHtml(cancelLabel)}</button>
        <button class="modal-btn confirm" data-action="confirm" autofocus>${escapeHtml(confirmLabel)}</button>
      </div>
    `;
    this.focusPrimary();
  }

  private renderError(active: ActiveError): void {
    this.overlay.classList.add('fatal-error');
    const { config, countdown } = active;
    this.contentBox.innerHTML = `
      <div class="terminal-modal-header error-flash">
        <span>[!] FATAL SYSTEM EXCEPTION DETECTED</span>
      </div>
      <div class="terminal-modal-body">
        <p class="error-code">EXCEPTION_CODE: ${escapeHtml(config.code)}</p>
        <p class="error-msg">${escapeHtml(config.message)}</p>
        <div class="retry-status" data-countdown>
          <span class="pulse-caret">▶</span> RETRYING NEURAL HANDSHAKE IN <span data-countdown-value>${countdown}</span>s...
        </div>
      </div>
      <div class="terminal-modal-footer">
        <button class="modal-btn retry" data-action="retry">FORCE BYPASS NOW</button>
      </div>
    `;
    this.focusPrimary();
  }

  private updateCountdownText(remaining: number): void {
    const el = this.contentBox.querySelector<HTMLElement>('[data-countdown-value]');
    if (el) el.textContent = String(remaining);
  }

  private setRetryingUI(): void {
    const btn = this.contentBox.querySelector<HTMLButtonElement>('button[data-action="retry"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'RECONNECTING...';
    }
    const status = this.contentBox.querySelector<HTMLElement>('[data-countdown]');
    if (status) status.innerHTML = `<span class="pulse-caret">▶</span> RECONNECTING...`;
  }

  // ── User input ───────────────────────────────────────────────────────────

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'confirm' && this.activeConfirm) {
      this.activeConfirm.config.onConfirm();
      this.dismissConfirm();
    } else if (action === 'cancel' && this.activeConfirm) {
      this.activeConfirm.config.onCancel?.();
      this.dismissConfirm();
    } else if (action === 'retry' && this.activeError) {
      void this.executeRetry();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.mode === 'idle' || this.overlay.hidden) return;
    if (e.key !== 'Escape') return;

    e.stopPropagation();

    if (this.mode === 'confirm' && this.activeConfirm) {
      this.activeConfirm.config.onCancel?.();
      this.dismissConfirm();
    } else if (this.mode === 'error' && this.activeError) {
      // Escape on an error modal = explicit user abandonment.
      this.activeError.config.abort();
      this.activeError = null;
      this.cleanupTimers();
      this.closeOverlay();
      this.drainQueue();
    }
  }

  private handleExplicitClose(): void {
    if (this.mode === 'confirm' && this.activeConfirm) {
      this.activeConfirm.config.onCancel?.();
      this.dismissConfirm();
    } else if (this.mode === 'error' && this.activeError) {
      this.activeError.config.abort();
      this.activeError = null;
      this.cleanupTimers();
      this.closeOverlay();
      this.drainQueue();
    }
  }

  private dismissConfirm(): void {
    this.activeConfirm = null;
    this.closeOverlay();
    // After a confirm resolves, surface any errors that were queued behind it.
    this.drainQueue();
  }

  // ── Overlay plumbing ─────────────────────────────────────────────────────

  private showOverlay(): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.overlay.hidden = false;
  }

  private closeOverlay(): void {
    this.overlay.hidden = true;
    this.overlay.classList.remove('fatal-error');
    this.contentBox.innerHTML = '';
    if (this.lastFocused?.isConnected && typeof this.lastFocused.focus === 'function') {
      this.lastFocused.focus();
    }
  }

  private focusPrimary(): void {
    const primary = this.contentBox.querySelector<HTMLElement>('button[autofocus], button[data-action="confirm"], button[data-action="retry"]');
    primary?.focus();
  }

  private cleanupTimers(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch] as string));
}
