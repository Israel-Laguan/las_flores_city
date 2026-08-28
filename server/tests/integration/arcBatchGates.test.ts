import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { queryOLTP, closeConnections, closeRedis } from '@las-flores/infra';
import { filterChoices } from '../../src/routes/dialogue-helpers';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';

// ============================================================
// M48 Phase 6 — per-batch incompatible-state integration tests
// for the arcs converted in batches 2/4/5 (Camila, Ana, Lin
// sisters). Loads the REAL converted YAML and drives the
// production filterChoices path against relationship rows
// seeded directly into user_relationships.
//
// For each arc: romance/friendship-gated choices must NOT
// surface in an incompatible state while the ungated fallback
// remains visible (fail-closed).
//
// Dedicated synthetic user + collision-safe UUID; cleaned up
// in afterAll (AGENTS test-isolation rules).
// ============================================================

// Dedicated test user UUID — private to this test file (M48 Phase 6).
// Distinct from vqRelationshipGates.test.ts (...48001).
const TEST_USER_ID = 'e4800000-0000-4000-8000-000000048002';

const CAMILA_ID = '66856547-525f-4d5d-8b3c-6a264134d868';
const ANA_ID = '6a8b13c0-7e61-419b-98f5-b772e0c238fa';
const LIN_XIU_ID = '33333333-4444-4555-8666-777777770001';

const ADEYEMI_ID = 'a0000001-0000-4000-8000-000000000003';
const SOFIA_ID = 'c3d4e5f6-a7b8-4012-8def-123456789012';
const VALENTINA_REYES_ID = 'c51348ce-c575-4895-b17b-811af6869903';
const AISHA_ID = 'c1000013-e29b-41d4-a716-446655440013';
const VANCE_ID = '3b2b8000-e29b-41d4-a716-446655440001';

const CONTENT_DIR = path.resolve(process.cwd(), '..', 'content');

function loadDialogueYaml(relativePath: string): any {
  const raw = fs.readFileSync(path.resolve(CONTENT_DIR, relativePath), 'utf-8');
  return yaml.load(raw);
}

async function seedRelationship(
  characterId: string,
  row: { friendship?: number; romance?: number; trust?: number; tension?: number }
): Promise<void> {
  await queryOLTP(
    `INSERT INTO user_relationships (
       user_id, character_id, friendship_level, romance_level,
       trust, familiarity, alignment, tension, debt, visibility,
       bond_level, daily_vibe, status, memory, flags
     ) VALUES ($1,$2,
       COALESCE($3,0), COALESCE($4,0),
       COALESCE($5,0), 0, 0, COALESCE($6,0), 0, 0,
       0, 0, 'STRANGER', '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (user_id, character_id) DO UPDATE SET
       friendship_level = COALESCE($3,0), romance_level = COALESCE($4,0),
       trust = COALESCE($5,0), tension = COALESCE($6,0)`,
    [
      TEST_USER_ID, characterId,
      row.friendship ?? null, row.romance ?? null,
      row.trust ?? null, row.tension ?? null,
    ]
  );
}

