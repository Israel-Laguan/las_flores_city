import { phoneStore } from '../../store/PhoneStore';
import { eventBus } from '../../utils/EventBus';

/**
 * Decoupled controller that animates the Banco balance when credits change.
 * Primary trigger: 'bank:transaction' event (from BancoApp ledger fetch).
 * Fallback trigger: phoneStore subscription (catches credits changed outside
 *   the bank ledger, e.g. Trabajando gig income).
 * A 100ms dedup guard prevents double-fire when both triggers fire for the
 * same change (store updates synchronously before the event emits).
 */
export class BancoFlashController {
  private lastCredits = phoneStore.getState().credits;
  private lastGoldCredits = phoneStore.getState().goldCredits;
  private lastFlashTime = 0;
  private lastFlashField: 'credits' | 'goldCredits' | '' = '';
  private subs: Array<[string, (...a: any[]) => void]> = [];
  private unsubStore: (() => void) | null = null;
  private flashTimer: number | null = null;

  constructor() {
    const onTransaction = (data: { credits: number; goldCredits: number }) => {
      this.flash('credits', data.credits - this.lastCredits);
      this.flash('goldCredits', data.goldCredits - this.lastGoldCredits);
      this.lastCredits = data.credits;
      this.lastGoldCredits = data.goldCredits;
    };
    this.subs.push(['bank:transaction', onTransaction]);
    eventBus.on('bank:transaction', onTransaction);

    this.unsubStore = phoneStore.subscribe((state) => {
      if (state.credits !== this.lastCredits) {
        this.flash('credits', state.credits - this.lastCredits);
        this.lastCredits = state.credits;
      }
      if (state.goldCredits !== this.lastGoldCredits) {
        this.flash('goldCredits', state.goldCredits - this.lastGoldCredits);
        this.lastGoldCredits = state.goldCredits;
      }
    });
  }

  private flash(field: 'credits' | 'goldCredits', diff: number): void {
    if (diff === 0) return;
    const now = Date.now();
    // Dedup: same field flashed within 100ms = store sub + event echo
    if (field === this.lastFlashField && now - this.lastFlashTime < 100) return;
    this.lastFlashTime = now;
    this.lastFlashField = field;

    const cardClass =
      field === 'credits'
        ? '.balance-card.creds .value'
        : '.balance-card.gold-creds .value';
    const el = document.querySelector<HTMLElement>(cardClass);
    if (!el) return; // Banco tab not visible — silently skip

    const isIncome = diff > 0;
    const cls = isIncome ? 'flash-income' : 'flash-expense';
    el.classList.remove('flash-income', 'flash-expense');
    void el.offsetWidth; // force reflow to reset animation timeline
    el.classList.add(cls);
    if (this.flashTimer) window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      el.classList.remove(cls);
      this.flashTimer = null;
    }, 650);

    eventBus.emit('audio:play_sfx', {
      key: isIncome ? 'sfx_credits_up' : 'sfx_credits_down',
      url: isIncome
        ? 'https://cdn.lasflores2077.com/audio/sfx_credits_up.mp3'
        : 'https://cdn.lasflores2077.com/audio/sfx_credits_down.mp3',
    });
  }

  destroy(): void {
    for (const [e, h] of this.subs) eventBus.off(e, h);
    this.subs = [];
    if (this.unsubStore) this.unsubStore();
    if (this.flashTimer) { window.clearTimeout(this.flashTimer); this.flashTimer = null; }
  }
}
