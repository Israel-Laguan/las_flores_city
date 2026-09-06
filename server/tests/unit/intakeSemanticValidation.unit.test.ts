import { describe, it, expect } from '@jest/globals';
import { GraphDeltaSchema, type GraphDelta } from '@las-flores/shared';
import {
  EntityResolutionService,
  floorSimilarity,
  similarity,
  MATCH_THRESHOLD,
  type CanonicalCandidate,
} from '../../src/services/EntityResolutionService.js';
import {
  semanticConcernNotes,
  inputGroundingOverlap,
  substantiveTokens,
  isMockProviderConfigured,
  LOW_FLOOR_SIMILARITY,
} from '../../src/services/IntakeSemanticValidator.js';

// A stub CandidateSource so these are pure unit tests with no Neo4j/Redis.
const stubSource = (candidates: CanonicalCandidate[]) => ({
  listCandidates: async () => candidates,
});

const makeDelta = (
  name: string,
  description: string,
  op: 'ADD' | 'MODIFY' = 'ADD',
): GraphDelta =>
  GraphDeltaSchema.parse({
    id: 'd32000ff-0000-4000-8000-0000000000ff',
    planId: '00000000-0000-0000-0000-000000000000',
    nodeType: 'Character',
    nodeId: 'vendor_npc',
    op,
    fields: { name, description },
    createdAt: new Date().toISOString(),
  });

describe('IntakeSemanticValidator — substantiveTokens / grounding', () => {
  it('strips stopwords, short tokens, punctuation and folds accents', () => {
    const toks = substantiveTokens('The boy band fixer, María, sells néon chips.');
    expect(toks).toEqual(new Set(['band', 'fixer', 'maria', 'sells', 'neon', 'chips']));
  });

  it('returns empty for empty/whitespace input', () => {
    expect(substantiveTokens('   ').size).toBe(0);
  });

  it('grounding overlap is true on a shared substantive token', () => {
    const description = 'Introduce a fixer named Camila who runs markets in Las Flores.';
    const deltas = [makeDelta('Camila Reyes', 'A fixer who runs neon markets in Las Flores.')];
    expect(inputGroundingOverlap(description, deltas)).toBe(true);
  });

  it('grounding overlap is false when no substantive token is shared', () => {
    const description = 'A small city at sunset. Motorcycles. Rain. Cheap superhero shirts.';
    const deltas = [makeDelta('Diego el Mock', 'A deterministic mock proposal to add a new character.')];
    expect(inputGroundingOverlap(description, deltas)).toBe(false);
  });

  it('grounding overlap is false when the description is empty', () => {
    expect(inputGroundingOverlap('', [makeDelta('Someone', 'something')])).toBe(false);
  });
});

describe('IntakeSemanticValidator — floor vs boosted similarity', () => {
  it('floorSimilarity excludes the substring boost that similarity() applies', () => {
    // Canon "Diego" is a substring of proposed "Diego el Mock" — similarity()
    // boosts this to 0.9 (a strong canonical match), but floorSimilarity() must
    // NOT, so the plan-level "no match anywhere" probe is not fooled by a
    // one-token canon name living inside a longer proposed name.
    const proposed = 'Diego el Mock';
    const canon = 'Diego';
    expect(floorSimilarity(proposed, canon)).toBeLessThan(LOW_FLOOR_SIMILARITY);
    expect(floorSimilarity(proposed, canon)).toBeLessThan(MATCH_THRESHOLD);
    expect(similarity(proposed, canon)).toBeGreaterThanOrEqual(0.9);
  });

  it('is identical for equal strings', () => {
    expect(floorSimilarity('Camila Reyes', 'Camila Reyes')).toBe(1);
    expect(similarity('Camila Reyes', 'Camila Reyes')).toBe(1);
  });
});

describe('EntityResolutionService — whole-canon entity name matching', () => {
  const canon: CanonicalCandidate[] = [
    { nodeType: 'Character', nodeId: 'c1', name: 'Camila Reyes' },
    { nodeType: 'Character', nodeId: 'c2', name: 'Diego López', aliasNames: ['Diego'] },
  ];
  const service = new EntityResolutionService(stubSource(canon) as never);

  it('matches an exact name at/above the threshold', async () => {
    const m = await service.matchEntityName('Camila Reyes', 'Character');
    expect(m).not.toBeNull();
    expect(m!.candidate.nodeId).toBe('c1');
    expect(m!.confidence).toBe(1);
  });

  it('matches via a curated alias', async () => {
    const m = await service.matchEntityName('Diego', 'Character');
    expect(m).not.toBeNull();
    expect(m!.candidate.nodeId).toBe('c2');
  });

  it('returns null when no candidate clears the threshold', async () => {
    const m = await service.matchEntityName('Zara the Unknown', 'Character');
    expect(m).toBeNull();
  });

  it('filters by nodeType', async () => {
    const m = await service.matchEntityName('Camila Reyes', 'Scene');
    expect(m).toBeNull();
  });

  it('maxNameSimilarity returns the highest floor score', async () => {
    expect(await service.maxNameSimilarity('Diego', 'Character')).toBe(1);
    expect(await service.maxNameSimilarity('Zara the Unknown', 'Character')).toBeLessThan(LOW_FLOOR_SIMILARITY);
  });
});

