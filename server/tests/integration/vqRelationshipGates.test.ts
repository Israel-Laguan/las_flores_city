import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { queryOLTP, closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';
import {
  relationshipPassesFilters,
  derivePosture,
} from '@las-flores/shared';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';

// ============================================================
// M48 — Valentina Quan relationship-gate integration tests.
//
// Loads the REAL converted YAML (content/dialogues/valentina_quan_relationship/)
// and drives the shared relationshipPassesFilters evaluator against
// relationship rows seeded directly into user_relationships.
//
// Covers the 7 required scenarios:
//  1. high trust/high familiarity/low tension → Grounded offered
//  2. low trust/high romance → Grounded+Departed hidden, Friends shown
//  3. high tension/low familiarity → GUARDED posture, breakthrough gated out
//  4. high familiarity/low alignment → CONFRONTATIONAL posture derived
//  5. neglect (vibe decay) → pacing fallback; re-engagement → normal
//  6. failed ending → Shut-out reachable but never on a warm relationship
//  7. romantic success → Grounded gated on trust+romance; status→ROMANTIC
//
// Dedicated synthetic user + collision-safe UUIDs; cleaned up in afterAll.
// ============================================================

// Dedicated test user UUID — private to this test file (M48).
const TEST_USER_ID = 'e4800000-0000-4000-8000-000000048001';
const VQ_CHARACTER_ID = '670eea6f-3983-4d5a-8195-b08be6c81661';

const CONTENT_DIR = path.resolve(process.cwd(), '..', 'content');

function loadDialogueYaml(relativePath: string): any {
  const raw = fs.readFileSync(path.resolve(CONTENT_DIR, relativePath), 'utf-8');
  return yaml.load(raw);
}

interface RelRow {
  friendship_level: number;
  romance_level: number;
  trust: number;
  familiarity: number;
  alignment: number;
  tension: number;
  debt: number;
  visibility: number;
  bond_level: number;
  daily_vibe: number;
  status: string;
  memory: Record<string, number>;
  flags: Record<string, boolean>;
}

async function seedRelationship(row: Partial<RelRow>): Promise<void> {
  await queryOLTP(
    `INSERT INTO user_relationships (
       user_id, character_id, friendship_level, romance_level,
       trust, familiarity, alignment, tension, debt, visibility,
       bond_level, daily_vibe, status, memory, flags
     ) VALUES ($1,$2,
       COALESCE($3,0), COALESCE($4,0),
       COALESCE($5,0), COALESCE($6,0), COALESCE($7,0), COALESCE($8,0),
       COALESCE($9,0), COALESCE($10,0),
       COALESCE($11,0), COALESCE($12,0), COALESCE($13,'STRANGER'),
       COALESCE($14,'{}'::jsonb), COALESCE($15,'{}'::jsonb))
     ON CONFLICT (user_id, character_id) DO UPDATE SET
       friendship_level = COALESCE($3,0), romance_level = COALESCE($4,0),
       trust = COALESCE($5,0), familiarity = COALESCE($6,0),
       alignment = COALESCE($7,0), tension = COALESCE($8,0),
       debt = COALESCE($9,0), visibility = COALESCE($10,0),
       bond_level = COALESCE($11,0), daily_vibe = COALESCE($12,0),
       status = COALESCE($13,'STRANGER'),
       memory = COALESCE($14,'{}'::jsonb), flags = COALESCE($15,'{}'::jsonb)`,
    [
      TEST_USER_ID, VQ_CHARACTER_ID,
      row.friendship_level ?? null, row.romance_level ?? null,
      row.trust ?? null, row.familiarity ?? null, row.alignment ?? null,
      row.tension ?? null, row.debt ?? null, row.visibility ?? null,
      row.bond_level ?? null, row.daily_vibe ?? null, row.status ?? null,
      row.memory ? JSON.stringify(row.memory) : null,
      row.flags ? JSON.stringify(row.flags) : null,
    ]
  );
}

/** Read the seeded row back through the same pool-based getter the routes use. */
async function loadConditionState(): Promise<any | null> {
  const result = await queryOLTP<RelRow & { character_id: string }>(
    `SELECT character_id, friendship_level, romance_level, trust, familiarity,
            alignment, tension, debt, visibility, bond_level, daily_vibe, status,
            memory, flags
       FROM user_relationships WHERE user_id = $1 AND character_id = $2`,
    [TEST_USER_ID, VQ_CHARACTER_ID]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    axes: {
      trust: r.trust, familiarity: r.familiarity, alignment: r.alignment,
      tension: r.tension, debt: r.debt, visibility: r.visibility,
    },
    bond: r.bond_level,
    vibe: r.daily_vibe,
    romance: r.romance_level,
    friendship: r.friendship_level,
    status: r.status,
    flags: r.flags ?? {},
    memory: r.memory ?? {},
  };
}

function choiceById(tree: any, nodeId: string, choiceId: string): any {
  const node = tree.nodes[nodeId];
  const found = (node?.choices ?? []).find((c: any) => c.id === choiceId);
  if (!found) throw new Error(`choice ${choiceId} not found on ${nodeId}`);
  return found;
}

beforeAll(async () => {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'vq_gates_test@test.com', 'vq_gates_player', 'VQ Gates Player')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID]
  );
  await queryOLTP(
    `INSERT INTO player_states (user_id, time_blocks, credits, gold_credits, current_day, story_beat, flags, state, stats)
     VALUES ($1, 48, 0, 0, 1, 'prologue', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );
});

afterAll(async () => {
  // Clean up this suite's own rows only (dedicated UUID avoids collisions).
  await queryOLTP('DELETE FROM user_relationships WHERE user_id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM player_states WHERE user_id = $1', [TEST_USER_ID]);
  await queryOLTP('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  await closeConnections();
  await closeRedis();
});

describe('Valentina endings gate matrix (real YAML)', () => {
  const endings = () => loadDialogueYaml('dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml');

  test('scenario 1: high trust/familiarity, low tension → Grounded offered', async () => {
    // Player gave space during Act 3 (player flag lives on player_states).
    await queryOLTP(
      `UPDATE player_states SET flags = flags || '{"vq_gave_space": true}'::jsonb WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    await seedRelationship({
      trust: 50, familiarity: 60, tension: 10, daily_vibe: 20, romance_level: 30, status: 'CONFIDANT',
    });
    const state = await loadConditionState();
    const map = { [VQ_CHARACTER_ID]: state };
    const tree = endings();

    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), map, VQ_CHARACTER_ID)).toBe(true);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_friends'), map, VQ_CHARACTER_ID)).toBe(true);
  });

  test('scenario 2: low trust / high romance → Grounded+Departed hidden, Friends shown', async () => {
    await queryOLTP(
      `UPDATE player_states SET flags = flags || '{"vq_gave_space": true}'::jsonb WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    await seedRelationship({
      trust: 10, familiarity: 40, tension: 20, daily_vibe: 10, romance_level: 35, status: 'ACQUAINTANCE',
    });
    const state = await loadConditionState();
    const map = { [VQ_CHARACTER_ID]: state };
    const tree = endings();

    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), map, VQ_CHARACTER_ID)).toBe(false);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_departed'), map, VQ_CHARACTER_ID)).toBe(false);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_friends'), map, VQ_CHARACTER_ID)).toBe(true);

    // No contradictory "you pushed her away" on a non-pushed playthrough:
    // branch_shut_out requires the vq_pushed_away player flag, which is unset.
    const shutOut = choiceById(tree, 'vq_endings_start', 'branch_shut_out');
    expect(shutOut.required_flags?.vq_pushed_away).toBe(true);
  });

  test('scenario 3: high tension / low familiarity → GUARDED posture, breakthrough gated out', async () => {
    await seedRelationship({ trust: 12, familiarity: 15, tension: 65 });
    const state = await loadConditionState();
    const map = { [VQ_CHARACTER_ID]: state };

    expect(derivePosture(state)).toBe('GUARDED');

    const father = loadDialogueYaml('dialogues/valentina_quan_relationship/dialogue_vq_father.yaml');
    // tuition_pattern (the breakthrough reveal) requires trust gte:20.
    expect(relationshipPassesFilters(choiceById(father, 'vq_father_tuition', 'tuition_pattern'), map, VQ_CHARACTER_ID)).toBe(false);
    // Safe alternatives stay available.
    expect(relationshipPassesFilters(choiceById(father, 'vq_father_tuition', 'tuition_quiet'), map, VQ_CHARACTER_ID)).toBe(true);
  });

  test('scenario 4: high familiarity / low alignment → CONFRONTATIONAL posture derived', async () => {
    await seedRelationship({ familiarity: 60, alignment: -40, tension: 65 });
    const state = await loadConditionState();
    expect(derivePosture(state)).toBe('CONFRONTATIONAL');
  });

  test('scenario 5: neglect (low vibe) → pacing fallback; re-engagement → normal', async () => {
    await queryOLTP(
      `UPDATE player_states SET flags = flags || '{"vq_gave_space": true}'::jsonb WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    // Neglected: earned gates pass, but vibe has decayed far negative.
    await seedRelationship({ trust: 55, familiarity: 60, tension: 15, romance_level: 30, daily_vibe: -45 });
    let state = await loadConditionState();
    let map = { [VQ_CHARACTER_ID]: state };
    const tree = endings();

    // Romantic branches are paced out; the pacing option appears.
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), map, VQ_CHARACTER_ID)).toBe(false);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_pacing'), map, VQ_CHARACTER_ID)).toBe(true);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_friends'), map, VQ_CHARACTER_ID)).toBe(true);

    // Re-engagement restores vibe → pacing hides, Grounded returns.
    await seedRelationship({ trust: 55, familiarity: 60, tension: 15, romance_level: 30, daily_vibe: 25 });
    state = await loadConditionState();
    map = { [VQ_CHARACTER_ID]: state };
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_pacing'), map, VQ_CHARACTER_ID)).toBe(false);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), map, VQ_CHARACTER_ID)).toBe(true);
  });

  test('scenario 6: pushed-away save reaches Shut-out; warm trust hides it', async () => {
    // Pushed-away save with low trust → Shut Out visible.
    await queryOLTP(
      `UPDATE player_states SET flags = flags || '{"vq_pushed_away": true, "vq_gave_space": false}'::jsonb WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    await seedRelationship({ trust: 5, familiarity: 30, tension: 40 });
    let state = await loadConditionState();
    let map = { [VQ_CHARACTER_ID]: state };
    const tree = endings();

    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_shut_out'), map, VQ_CHARACTER_ID)).toBe(true);
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_friends'), map, VQ_CHARACTER_ID)).toBe(true);

    // Warm relationship after re-engagement → shut-out is hidden by trust gte:20.
    await seedRelationship({ trust: 45, familiarity: 60, tension: 10 });
    state = await loadConditionState();
    map = { [VQ_CHARACTER_ID]: state };
    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_shut_out'), map, VQ_CHARACTER_ID)).toBe(false);
  });

  test('scenario 7: romantic success — Grounded needs trust AND romance; status→ROMANTIC effect present', async () => {
    await queryOLTP(
      `UPDATE player_states SET flags = flags || '{"vq_gave_space": true, "vq_pushed_away": false}'::jsonb WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    await seedRelationship({ trust: 50, familiarity: 60, tension: 10, romance_level: 30, daily_vibe: 20 });
    const state = await loadConditionState();
    const map = { [VQ_CHARACTER_ID]: state };
    const tree = endings();

    expect(relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), map, VQ_CHARACTER_ID)).toBe(true);

    // The grounded accept choice carries the canonical ROMANTIC transition.
    const groundedAccept = choiceById(tree, 'vq_end_grounded_try', 'grounded_accept');
    expect(groundedAccept.effects.relationship_effect).toMatchObject({ romance: 15, status: 'ROMANTIC' });
    // And it no longer uses the legacy relationship_change channel.
    expect(groundedAccept.relationship_change).toBeUndefined();

    // Trust alone without enough romance fails the gate.
    await seedRelationship({ trust: 50, familiarity: 60, tension: 10, romance_level: 10, daily_vibe: 20 });
    const lowRomance = await loadConditionState();
    expect(
      relationshipPassesFilters(choiceById(tree, 'vq_endings_start', 'branch_grounded'), { [VQ_CHARACTER_ID]: lowRomance }, VQ_CHARACTER_ID)
    ).toBe(false);
  });
});

