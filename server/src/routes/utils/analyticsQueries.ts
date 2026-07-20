import { queryOLTP, queryOLAP } from '../../database/connection.js';

export interface DialogueRow {
  event_type: string;
  dialogue_tree_id: string;
  count: string;
}

export interface StoryBeatRow {
  event_type: string;
  story_beat: string;
  unique_players: string;
}

export interface TbSpendRow {
  event_type: string;
  content_type: string;
  total_tb: string;
}

export interface MysteryStatusRow {
  status: string;
  count: number;
}

function computeDialogueRates(rows: DialogueRow[]) {
  const dialogueMap = new Map<string, { started: number; completed: number }>();
  for (const row of rows) {
    const treeId = row.dialogue_tree_id;
    if (!dialogueMap.has(treeId)) dialogueMap.set(treeId, { started: 0, completed: 0 });
    const entry = dialogueMap.get(treeId)!;
    if (row.event_type === 'dialogue_started') entry.started += Number(row.count);
    else entry.completed += Number(row.count);
  }
  return Array.from(dialogueMap.entries()).map(([treeId, data]) => ({
    dialogueTreeId: treeId,
    started: data.started,
    completed: data.completed,
    completionRate: data.started > 0 ? Math.round((data.completed / data.started) * 100) : 0,
  }));
}

export async function fetchAnalyticsQueries() {
  const [dialogueCompletions, storyBeatReach, totalPlayers, mysteryStatus, tbSpend] = await Promise.all([
    queryOLAP<DialogueRow>(`
      SELECT event_type AS event_type, (event_data ->> 'dialogue_tree_id') AS dialogue_tree_id, count(*)::int AS count
      FROM player_events
      WHERE event_type IN ('dialogue_started', 'dialogue_completed') AND event_data ->> 'dialogue_tree_id' IS NOT NULL
      GROUP BY event_type, event_data ->> 'dialogue_tree_id' ORDER BY count DESC
    `),
    queryOLAP<StoryBeatRow>(`
      SELECT event_type, event_data ->> 'story_beat' AS story_beat, count(DISTINCT user_id)::int AS unique_players
      FROM player_events WHERE event_type = 'story_beat_set' AND event_data ->> 'story_beat' IS NOT NULL
      GROUP BY event_data ->> 'story_beat' ORDER BY unique_players DESC
    `),
    queryOLAP<{ count: string }>(`SELECT count(DISTINCT user_id)::int AS count FROM player_events`),
    queryOLTP<MysteryStatusRow>(`SELECT status, count(*)::int AS count FROM mysteries GROUP BY status ORDER BY count DESC`),
    queryOLAP<TbSpendRow>(`
      SELECT event_type, COALESCE(event_data ->> 'content_type', event_type) AS content_type, sum(time_blocks_cost)::int AS total_tb
      FROM player_events WHERE time_blocks_cost > 0
      GROUP BY event_type, COALESCE(event_data ->> 'content_type', event_type) ORDER BY total_tb DESC
    `),
  ]);

  const playerCount = Number(totalPlayers?.rows[0]?.count ?? 0);
  const dialogueRates = computeDialogueRates(dialogueCompletions?.rows ?? []);

  return {
    dialogueRates,
    storyBeatReach: (storyBeatReach?.rows ?? []).map((row: StoryBeatRow) => ({
      storyBeat: row.story_beat, uniquePlayers: Number(row.unique_players),
      reachPercentage: playerCount > 0 ? Math.round((Number(row.unique_players) / playerCount) * 100) : 0,
    })),
    mysteryStatus: mysteryStatus.rows,
    timeBlockSpend: (tbSpend?.rows ?? []).map((row: TbSpendRow) => ({
      eventType: row.event_type, contentType: row.content_type, totalTbSpent: Number(row.total_tb),
    })),
    totalPlayers: playerCount,
  };
}

// ---------------------------------------------------------------------------
// Admin / Story Builder analytics (M17)
// ---------------------------------------------------------------------------

