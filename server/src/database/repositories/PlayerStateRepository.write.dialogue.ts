import pg from 'pg';

/**
 * Atomically update both current_chunk_id and current_node_id in
 * player_dialogue_states within an existing transaction.
 *
 * Requirement 8.3: both chunk and node are updated in a single
 * UPDATE statement so the two fields can never be out of sync.
 *
 * @param client   - Active pg.PoolClient inside withOLTPTransaction
 * @param userId   - Player's user id
 * @param treeId   - Dialogue tree id (the row key alongside user_id)
 * @param chunkId  - The new current_chunk_id (UUID)
 * @param nodeId   - The new current_node_id
 * @param choiceEntry - Optional JSONB entry to append to choices_made
 */
export async function setDialogueChunkCursor(
  client: pg.PoolClient,
  userId: string,
  treeId: string,
  chunkId: string,
  nodeId: string,
  choiceEntry?: Record<string, unknown>
): Promise<void> {
  if (choiceEntry !== undefined) {
    await client.query(
      `UPDATE player_dialogue_states
         SET current_node_id  = $1,
             current_chunk_id = $2,
             choices_made     = choices_made || $3::jsonb,
             updated_at       = NOW()
       WHERE user_id = $4 AND dialogue_tree_id = $5`,
      [nodeId, chunkId, JSON.stringify([choiceEntry]), userId, treeId]
    );
  } else {
    await client.query(
      `UPDATE player_dialogue_states
         SET current_node_id  = $1,
             current_chunk_id = $2,
             updated_at       = NOW()
       WHERE user_id = $3 AND dialogue_tree_id = $4`,
      [nodeId, chunkId, userId, treeId]
    );
  }
}

/**
 * Upsert the initial dialogue chunk state when a player starts a
 * dialogue. Resets choices_made and started_at so a fresh start
 * is reflected in state.
 *
 * Requirement 8.2: records initial chunk_id in player_dialogue_states.
 *
 * @param client  - Active pg.PoolClient inside withOLTPTransaction
 * @param userId  - Player's user id
 * @param treeId  - Dialogue tree id
 * @param nodeId  - Start node id
 * @param chunkId - Start chunk id (UUID)
 */
export async function initDialogueChunkState(
  client: pg.PoolClient,
  userId: string,
  treeId: string,
  nodeId: string,
  chunkId: string
): Promise<void> {
  await client.query(
    `INSERT INTO player_dialogue_states
         (user_id, dialogue_tree_id, current_node_id, current_chunk_id, choices_made)
       VALUES ($1, $2, $3, $4, '[]')
       ON CONFLICT (user_id, dialogue_tree_id) DO UPDATE SET
         current_node_id  = EXCLUDED.current_node_id,
         current_chunk_id = EXCLUDED.current_chunk_id,
         choices_made     = '[]',
         started_at       = NOW()`,
    [userId, treeId, nodeId, chunkId]
  );
}