describe('Valentina entry-node empty-list guard (real YAML)', () => {
  const files = [
    'dialogues/valentina_quan_relationship/dialogue_vq_intro.yaml',
    'dialogues/valentina_quan_relationship/dialogue_vq_layover.yaml',
    'dialogues/valentina_quan_relationship/dialogue_vq_push.yaml',
    'dialogues/valentina_quan_relationship/dialogue_vq_father.yaml',
    'dialogues/valentina_quan_relationship/dialogue_vq_endings.yaml',
  ];

  test.each(files)('%s start node keeps ≥1 ungated choice', (relPath) => {
    const tree = loadDialogueYaml(relPath);
    const startNode = tree.nodes[tree.start_node_id];
    const choices = startNode.choices ?? [];
    expect(choices.length).toBeGreaterThan(0);
    const ungated = choices.filter(
      (c: any) =>
        !c.required_relationship &&
        !c.hidden_if_relationship &&
        !c.required_posture &&
        !c.hidden_if_posture
    );
    // A fail-closed filter can never empty the entry node's list.
    // (Player-flag/state-only gates still count as ungated here.)
    const alwaysVisible = choices.filter((c: any) => {
      if (c.required_relationship || c.required_posture) return false;
      if (c.hidden_if_relationship || c.hidden_if_posture) return false;
      return true;
    });
    expect(alwaysVisible.length).toBeGreaterThan(0);
    void ungated;
  });

  test('no legacy vq_trust stat writes remain in any Valentina file', () => {
    for (const relPath of files) {
      const raw = fs.readFileSync(path.resolve(CONTENT_DIR, relPath), 'utf-8');
      const tree: any = yaml.load(raw);
      for (const [nodeId, node] of Object.entries(tree.nodes ?? {}) as any[]) {
        const effects = node.effects ?? {};
        expect(effects.stat_set?.vq_trust).toBeUndefined();
        for (const choice of node.choices ?? []) {
          expect(choice.stat_set?.vq_trust).toBeUndefined();
          expect(choice.effects?.stat_set?.vq_trust).toBeUndefined();
          expect(choice.required_stats?.vq_trust).toBeUndefined();
          expect(choice.relationship_change).toBeUndefined();
        }
        void nodeId;
      }
    }
  });
});
