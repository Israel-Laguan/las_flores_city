import type pg from 'pg';
import { oltpPool } from '@las-flores/infra';
import { RelationshipDeltaSchema, type RelationshipDelta, type RelationshipSnapshot } from '@las-flores/shared';

const AXES = ['trust', 'familiarity', 'alignment', 'tension', 'debt', 'visibility'] as const;
type Axis = typeof AXES[number];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function normalizeDelta(input: RelationshipDelta): RelationshipDelta {
  const parsed = RelationshipDeltaSchema.parse(input);
  const axes = { ...(parsed.axes ?? {}) };
  if (parsed.friendship !== undefined) {
    axes.familiarity = (axes.familiarity ?? 0) + parsed.friendship;
    axes.visibility = (axes.visibility ?? 0) + parsed.friendship;
    axes.trust = (axes.trust ?? 0) + Math.trunc(parsed.friendship / 2);
  }
  if (parsed.romance !== undefined) {
    axes.tension = (axes.tension ?? 0) + Math.trunc(parsed.romance / 2);
  }
  return { ...parsed, axes };
}

export interface RelationshipDeltaOptions {
  markInteraction?: boolean;
  currentDay?: number;
}

export async function applyRelationshipDelta(
  client: pg.PoolClient,
  userId: string,
  characterId: string,
  input: RelationshipDelta,
  options: RelationshipDeltaOptions = {}
): Promise<void> {
  const delta = normalizeDelta(input);
  const dayResult = await client.query<{ current_day: number }>(
    'SELECT current_day FROM player_states WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  const currentDay = options.currentDay ?? dayResult.rows[0]?.current_day ?? null;
  const axes = delta.axes ?? {};
  const params: unknown[] = [userId, characterId, delta.friendship ?? 0, delta.romance ?? 0];
  const axisParam = (axis: Axis): string => {
    params.push(axes[axis] ?? 0);
    return `$${params.length}`;
  };
  params.push(delta.bond ?? 0, delta.vibe ?? 0, delta.status ?? null);
  const bondParam = `$${params.length - 2}`;
  const vibeParam = `$${params.length - 1}`;
  const statusParam = `$${params.length}`;
  params.push(JSON.stringify(delta.memory ?? {}), JSON.stringify(delta.flags ?? {}), currentDay);
  const memoryParam = `$${params.length - 2}`;
  const flagsParam = `$${params.length - 1}`;
  const dayParam = `$${params.length}`;

  const friendshipParam = '$3';
  const romanceParam = '$4';
  const markInteraction = options.markInteraction !== false;
  const interactionDaySql = markInteraction ? `last_interaction_day = ${dayParam},` : '';

  await client.query(
    `INSERT INTO user_relationships (
       user_id, character_id, friendship_level, romance_level,
       trust, familiarity, alignment, tension, debt, visibility,
       bond_level, daily_vibe, status, last_interaction_day, memory, flags
     ) VALUES (
       $1, $2,
       GREATEST(0, LEAST(100, ${friendshipParam})),
       GREATEST(0, LEAST(100, ${romanceParam})),
       GREATEST(-100, LEAST(100, ${axisParam('trust')})),
       GREATEST(0, LEAST(100, ${axisParam('familiarity')})),
       GREATEST(-100, LEAST(100, ${axisParam('alignment')})),
       GREATEST(0, LEAST(100, ${axisParam('tension')})),
       GREATEST(-100, LEAST(100, ${axisParam('debt')})),
       GREATEST(0, LEAST(100, ${axisParam('visibility')})),
       GREATEST(0, LEAST(100, ${bondParam})),
       GREATEST(-100, LEAST(100, ${vibeParam})),
       COALESCE(${statusParam}, 'STRANGER'),
       ${markInteraction ? dayParam : 'NULL'},
       ${memoryParam}::jsonb, ${flagsParam}::jsonb
     )
     ON CONFLICT (user_id, character_id) DO UPDATE SET
       friendship_level = GREATEST(0, LEAST(100, user_relationships.friendship_level + EXCLUDED.friendship_level)),
       romance_level = GREATEST(0, LEAST(100, user_relationships.romance_level + EXCLUDED.romance_level)),
       trust = GREATEST(-100, LEAST(100, user_relationships.trust + EXCLUDED.trust)),
       familiarity = GREATEST(0, LEAST(100, user_relationships.familiarity + EXCLUDED.familiarity)),
       alignment = GREATEST(-100, LEAST(100, user_relationships.alignment + EXCLUDED.alignment)),
       tension = GREATEST(0, LEAST(100, user_relationships.tension + EXCLUDED.tension)),
       debt = GREATEST(-100, LEAST(100, user_relationships.debt + EXCLUDED.debt)),
       visibility = GREATEST(0, LEAST(100, user_relationships.visibility + EXCLUDED.visibility)),
       bond_level = GREATEST(0, LEAST(100, user_relationships.bond_level + EXCLUDED.bond_level)),
       daily_vibe = GREATEST(-100, LEAST(100, user_relationships.daily_vibe + EXCLUDED.daily_vibe)),
       status = COALESCE(${statusParam}, user_relationships.status),
       ${interactionDaySql}
       memory = user_relationships.memory || EXCLUDED.memory,
       flags = user_relationships.flags || EXCLUDED.flags,
       updated_at = NOW()`,
    params
  );
}

export async function applyLegacyRelationshipChange(
  client: pg.PoolClient,
  userId: string,
  characterId: string,
  stat: 'friendship' | 'romance',
  amount: number
): Promise<void> {
  await client.query(
    'SELECT upsert_user_relationship($1, $2, $3, $4)',
    [userId, characterId, stat === 'friendship' ? amount : 0, stat === 'romance' ? amount : 0]
  );
}

export async function getRelationship(
  client: pg.PoolClient,
  userId: string,
  characterId: string
): Promise<RelationshipSnapshot | null> {
  const result = await client.query(
    `SELECT character_id, friendship_level, romance_level, trust, familiarity,
            alignment, tension, debt, visibility, bond_level, daily_vibe, status,
            last_interaction_day, last_milestone_day, memory, flags
       FROM user_relationships WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    characterId: row.character_id,
    friendshipLevel: row.friendship_level,
    romanceLevel: row.romance_level,
    axes: {
      trust: row.trust, familiarity: row.familiarity, alignment: row.alignment,
      tension: row.tension, debt: row.debt, visibility: row.visibility,
    },
    bondLevel: row.bond_level,
    dailyVibe: row.daily_vibe,
    status: row.status,
    lastInteractionDay: row.last_interaction_day,
    lastMilestoneDay: row.last_milestone_day,
    memory: row.memory ?? {},
    flags: row.flags ?? {},
  };
}

/**
 * Read-only relationship lookup for choice filtering (M48). Uses the
 * shared pool directly — NOT a transaction `client` — so a filter read
 * never takes the `FOR UPDATE` row lock that `applyRelationshipDelta`
 * does. Returns `null` when there is no row (the missing-row signal
 * used by `relationshipPassesFilters`).
 */
export async function getRelationshipForFilter(
  userId: string,
  characterId: string
): Promise<RelationshipSnapshot | null> {
  const result = await oltpPool.query(
    `SELECT character_id, friendship_level, romance_level, trust, familiarity,
            alignment, tension, debt, visibility, bond_level, daily_vibe, status,
            last_interaction_day, last_milestone_day, memory, flags
       FROM user_relationships WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    characterId: row.character_id,
    friendshipLevel: row.friendship_level,
    romanceLevel: row.romance_level,
    axes: {
      trust: row.trust,
      familiarity: row.familiarity,
      alignment: row.alignment,
      tension: row.tension,
      debt: row.debt,
      visibility: row.visibility,
    },
    bondLevel: row.bond_level,
    dailyVibe: row.daily_vibe,
    status: row.status,
    lastInteractionDay: row.last_interaction_day,
    lastMilestoneDay: row.last_milestone_day,
    memory: row.memory ?? {},
    flags: row.flags ?? {},
  };
}

export { AXES, clamp };
