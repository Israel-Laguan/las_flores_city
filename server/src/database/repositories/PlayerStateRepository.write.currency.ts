import pg from 'pg';

export async function modifyBalance(
  client: pg.PoolClient,
  userId: string,
  creditsDelta?: number,
  goldDelta?: number
): Promise<{ credits: number; gold_credits: number }> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (creditsDelta !== undefined) {
    sets.push(`credits = credits + $${i++}`);
    params.push(creditsDelta);
  }
  if (goldDelta !== undefined) {
    sets.push(`gold_credits = gold_credits + $${i++}`);
    params.push(goldDelta);
  }
  sets.push(`updated_at = NOW()`);
  params.push(userId);

  const result = await client.query(
    `UPDATE player_states SET ${sets.join(', ')}
     WHERE user_id = $${i}
     RETURNING credits, gold_credits`,
    params
  );

  return result.rows[0];
}

export async function chargeCurrency(
  client: pg.PoolClient,
  userId: string,
  currency: 'credits' | 'gold_credits',
  amount: number
): Promise<number | null> {
  const balances = await getBalances(client, userId);
  if (!balances) return null;
  const current = balances[currency];
  if (current < amount) return null;

  const result = await client.query(
    `UPDATE player_states
       SET ${currency} = ${currency} - $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING ${currency}`,
    [amount, userId]
  );
  return result.rows[0][currency] as number;
}

export async function getBalances(client: pg.PoolClient, userId: string): Promise<{
  credits: number; gold_credits: number;
} | null> {
  const result = await client.query(
    `SELECT credits, gold_credits FROM player_states WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}
