import { withOLTPTransaction, queryOLTP } from '../database/connection.js';
import { deleteCache } from '../database/redis.js';
import { PlayerStateRepository } from '../database/repositories/PlayerStateRepository.js';
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
    const goldDelta = currencyType === 'gold_credits' ? amount : undefined;
    const creditsDelta = currencyType !== 'gold_credits' ? amount : undefined;

    try {
      const newBalances = await withOLTPTransaction(async (client) => {
        const balances = await PlayerStateRepository.modifyBalance(
          client,
          userId,
          creditsDelta,
          goldDelta
        );

        await client.query(
          `INSERT INTO bank_transactions
             (user_id, amount, currency_type, transaction_type, description, balance_after, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [userId, amount, currencyType, transactionType, description,
           currencyType === 'gold_credits' ? balances.gold_credits : balances.credits,
           referenceType ?? null, referenceId ?? null]
        );

        return balances;
      });

      await deleteCache(`user:state:${userId}`);
      const newBalance = currencyType === 'gold_credits'
        ? newBalances.gold_credits
        : newBalances.credits;
      return { newBalance };
    } catch (error: any) {
      if (error.code === '23514') throw new Error('INSUFFICIENT_FUNDS');
      throw error;
    }
  }

  public static async getLedger(userId: string): Promise<BankLedgerResponse> {
    const [balanceRes, ledgerRes] = await Promise.all([
      PlayerStateRepository.getBalancesForLedger(userId),
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

    if (!balanceRes) throw new Error('User not found');

    return {
      credits: balanceRes.credits,
      goldCredits: balanceRes.gold_credits,
      transactions: ledgerRes.rows,
    };
  }
}
