import { withOLTPTransaction, queryOLTP } from '../database/connection.js';
import { deleteCache } from '../database/redis.js';
import type { BankLedgerResponse } from '../../../shared/src/types/bank.js';

export class BankService {
  /**
   * Atomically modifies a player's balance and writes a ledger entry.
   * PostgreSQL CHECK (gold_credits >= 0) rolls back on insufficient funds → code 23514.
   *
   * `referenceType` + `referenceId` (both optional) let callers (e.g. the PayPal
   * webhook) tag the ledger row with an external-system reference. The PayPal
   * webhook uses `referenceType='paypal_capture'` + `referenceId=<our UUID>`
   * so the partial UNIQUE index on
   *   `bank_transactions(reference_id) WHERE reference_type = 'paypal_capture'`
   * gives idempotent dedup — a redelivered webhook hits 23505 on the INSERT,
   * the whole transaction rolls back, and no double-grant happens.
   */
  public static async modifyBalance(
    userId: string,
    amount: number,
    currencyType: 'creds' | 'gold_credits',
    transactionType: string,
    description: string,
    referenceType?: string,
    referenceId?: string
  ): Promise<{ newBalance: number }> {
    const col = currencyType === 'gold_credits' ? 'gold_credits' : 'credits';

    try {
      const newBalance = await withOLTPTransaction(async (client) => {
        const r = await client.query(
          `UPDATE users SET ${col} = ${col} + $1, updated_at = NOW()
           WHERE id = $2 RETURNING ${col}`,
          [amount, userId]
        );
        if (r.rows.length === 0) throw new Error('User record not found');

        await client.query(
          `INSERT INTO bank_transactions
             (user_id, amount, currency_type, transaction_type, description, balance_after, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, amount, currencyType, transactionType, description, r.rows[0][col], referenceType ?? null, referenceId ?? null]
        );

        return r.rows[0][col] as number;
      });

      await deleteCache(`user:state:${userId}`);
      return { newBalance };
    } catch (error: any) {
      if (error.code === '23514') throw new Error('INSUFFICIENT_FUNDS');
      throw error;
    }
  }

  public static async getLedger(userId: string): Promise<BankLedgerResponse> {
    const [balanceRes, ledgerRes] = await Promise.all([
      queryOLTP('SELECT credits, gold_credits FROM users WHERE id = $1', [userId]),
      queryOLTP(
        `SELECT id, amount,
                COALESCE(currency_type, 'creds') AS "currencyType",
                transaction_type                 AS "transactionType",
                description,
                created_at                       AS "createdAt"
         FROM bank_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [userId]
      ),
    ]);

    if (balanceRes.rows.length === 0) throw new Error('User not found');

    return {
      credits: balanceRes.rows[0].credits,
      goldCredits: balanceRes.rows[0].gold_credits,
      transactions: ledgerRes.rows,
    };
  }
}
