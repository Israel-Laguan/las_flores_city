// api/planning/src/scene/conflicts.test.ts
// SC-304 (m-61/m-63): conflict detection over sorted overlay groups + report format.

import { TRUE, and, createSceneDef, createSceneOverlay, flag, not, type SceneOverlay } from '@las-flores/api-contracts';
import { composeScene } from './compose-scene.js';
import { conflictsToIssues, detectConflicts, formatConflictReport, stringifyConflictReport } from './conflicts.js';

const ov = (slug: string, priority: number, rest: Partial<SceneOverlay> = {}): SceneOverlay =>
  createSceneOverlay({ slug, base_scene_slug: 'vq_airport_gate', priority, ...rest });

// SC-S13 fixture: canon sets both vq_endings flags together, so the naive pair overlaps.
const dusk = ov('vq_gave_space_dusk', 10, {
  availability: flag('vq_gave_space', true),
  ops: [
    { op: 'add_dialogue_refs', refs: ['dialogue_vq_endings'] },
    { op: 'set_weather', weather: 'overcast' },
  ],
});
const rain = ov('vq_pushed_away_rain', 10, {
  availability: flag('vq_pushed_away', true),
  ops: [
    { op: 'add_items', items: ['umbrella'] },
    { op: 'cast_slot', slot_id: 'bystander', cast: 'marco_reyes' },
    { op: 'set_weather', weather: 'rain' },
  ],
});
const refinedDusk = { ...dusk, availability: and([flag('vq_gave_space', true), not(flag('vq_pushed_away', true))]) };