export interface AdminAnalyticsData {
  plansCreated24h: number;
  plansCreated7d: number;
  eventsByType: Array<{ event_type: string; count: number }>;
  avgItemsPerPlan: number;
  successRate: number;
  totalTokens7d: number;
  estimatedCost7d: number;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsData> {
  const [plans24h, plans7d, eventsByType, avgItemsPerPlan, terminalEvents, tokensCost] = await Promise.all([
    queryOLTP<{ count: string }>(
      `SELECT count(*)::int AS count FROM admin_events
       WHERE event_type = 'plan_created' AND created_at > NOW() - INTERVAL '24 hours'`
    ),
    queryOLTP<{ count: string }>(
      `SELECT count(*)::int AS count FROM admin_events
       WHERE event_type = 'plan_created' AND created_at > NOW() - INTERVAL '7 days'`
    ),
    queryOLTP<{ event_type: string; count: string }>(
      `SELECT event_type, count(*)::int AS count FROM admin_events
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY event_type ORDER BY count DESC`
    ),
    queryOLTP<{ avg_items: string }>(
      `SELECT round(avg((event_data->>'itemCount')::numeric), 1) AS avg_items
       FROM admin_events
       WHERE event_type = 'plan_created' AND created_at > NOW() - INTERVAL '7 days'`
    ),
    queryOLTP<{ verified: string; failed: string }>(
      `SELECT
         count(*) FILTER (WHERE event_type = 'plan_verified')::int AS verified,
         count(*) FILTER (WHERE event_type = 'plan_failed')::int AS failed
       FROM admin_events
       WHERE event_type IN ('plan_verified', 'plan_failed')
         AND created_at > NOW() - INTERVAL '7 days'`
    ),
    queryOLTP<{ totalTokens: string; estimatedCost: string }>(
      `SELECT
         coalesce(sum((event_data->>'totalTokens')::numeric), 0)::numeric(12,0) AS totalTokens,
         coalesce(sum((event_data->>'estimatedCostUsd')::numeric), 0)::numeric(12,6) AS estimatedCost
       FROM admin_events
       WHERE event_type IN ('plan_created', 'plan_refined')
         AND created_at > NOW() - INTERVAL '7 days'`
    ),
  ]);

  const verified = Number(terminalEvents?.rows[0]?.verified ?? 0);
  const failed = Number(terminalEvents?.rows[0]?.failed ?? 0);
  const total = verified + failed;
  const tokensRow = tokensCost?.rows[0];
  const totalTokens7d = Number(tokensRow?.totalTokens ?? 0);
  const estimatedCost7d = Number(tokensRow?.estimatedCost ?? 0);

  return {
    plansCreated24h: Number(plans24h?.rows[0]?.count ?? 0),
    plansCreated7d: Number(plans7d?.rows[0]?.count ?? 0),
    eventsByType: (eventsByType?.rows ?? []).map(r => ({ event_type: r.event_type, count: Number(r.count) })),
    avgItemsPerPlan: Number(avgItemsPerPlan?.rows[0]?.avg_items ?? 0),
    successRate: total > 0 ? Math.round((verified / total) * 100) : 0,
    totalTokens7d,
    estimatedCost7d,
  };
}


// ---------------------------------------------------------------------------
// Mission reward claim stats (M15 follow-up)
// ---------------------------------------------------------------------------

export interface MissionClaimStatsRow {
  dialogueId: string;
  dialogueName: string;
  claims: number;
  uniqueUsers: number;
  completionRate: number;
  lastClaim: string;
}

export async function fetchMissionClaimStats(): Promise<MissionClaimStatsRow[]> {
  // OLTP: claims grouped by dialogue_id
  const claimsResult = await queryOLTP<{
    dialogue_id: string;
    dialogue_name: string;
    claims: string;
    unique_users: string;
    last_claim: string;
  }>(
    `SELECT
       mrc.dialogue_id,
       COALESCE(dt.name, 'Unknown') AS dialogue_name,
       count(*)::int AS claims,
       count(DISTINCT mrc.user_id)::int AS unique_users,
       max(mrc.claimed_at) AS last_claim
     FROM mission_reward_claims mrc
     LEFT JOIN dialogue_trees dt ON dt.id = mrc.dialogue_id
     GROUP BY mrc.dialogue_id, dt.name
     ORDER BY claims DESC`,
  );

  // OLAP: dialogue_started starters for completion rate denominator
  const startersResult = await queryOLAP<{ dialogue_tree_id: string; starters: string }>(
    `SELECT
       event_data ->> 'dialogue_tree_id' AS dialogue_tree_id,
       count(DISTINCT user_id)::int AS starters
     FROM player_events
     WHERE event_type = 'dialogue_started'
       AND event_data ->> 'dialogue_tree_id' IS NOT NULL
     GROUP BY event_data ->> 'dialogue_tree_id'`,
  );

  // Merge in Node
  const startersMap = new Map<string, number>();
  for (const row of startersResult?.rows ?? []) {
    startersMap.set(row.dialogue_tree_id, Number(row.starters));
  }

  return (claimsResult?.rows ?? []).map((row) => {
    const starters = startersMap.get(row.dialogue_id) ?? 0;
    const claims = Number(row.claims);
    const uniqueUsers = Number(row.unique_users);
    const completionRate = starters > 0
      ? Math.round((uniqueUsers / starters) * 100)
      : 0;

    return {
      dialogueId: row.dialogue_id,
      dialogueName: row.dialogue_name,
      claims,
      uniqueUsers,
      completionRate,
      lastClaim: row.last_claim,
    };
  });
}