describe('semanticConcernNotes — concern construction', () => {
  it('emits a duplicate_entity note (warning) on an ADD matching canon', async () => {
    const matcher = {
      matchEntityName: async () => ({ candidate: { nodeType: 'Character', nodeId: 'canon-1', name: 'Camila Reyes', aliasNames: [] }, confidence: 0.9 }),
      maxNameSimilarity: async () => 0,
    };
    const notes = await semanticConcernNotes({
      description: 'Add Camila Reyes.', deltas: [makeDelta('Camila Reyes', 'fixer')],
      matcher, isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'duplicate_entity')).toHaveLength(1);
    expect(notes[0].severity).toBe('warning');
    expect(notes[0].reason).toContain('consider MODIFY instead of ADD');
    expect(notes[0].field).toBe('name');
  });

  it('does not flag MODIFY deltas as duplicates', async () => {
    const matcher = {
      matchEntityName: async () => ({ candidate: { nodeType: 'Character', nodeId: 'canon-1', name: 'Camila Reyes', aliasNames: [] }, confidence: 0.9 }),
      maxNameSimilarity: async () => 0.9,
    };
    const notes = await semanticConcernNotes({
      description: 'Edit Camila Reyes.', deltas: [makeDelta('Camila Reyes', 'fixer', 'MODIFY')],
      matcher, isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'duplicate_entity')).toHaveLength(0);
    // MODIFY deltas never go through name-matching, so the matcher stub above
    // is never actually called here — anyCanonMatch is true because a
    // surviving MODIFY targets real canon by construction (see the next test).
    expect(notes.filter((n) => n.kind === 'ungrounded_plan')).toHaveLength(0);
  });

  it('a MODIFY-only plan with no input-grounding overlap is NOT flagged as a mismatch', async () => {
    // Regression: a plan that only edits an existing entity is proof-of-canon-
    // membership on its own — it must never be flagged as "may not belong to
    // this content graph", even when the edited field(s) share no vocabulary
    // with the input description. The matcher is never expected to be
    // consulted for a MODIFY delta, so it throws if it ever is.
    const matcher = {
      matchEntityName: async () => { throw new Error('must not be called for a MODIFY delta'); },
      maxNameSimilarity: async () => { throw new Error('must not be called for a MODIFY delta'); },
    };
    const modifyDelta = makeDelta('Mercado Popular Las Flores', 'mood: tense', 'MODIFY');
    const notes = await semanticConcernNotes({
      // Deliberately disjoint vocabulary from the delta's own fields.
      description: 'Make the ambush scene feel tenser.',
      deltas: [modifyDelta],
      matcher,
      isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'ungrounded_plan')).toHaveLength(0);
    expect(notes.filter((n) => n.kind === 'duplicate_entity')).toHaveLength(0);
  });

  it('emits exactly one plan-level concern when canon + grounding are both empty', async () => {
    const matcher = { matchEntityName: async () => null, maxNameSimilarity: async () => 0 };
    const notes = await semanticConcernNotes({
      description: 'A south american superhero origin story.',
      deltas: [makeDelta('Diego el Mock', 'A deterministic mock proposal.')],
      matcher, isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'ungrounded_plan')).toHaveLength(1);
    expect(notes[0].severity).toBe('warning');
  });

  it('does NOT emit the plan-level concern when the input is grounded', async () => {
    const matcher = { matchEntityName: async () => null, maxNameSimilarity: async () => 0 };
    const notes = await semanticConcernNotes({
      description: 'Add the fixer Camila Reyes, who moves contraband through the neon markets.',
      deltas: [makeDelta('Camila Reyes', 'A fixer who moves contraband through neon markets.')],
      matcher, isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'ungrounded_plan')).toHaveLength(0);
  });

  it('suppresses the plan-level concern when the canon source is unavailable', async () => {
    const matcher = {
      matchEntityName: async () => { throw new Error('neo4j down'); },
      maxNameSimilarity: async () => { throw new Error('neo4j down'); },
    };
    const notes = await semanticConcernNotes({
      description: 'A south american superhero origin story.',
      deltas: [makeDelta('Diego el Mock', 'A deterministic mock proposal.')],
      matcher, isMockProvider: false,
    });
    expect(notes.filter((n) => n.kind === 'ungrounded_plan')).toHaveLength(0);
  });

  it('always emits the mock-provider transparency note when isMockProvider', async () => {
    const matcher = { matchEntityName: async () => null, maxNameSimilarity: async () => 0 };
    const notes = await semanticConcernNotes({
      description: 'off-universe text', deltas: [makeDelta('Diego el Mock', 'mock')],
      matcher, isMockProvider: true,
    });
    const mockNote = notes.find((n) => n.kind === 'mock_provider');
    expect(mockNote).toBeDefined();
    expect(mockNote!.severity).toBe('info');
  });

  it('never emits the mock-provider note for a real provider', async () => {
    const matcher = { matchEntityName: async () => null, maxNameSimilarity: async () => 0 };
    const notes = await semanticConcernNotes({
      description: 'off-universe text', deltas: [makeDelta('Diego el Mock', 'mock')],
      matcher, isMockProvider: false,
    });
    expect(notes.find((n) => n.kind === 'mock_provider')).toBeUndefined();
  });

  it('respects the LLM_PROVIDER env var', () => {
    const before = process.env.LLM_PROVIDER;
    try {
      process.env.LLM_PROVIDER = 'mock';
      expect(isMockProviderConfigured()).toBe(true);
      process.env.LLM_PROVIDER = 'litellm';
      expect(isMockProviderConfigured()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = before;
    }
  });
});