beforeAll(async () => {
  await queryOLTP(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, 'arc_gates_test@test.com', 'arc_gates_player', 'Arc Gates Player')
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

describe('Camila Santander (batch 2) — incompatible states', () => {
  const confrontation = () => loadDialogueYaml('dialogues/camila_confrontation.yaml');
  const endings = () => loadDialogueYaml('dialogues/camila_santander_endings.yaml');

  test('warm confrontation is hidden below friendship gte:5; ungated alternative stays', async () => {
    const tree = confrontation();
    const node = tree.nodes['f0000000-0000-0000-0000-000000000062'];

    await seedRelationship(CAMILA_ID, { friendship: 2 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, CAMILA_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('confront_call_it');
    expect(ids).toContain('confront_let_go');

    await seedRelationship(CAMILA_ID, { friendship: 6 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, CAMILA_ID)).map((c: any) => c.id);
    expect(ids).toContain('confront_call_it');
  });

  test('endings hub: friend gate gte:7, enemy trust lt:20, fallback always visible', async () => {
    const tree = endings();
    const hub = tree.nodes['camila_ending_hub'];

    // Incompatible with FRIEND: low friendship. Compatible with ENEMY: low trust.
    await seedRelationship(CAMILA_ID, { friendship: 3, trust: 5 });
    let ids = (await filterChoices(hub.choices, TEST_USER_ID, CAMILA_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('trigger_friend');
    expect(ids).toContain('trigger_enemy');
    expect(ids).toContain('trigger_default'); // ungated fallback

    // Warm relationship: friend unlocks, enemy hides.
    await seedRelationship(CAMILA_ID, { friendship: 10, trust: 50 });
    ids = (await filterChoices(hub.choices, TEST_USER_ID, CAMILA_ID)).map((c: any) => c.id);
    expect(ids).toContain('trigger_friend');
    expect(ids).not.toContain('trigger_enemy');
  });

  test('romance deltas are gated — no romance-without-gate risk in batch 2 files', () => {
    const files = [
      'dialogues/camila_intro.yaml',
      'dialogues/camila_confrontation.yaml',
      'dialogues/camila_falsifier.yaml',
      'dialogues/camila_santander_hangout.yaml',
      'dialogues/camila_santander_intro.yaml',
      'dialogues/camila_santander_spree.yaml',
      'dialogues/camila_vdm_approach.yaml',
      'dialogues/camila_santander_endings.yaml',
    ];
    for (const relPath of files) {
      const tree = loadDialogueYaml(relPath);
      for (const node of Object.values(tree.nodes ?? {}) as any[]) {
        for (const choice of node.choices ?? []) {
          const romance = choice.effects?.relationship_effect?.romance ?? choice.relationship_effect?.romance;
          if (typeof romance === 'number' && romance > 0) {
            expect(choice.required_relationship ?? choice.hidden_if_relationship).toBeDefined();
          }
          expect(choice.relationship_change).toBeUndefined();
        }
      }
    }
  });
});


describe('Ana Villanueva (batch 5) — incompatible states', () => {
  const midgame = () => loadDialogueYaml('dialogues/ana_villanueva_relationship/dialogue_ana_midgame_tacos.yaml');

  test('romance confrontation hidden below friendship gte:20; cold path stays open', async () => {
    const tree = midgame();
    const node = tree.nodes['c1110000-0000-0000-0000-000000000022'];

    await seedRelationship(ANA_ID, { friendship: 10 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, ANA_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('confront_flaw');
    expect(ids).toContain('agree_cold');   // ungated
    expect(ids).toContain('angry_reject'); // ungated

    await seedRelationship(ANA_ID, { friendship: 25 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, ANA_ID)).map((c: any) => c.id);
    expect(ids).toContain('confront_flaw');
  });

  test('gated romance beat carries encounter bookkeeping', () => {
    const tree = midgame();
    const choice = tree.nodes['c1110000-0000-0000-0000-000000000022'].choices
      .find((c: any) => c.id === 'confront_flaw');
    expect(choice.effects.relationship_effect).toMatchObject({ romance: 1 });
    expect(choice.effects.state_set.last_ana_encounter_at).toBe('NOW');
  });
});

describe('Lin sisters (batch 4) — incompatible states', () => {
  const encounter = () => loadDialogueYaml('dialogues/lin_sisters_encounter/dialogue_lin_sisters_encounter.yaml');
  const language = () => loadDialogueYaml('dialogues/lin_sisters_romance/dialogue_xiu_language.yaml');

  test('first-contact flirt: hidden at high tension, visible at low tension', async () => {
    const tree = encounter();
    // Xiu's response node carries the tension-gated flirt choice.
    const node = tree.nodes['b2222222-2222-3333-4444-555555555555'];

    await seedRelationship(LIN_XIU_ID, { tension: 80 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, LIN_XIU_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('reply_flirt_xiu');
    expect(ids).toContain('reply_friendly_end'); // ungated

    await seedRelationship(LIN_XIU_ID, { tension: 10 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, LIN_XIU_ID)).map((c: any) => c.id);
    expect(ids).toContain('reply_flirt_xiu');
  });

  test('confession scene: romance choices gated on friendship gte:15', async () => {
    const tree = language();
    const node = tree.nodes['e5555555-4444-5555-6666-777777777777'];

    await seedRelationship(LIN_XIU_ID, { friendship: 5 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, LIN_XIU_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('playful_translate');
    expect(ids).not.toContain('playful_accept');

    await seedRelationship(LIN_XIU_ID, { friendship: 20 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, LIN_XIU_ID)).map((c: any) => c.id);
    expect(ids).toContain('playful_translate');
    expect(ids).toContain('playful_accept');
  });
});


describe('M49 batch — romance-gate static scan', () => {
  test('no positive romance deltas without gates in M49 batch', () => {
    const m49Files = [
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act1_apartment_visit.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act2_diego_arrest.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act3_phone_call.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_5_f.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_5_l.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_pressure_point.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_act5_resolution.yaml',
      'dialogues/adeyemi_relationship/dialogue_adeyemi_nm08.yaml',
      'dialogues/dialogue_beat_sofia_alberto_risk.yaml',
      'dialogues/dialogue_beat_sofia_corruption_network.yaml',
      'dialogues/dialogue_beat_sofia_intro.yaml',
      'dialogues/dialogue_beat_sofia_resolution.yaml',
      'dialogues/dialogue_beat_sofia_trust_building.yaml',
      'dialogues/dialogue_valentina_reyes.yaml',
    ];
    for (const relPath of m49Files) {
      const tree = loadDialogueYaml(relPath);
      for (const node of Object.values(tree.nodes ?? {}) as any[]) {
        for (const choice of node.choices ?? []) {
          const romance = choice.effects?.relationship_effect?.romance ?? choice.relationship_effect?.romance;
          const friendship = choice.effects?.relationship_effect?.friendship ?? choice.relationship_effect?.friendship;
          if (typeof romance === 'number' && romance > 0) {
            expect(choice.required_relationship ?? choice.hidden_if_relationship).toBeDefined();
          }
          if (typeof friendship === 'number' && friendship > 0) {
            expect(choice.required_relationship ?? choice.hidden_if_relationship).toBeDefined();
          }
        }
      }
    }
  });
});

describe('M49 batch — sofia/valentina_reyes gate integration', () => {
  const albertoRisk = () => loadDialogueYaml('dialogues/dialogue_beat_sofia_alberto_risk.yaml');
  const sofiaResolution = () => loadDialogueYaml('dialogues/dialogue_beat_sofia_resolution.yaml');

  test('sofia alberto_risk: choice_intercept_reason hidden below trust gte:1, fallback visible', async () => {
    const tree = albertoRisk();
    const node = tree.nodes['node_sofia_contact'];

    await seedRelationship(SOFIA_ID, { trust: 0 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, SOFIA_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('choice_intercept_reason');
    expect(ids).toContain('choice_sell_out');
    expect(ids).toContain('choice_lethal_force');

    await seedRelationship(SOFIA_ID, { trust: 10 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, SOFIA_ID)).map((c: any) => c.id);
    expect(ids).toContain('choice_intercept_reason');
  });

  test('sofia resolution: check_high_trust hidden below trust gte:75, default visible', async () => {
    const tree = sofiaResolution();
    const node = tree.nodes['node_resolution_check'];

    await seedRelationship(SOFIA_ID, { trust: 0 });
    let ids = (await filterChoices(node.choices, TEST_USER_ID, SOFIA_ID)).map((c: any) => c.id);
    expect(ids).not.toContain('check_high_trust');
    expect(ids).toContain('check_default');

    await seedRelationship(SOFIA_ID, { trust: 80 });
    ids = (await filterChoices(node.choices, TEST_USER_ID, SOFIA_ID)).map((c: any) => c.id);
    expect(ids).toContain('check_high_trust');
  });

  test('valentina_reyes: negative friendship delta is ungated (safety rule)', () => {
    const tree = loadDialogueYaml('dialogues/dialogue_valentina_reyes.yaml');
    const rejectionNode = tree.nodes['node_val_rejection'];
    const effect = rejectionNode.effects;
    expect(effect.relationship_effect.friendship).toBe(-5);
    expect(effect.state_set.last_valentina_encounter_at).toBe('NOW');
    // Negative deltas stay ungated — no required_relationship on this end node.
    expect(rejectionNode.choices).toBeUndefined();
  });
});
describe('M49 backlog audit — Aisha & Vance canonical gates', () => {
  const aisha = () => loadDialogueYaml('dialogues/dialogue_aisha_al_sayed.yaml');
  const vance = () => loadDialogueYaml('dialogues/dialogue_finale.yaml');

  test('aisha: legacy generic relationship meter maps to relationship_effect.axes.trust', () => {
    const tree = aisha();
    const rejection = tree.nodes['node_aisha_rejection'].effects;
    expect(rejection.relationship_effect.axes.trust).toBe(-5);
    expect(rejection.state_set.last_aisha_encounter_at).toBe('NOW');
    // Negative deltas stay ungated.
    expect(tree.nodes['node_aisha_rejection'].choices).toBeUndefined();

    const farewell = tree.nodes['farewell'].effects;
    expect(farewell.relationship_effect.axes.trust).toBe(5);
    expect(farewell.state_set.last_aisha_encounter_at).toBe('NOW');

    // The legacy generic stat_set is fully replaced — no aisha_relationship writes remain.
    expect(aisha().nodes['node_aisha_rejection'].effects.stat_set).toBeUndefined();
    expect(aisha().nodes['farewell'].effects.stat_set).toBeUndefined();
  });

  test('vance: final endings write axes.alignment + a small romance companion', () => {
    const tree = vance();
    const loyal = tree.nodes['finale_loyalist_ending'].effects;
    expect(loyal.relationship_effect.axes.alignment).toBe(10);
    expect(loyal.relationship_effect.romance).toBe(5);
    expect(loyal.state_set.last_vance_encounter_at).toBe('NOW');
    expect(loyal.state_set.final_alignment).toBe('loyalist');
    expect(loyal.story_beat).toBe('finale_complete');

    const fugitive = tree.nodes['finale_fugitive_ending'].effects;
    expect(fugitive.relationship_effect.axes.alignment).toBe(-10);
    expect(fugitive.relationship_effect.romance).toBe(8);
    expect(fugitive.state_set.last_vance_encounter_at).toBe('NOW');
    expect(fugitive.state_set.final_alignment).toBe('fugitive');
    expect(fugitive.story_beat).toBe('finale_complete');
  });

  test('vance: alignment endings are romance-gated with a neutral_default floor (never stranded)', async () => {
    const reveal = vance().nodes['finale_reveal'];
    for (const c of reveal.choices) {
      expect(['loyalist', 'fugitive']).toContain(c.alignment_change);
      // `romance_level` is DB-bounded to non-negative (CHECK), so the canonical
      // romance is a one-way meter. It is gated here with the documented
      // `neutral_default` fail-open floor so a no-row / first-time finale player is
      // never stranded, while still satisfying the "no romance-without-gate" rule.
      expect(c.required_relationship).toBeDefined();
      expect(c.required_relationship.neutral_default).toBe(true);
      expect(c.required_relationship.romance).toBe('gte:0');
    }

    // A zero-romance / no-bond player still reaches both alignment endings.
    await seedRelationship(VANCE_ID, { romance: 0 });
    const ids = (await filterChoices(reveal.choices, TEST_USER_ID, VANCE_ID)).map((c: any) => c.id);
    expect(ids).toContain('finale_loyalist_choice');
    expect(ids).toContain('finale_fugitive_choice');
  });
});


describe('Phase 6 batch closure — entry nodes keep ≥1 ungated choice', () => {
  const files = [
    'dialogues/camila_intro.yaml',
    'dialogues/camila_confrontation.yaml',
    'dialogues/camila_falsifier.yaml',
    'dialogues/camila_santander_hangout.yaml',
    'dialogues/camila_santander_intro.yaml',
    'dialogues/camila_santander_spree.yaml',
    'dialogues/camila_vdm_approach.yaml',
    'dialogues/camila_santander_endings.yaml',
    'dialogues/camila_santander_epilogue.yaml',
    'dialogues/camila_upload.yaml',
    'dialogues/ana_villanueva_relationship/dialogue_ana_intro.yaml',
    'dialogues/ana_villanueva_relationship/dialogue_ana_midgame_tacos.yaml',
    'dialogues/ana_villanueva_relationship/dialogue_ana_endings.yaml',
    'dialogues/lin_sisters_encounter/dialogue_lin_sisters_encounter.yaml',
    'dialogues/lin_sisters_romance/dialogue_xiu_language.yaml',
    'dialogues/lin_sisters_parents/dialogue_lin_sisters_parents.yaml',
    'dialogues/lin_sisters_test/dialogue_lin_sisters_classroom.yaml',
    'dialogues/garcia_sisters/dialogue_isabella_encounter.yaml',
    'dialogues/garcia_sisters/dialogue_sofia_encounter.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act1_apartment_visit.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act2_diego_arrest.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act3_5_receipt.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act3_phone_call.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_5_f.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_5_l.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act4_pressure_point.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_act5_resolution.yaml',
    'dialogues/adeyemi_relationship/dialogue_adeyemi_nm08.yaml',
    'dialogues/dialogue_beat_sofia_alberto_risk.yaml',
    'dialogues/dialogue_beat_sofia_corruption_network.yaml',
    'dialogues/dialogue_beat_sofia_intro.yaml',
    'dialogues/dialogue_beat_sofia_resolution.yaml',
    'dialogues/dialogue_beat_sofia_trust_building.yaml',
    'dialogues/dialogue_valentina_reyes.yaml',
    'dialogues/dialogue_aisha_al_sayed.yaml',
    'dialogues/dialogue_finale.yaml',
  ];

  test.each(files)('%s start node keeps ≥1 always-visible choice', (relPath) => {
    const tree = loadDialogueYaml(relPath);
    const startNode = tree.nodes[tree.start_node_id];
    const choices = startNode.choices ?? [];
    // Narrator/system nodes auto-advance via next_node_id and carry no
    // choices — no empty-list risk there.
    if (choices.length === 0) return;
    const alwaysVisible = choices.filter(
      (c: any) =>
        !c.required_relationship &&
        !c.hidden_if_relationship &&
        !c.required_posture &&
        !c.hidden_if_posture
    );
    // A fail-closed filter can never empty the entry node's list.
    // (Player-flag/state-only gates still count as ungated here.)
    expect(alwaysVisible.length).toBeGreaterThan(0);
  });

  test('no legacy relationship_change remains in any batch-converted file', () => {
    for (const relPath of files) {
      const tree = loadDialogueYaml(relPath);
      for (const node of Object.values(tree.nodes ?? {}) as any[]) {
        for (const choice of node.choices ?? []) {
          expect(choice.relationship_change).toBeUndefined();
        }
      }
    }
  });
});

