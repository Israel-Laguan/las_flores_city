import {
  relationshipPassesFilters,
  derivePosture,
  POSTURE_THRESHOLDS,
} from '@las-flores/shared';

const TARGET = '670eea6f-3983-4d5a-8195-b08be6c81661';
const OTHER = '770eea6f-3983-4d5a-8195-b08be6c81661';

function state(overrides: any = {}): any {
  return {
    axes: { trust: 0, familiarity: 0, alignment: 0, tension: 0, debt: 0, visibility: 0 },
    bond: 0,
    vibe: 0,
    romance: 0,
    friendship: 0,
    status: 'STRANGER',
    flags: {},
    memory: {},
    ...overrides,
  };
}

const FILLED = state({
  axes: { trust: 50, familiarity: 60, alignment: -30, tension: 10, debt: 0, visibility: 20 },
  bond: 40,
  vibe: 30,
  romance: 30,
  friendship: 50,
  status: 'CONFIDANT',
  flags: { confided: true },
  memory: { shared_lounge: 8 },
});

describe('relationshipPassesFilters — required_relationship', () => {
  it('passes when all axis thresholds are met', () => {
    const choice = {
      required_relationship: { axes: { trust: 'gte:40', familiarity: 'gte:50' } },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });

  it('fails when an axis threshold is not met', () => {
    const choice = {
      required_relationship: { axes: { trust: 'gte:60' } },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('fails closed when there is no relationship row', () => {
    const choice = {
      required_relationship: { axes: { trust: 'gte:0' } },
    };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('neutral_default evaluates against a STRANGER/zero baseline (passes gte:0)', () => {
    const choice = {
      required_relationship: { axes: { trust: 'gte:0' }, neutral_default: true },
    };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });

  it('neutral_default baseline fails a strict gt:0 (missing row is exactly 0)', () => {
    const choice = {
      required_relationship: { axes: { trust: 'gt:0' }, neutral_default: true },
    };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('evaluates bond / vibe / romance / friendship / status / flags / memory', () => {
    const choice = {
      required_relationship: {
        bond: 'gte:40',
        vibe: 'gte:30',
        romance: 'gte:30',
        friendship: 'gte:50',
        status: 'CONFIDANT',
        flags: { confided: true },
        memory: { shared_lounge: 'gte:8' },
      },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });

  it('fails when a flag does not match', () => {
    const choice = {
      required_relationship: { flags: { confided: false } },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('malformed axis comparison fails closed', () => {
    const choice = {
      required_relationship: { axes: { trust: 'around:50' } },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('uses target_character_id override when present', () => {
    const choice = {
      required_relationship: {
        target_character_id: OTHER,
        axes: { trust: 'gte:40' },
      },
    };
    const map: any = {
      [TARGET]: null,
      [OTHER]: FILLED,
    };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });

  it('returns false when no default and no override target is available', () => {
    const choice = { required_relationship: { axes: { trust: 'gte:0' } } };
    const map: any = {};
    expect(relationshipPassesFilters(choice as any, map, undefined)).toBe(false);
  });
});

describe('relationshipPassesFilters — hidden_if_relationship', () => {
  it('hides when a condition matches', () => {
    const choice = {
      hidden_if_relationship: { axes: { trust: 'gte:50' } },
    };
    const map: any = { [TARGET]: FILLED };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('never hides when there is no relationship row (fail-open)', () => {
    const choice = {
      hidden_if_relationship: { axes: { trust: 'gte:0' } },
    };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });

  it('neutral_default makes hidden_if match against the baseline', () => {
    const choice = {
      hidden_if_relationship: { axes: { trust: 'gte:0' }, neutral_default: true },
    };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });
});

describe('relationshipPassesFilters — posture gates', () => {
  it('required_posture passes only when derived posture matches', () => {
    const warm = state({ axes: { trust: 60, familiarity: 60, tension: 10 } });
    const choice = { required_posture: 'WARM' as const };
    const map: any = { [TARGET]: warm };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);

    const dist = state({ axes: { trust: 5, familiarity: 5 } });
    const map2: any = { [TARGET]: dist };
    expect(relationshipPassesFilters(choice as any, map2, TARGET)).toBe(false);
  });

  it('hidden_if_posture hides when posture matches', () => {
    const dist = state({ axes: { trust: 5, familiarity: 5 } });
    const choice = { hidden_if_posture: 'DISTANT' as const };
    const map: any = { [TARGET]: dist };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(false);
  });

  it('posture gate on a missing row uses DISTANT baseline', () => {
    const choice = { required_posture: 'DISTANT' as const };
    const map: any = { [TARGET]: null };
    expect(relationshipPassesFilters(choice as any, map, TARGET)).toBe(true);
  });
});

describe('derivePosture — threshold map', () => {
  const t = POSTURE_THRESHOLDS;

  it('ROMANTIC + low trust + high tension → VOLATILE_ROMANCE', () => {
    const s = state({ status: 'ROMANTIC', axes: { trust: 10, tension: 60 } });
    expect(derivePosture(s)).toBe('VOLATILE_ROMANCE');
  });

  it('ROMANTIC + healthy axes → WARM', () => {
    const s = state({ status: 'ROMANTIC', axes: { trust: 60, tension: 10 } });
    expect(derivePosture(s)).toBe('WARM');
  });

  it('ENDED → BROKEN', () => {
    expect(derivePosture(state({ status: 'ENDED' }))).toBe('BROKEN');
  });

  it('DISTANCED → DISTANT', () => {
    expect(derivePosture(state({ status: 'DISTANCED' }))).toBe('DISTANT');
  });

  it('high tension + low familiarity → GUARDED', () => {
    const s = state({ axes: { tension: t.guardedTensionMin, familiarity: 10 } });
    expect(derivePosture(s)).toBe('GUARDED');
  });

  it('high tension + low alignment → CONFRONTATIONAL', () => {
    const s = state({
      axes: { tension: t.confrontationalTensionMin, alignment: t.confrontationalAlignmentMax - 1 },
    });
    expect(derivePosture(s)).toBe('CONFRONTATIONAL');
  });

  it('high trust + high familiarity + low tension → WARM', () => {
    const s = state({
      axes: {
        trust: t.warmTrustMin,
        familiarity: t.warmFamiliarityMin,
        tension: t.warmTensionMax - 1,
      },
    });
    expect(derivePosture(s)).toBe('WARM');
  });

  it('low trust + low familiarity → DISTANT', () => {
    const s = state({ axes: { trust: 5, familiarity: 5 } });
    expect(derivePosture(s)).toBe('DISTANT');
  });

  it('earned vulnerability (trust+familiarity, raised tension) → GUARDED', () => {
    const s = state({
      axes: {
        trust: t.vulnerableTrustMin,
        familiarity: t.vulnerableFamiliarityMin,
        tension: t.vulnerableTensionMin,
      },
    });
    expect(derivePosture(s)).toBe('GUARDED');
  });

  it('default → CURIOUS', () => {
    const s = state({ axes: { trust: 25, familiarity: 25, tension: 20 } });
    expect(derivePosture(s)).toBe('CURIOUS');
  });

  it('null state → DISTANT (STRANGER baseline)', () => {
    expect(derivePosture(null)).toBe('DISTANT');
  });
});
