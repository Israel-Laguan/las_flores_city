import { phoneStore } from '../../store/PhoneStore';
import { eventBus } from '../../utils/EventBus';
import type { BankLedgerResponse, BankTransaction } from '../../../../shared/src/types/bank';

export class BancoApp {
  private container: HTMLElement;
  private subs: Array<[string, (...a: any[]) => void]> = [];

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    void this.init();
    const onOpen = (key: string) => {
      if (key === 'banco') void this.init();
    };
    this.subs.push(['phone:app-opened', onOpen]);
    eventBus.on('phone:app-opened', onOpen);
  }

  destroy(): void {
    for (const [e, h] of this.subs) eventBus.off(e, h);
    this.subs = [];
  }

  private async init(): Promise<void> {
    this.container.innerHTML = `<div class="loading-spinner">Connecting to Banco de Las Flores...</div>`;

    try {
      const response = await fetch('/api/bank/ledger', {
        headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` },
      });
      if (!response.ok) throw new Error('Failed to retrieve statement');

      const { data }: { data: BankLedgerResponse } = await response.json();
      phoneStore.updateState({ credits: data.credits, goldCredits: data.goldCredits });
      // Emit bank:transaction for polish consumers (currency flash animations)
      if (data.transactions.length > 0) {
        eventBus.emit('bank:transaction', {
          credits: data.credits,
          goldCredits: data.goldCredits,
          latestTransaction: data.transactions[0],
        });
      }
      this.render(data);
    } catch {
      this.container.innerHTML = `
        <div class="app-error">
          <p>Uplink Error: Secure financial connection refused.</p>
        </div>
      `;
    }
  }

  private render(data: BankLedgerResponse): void {
    const rows = data.transactions.map((tx) => this.txRow(tx)).join('');

    this.container.innerHTML = `
      <div class="banco-app">
        <div class="banco-header">
          <h2>BANCO DE LAS FLORES</h2>
          <span class="secure-token">UPLINK ENCRYPTED // TLS-2077</span>
        </div>
        <div class="balance-cards">
          <div class="balance-card creds">
            <span class="label">CREDITS</span>
            <span class="value">${data.credits.toLocaleString()} C$</span>
          </div>
          <div class="balance-card gold-creds">
            <span class="label">GOLD CREDITS (N&amp;M EXCLUSIVES)</span>
            <span class="value">${data.goldCredits.toLocaleString()} G$</span>
          </div>
        </div>
        <div class="ledger-container">
          <h3>RECENT OPERATIONS</h3>
          <div class="ledger-list">
            ${rows || '<div class="empty-ledger">No operations logged for this cycle.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  private txRow(tx: BankTransaction): string {
    const isPositive = tx.amount > 0;
    const sign = isPositive ? '+' : '';
    const amountClass = isPositive ? 'income' : 'expense';
    const suffix = tx.currencyType === 'gold_credits' ? ' G$' : ' C$';
    const date = new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <div class="ledger-row">
        <div class="ledger-meta">
          <span class="ledger-date">${date}</span>
          <span class="ledger-type">[${tx.transactionType.toUpperCase()}]</span>
        </div>
        <div class="ledger-main">
          <span class="ledger-desc">${tx.description}</span>
          <span class="ledger-amount ${amountClass}">${sign}${tx.amount.toLocaleString()}${suffix}</span>
        </div>
      </div>
    `;
  }
}