describe('detectConflicts (SC-304)', () => {
  test('naive SC-S13 pair: equal priority, both set weather, co-satisfiable → error with witness', () => {
    expect(detectConflicts([rain, dusk])).toEqual([
      {
        code: 'SCENE_EXCLUSIVE_CONFLICT',
        overlays: ['vq_gave_space_dusk', 'vq_pushed_away_rain'],
        priority: 10,
        property: 'weather',
        severity: 'error',
        values: ['overcast', 'rain'],
        witness: ['vq_gave_space', 'vq_pushed_away'],
      },
    ]);
  });

  test('refined pair (A ∧ ¬B vs B) is not co-satisfiable → no conflict (near-miss)', () => {
    expect(detectConflicts([refinedDusk, rain])).toEqual([]);
  });

  test('different priorities are never an exclusive/cast conflict', () => {
    expect(detectConflicts([dusk, { ...rain, priority: 11 }])).toEqual([]);
    const castA = ov('a', 1, { ops: [{ op: 'cast_slot', slot_id: 's', cast: 'x' }] });
    const castB = ov('b', 2, { ops: [{ op: 'cast_slot', slot_id: 's', cast: 'y' }] });
    expect(detectConflicts([castA, castB])).toEqual([]);
  });

  test('set_time conflicts like set_weather; static overlays overlap with everything', () => {
    const a = ov('a', 0, { ops: [{ op: 'set_time', time: 'night' }] });
    const b = ov('b', 0, { availability: flag('x', true), ops: [{ op: 'set_time', time: null }] });
    expect(detectConflicts([a, b])).toEqual([
      expect.objectContaining({ code: 'SCENE_EXCLUSIVE_CONFLICT', property: 'time', overlays: ['a', 'b'], values: ['night', null], witness: ['x'] }),
    ]);
  });

  test('cast_slot to different characters at equal priority → SCENE_SLOT_CAST_CONFLICT', () => {
    const a = ov('a', 3, { ops: [{ op: 'cast_slot', slot_id: 'bystander', cast: 'marco' }] });
    const b = ov('b', 3, { ops: [{ op: 'cast_slot', slot_id: 'bystander', cast: 'lucia' }] });
    expect(detectConflicts([a, b])).toEqual([
      expect.objectContaining({
        code: 'SCENE_SLOT_CAST_CONFLICT',
        property: 'role_slots.bystander.cast',
        overlays: ['a', 'b'],
        values: ['marco', 'lucia'],
        severity: 'error',
      }),
    ]);
  });

  test('cast_slot to the SAME character is not a conflict', () => {
    const a = ov('a', 3, { ops: [{ op: 'cast_slot', slot_id: 'bystander', cast: 'marco' }] });
    const b = ov('b', 3, { ops: [{ op: 'cast_slot', slot_id: 'bystander', cast: 'marco' }] });
    expect(detectConflicts([a, b])).toEqual([]);
  });

  test('two co-satisfiable overlays adding the same slot_id → SCENE_SLOT_ADD_CONFLICT at any priority', () => {
    const slot = { slot_id: 'guard', cast: null, position: 'left' } as const;
    const a = ov('a', 1, { availability: flag('x', true), ops: [{ op: 'add_role_slot', slot }] });
    const b = ov('b', 7, { availability: flag('y', true), ops: [{ op: 'add_role_slot', slot }] });
    expect(detectConflicts([a, b])).toEqual([
      expect.objectContaining({ code: 'SCENE_SLOT_ADD_CONFLICT', property: 'role_slots.guard', priority: 1, overlays: ['a', 'b'] }),
    ]);
    expect(detectConflicts([a, { ...b, availability: flag('x', false) }])).toEqual([]);
  });

  test('additive ops never conflict', () => {
    const a = ov('a', 0, { ops: [{ op: 'add_items', items: ['x'] }, { op: 'add_dialogue_refs', refs: ['d'] }] });
    const b = ov('b', 0, { ops: [{ op: 'add_items', items: ['x'] }, { op: 'add_dialogue_refs', refs: ['d'] }] });
    expect(detectConflicts([a, b])).toEqual([]);
  });

  test('undecidable (> 16 vars) → conservative conflict with severity hint', () => {
    const big = (prefix: string) => and(Array.from({ length: 9 }, (_, i) => flag(`${prefix}${i}`, true)));
    const a = ov('a', 0, { availability: big('p'), ops: [{ op: 'set_weather', weather: 'fog' }] });
    const b = ov('b', 0, { availability: big('q'), ops: [{ op: 'set_weather', weather: 'rain' }] });
    expect(detectConflicts([a, b])).toEqual([
      expect.objectContaining({ code: 'SCENE_EXCLUSIVE_CONFLICT', severity: 'hint', witness: null }),
    ]);
  });

  test('three-way group reports every co-satisfiable pair, ordered', () => {
    const w = (slug: string, weather: 'fog' | 'rain' | 'storm') => ov(slug, 0, { ops: [{ op: 'set_weather', weather }] });
    const pairs = detectConflicts([w('c', 'storm'), w('a', 'fog'), w('b', 'rain')]).map((c) => c.overlays);
    expect(pairs).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  test('result is independent of input order', () => {
    const all = [dusk, rain, ov('z', 10, { ops: [{ op: 'cast_slot', slot_id: 'bystander', cast: 'q' }] })];
    expect(detectConflicts([...all].reverse())).toEqual(detectConflicts(all));
  });
});

describe('conflict report (SC-304 m-63)', () => {
  test('stable JSON report, snapshot', () => {
    const report = formatConflictReport('vq_airport_gate', detectConflicts([rain, dusk]));
    expect(stringifyConflictReport(report)).toBe(
      [
        '{',
        '  "conflicts": [',
        '    {',
        '      "code": "SCENE_EXCLUSIVE_CONFLICT",',
        '      "overlays": [',
        '        "vq_gave_space_dusk",',
        '        "vq_pushed_away_rain"',
        '      ],',
        '      "priority": 10,',
        '      "property": "weather",',
        '      "severity": "error",',
        '      "values": [',
        '        "overcast",',
        '        "rain"',
        '      ],',
        '      "witness": [',
        '        "vq_gave_space",',
        '        "vq_pushed_away"',
        '      ]',
        '    }',
        '  ],',
        '  "scene_slug": "vq_airport_gate",',
        '  "status": "failed"',
        '}',
      ].join('\n'),
    );
  });

  test('empty report has status ok', () => {
    expect(formatConflictReport('s', [])).toEqual({ conflicts: [], scene_slug: 's', status: 'ok' });
  });

  test('hint-only report does not fail', () => {
    expect(formatConflictReport('s', [{ code: 'SCENE_EXCLUSIVE_CONFLICT', overlays: ['a', 'b'], priority: 0, property: 'weather', severity: 'hint', values: [null, null], witness: null }]).status).toBe('ok');
  });

  test('conflictsToIssues names both overlays and the property', () => {
    const [issue] = conflictsToIssues(detectConflicts([rain, dusk]));
    expect(issue).toEqual(expect.objectContaining({ code: 'SCENE_EXCLUSIVE_CONFLICT', path: 'weather', severity: 'error' }));
    expect(issue.message).toContain('vq_gave_space_dusk');
    expect(issue.message).toContain('vq_pushed_away_rain');
  });
});

describe('composeScene fails compile on conflicts (SC-304)', () => {
  const base = createSceneDef({
    id: 'c3000000-0000-4000-8000-000000000003',
    slug: 'vq_airport_gate',
    title: 't',
    description: 'd',
    location: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    role_slots: [{ slot_id: 'bystander', cast: null, position: 'right' }],
  });

  test('naive pair → error issue; refined pair → clean', () => {
    expect(composeScene(base, [dusk, rain]).issues.map((i) => i.code)).toEqual(['SCENE_EXCLUSIVE_CONFLICT']);
    expect(composeScene(base, [refinedDusk, rain]).issues).toEqual([]);
  });

  test('hint conflicts surface on ResolvedScene.issues; errors do not', () => {
    expect(composeScene(base, [dusk, rain]).scene.issues).toEqual([]);
    const big = (p: string) => and(Array.from({ length: 9 }, (_, i) => flag(`${p}${i}`, true)));
    const res = composeScene(base, [
      ov('a', 0, { availability: big('p'), ops: [{ op: 'set_weather', weather: 'fog' }] }),
      ov('b', 0, { availability: big('q'), ops: [{ op: 'set_weather', weather: 'rain' }] }),
    ]);
    expect(res.scene.issues.map((i) => i.severity)).toEqual(['hint']);
  });

  test('a static + flag-gated pair still conflicts (TRUE overlaps anything)', () => {
    const s = ov('s', 10, { availability: TRUE, ops: [{ op: 'set_weather', weather: 'fog' }] });
    expect(composeScene(base, [s, rain]).issues.map((i) => i.code)).toEqual(['SCENE_EXCLUSIVE_CONFLICT']);
  });
});
