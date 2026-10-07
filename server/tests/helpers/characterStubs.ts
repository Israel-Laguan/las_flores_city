import { queryOLTP } from '@las-flores/infra';

/**
 * Ensure `characters` rows exist for real content IDs that a suite references via
 * FK (e.g. `user_relationships.character_id`). CI applies SQL migrations only, so
 * the real content rows are absent there but present on a content-migrated dev DB.
 *
 * Inserts a stub only when the row is missing (ON CONFLICT DO NOTHING) and returns
 * the IDs it created, so `removeCharacterStubs` never deletes a real migrated row.
 */
export async function ensureCharacterStubs(ids: readonly string[]): Promise<string[]> {
  const created: string[] = [];
  for (const id of ids) {
    const res = await queryOLTP(
      `INSERT INTO characters (id, name, description)
       VALUES ($1, $2, 'integration-test stub (auto-removed in afterAll)')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, `Test stub ${id.slice(0, 8)}`]
    );
    if (res.rows.length > 0) created.push(id);
  }
  return created;
}

export async function removeCharacterStubs(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await queryOLTP('DELETE FROM characters WHERE id = ANY($1::uuid[])', [ids]);
}
