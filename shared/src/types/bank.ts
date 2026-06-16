export interface BankTransaction {
  id: string;
  amount: number;
  currencyType: 'creds' | 'gold_credits';
  transactionType: 'salary' | 'rent' | 'purchase' | 'premium_exchange' | 'debit' | 'credit' | 'transfer';
  description: string;
  createdAt: string;
}

export interface BankLedgerResponse {
  credits: number;
  goldCredits: number;
  transactions: BankTransaction[];
}
