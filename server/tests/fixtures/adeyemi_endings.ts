// Shared Adeyemi ending thresholds — single source of truth for tests.
//
// These values MUST match `metadata.relationship_endings` in
// `content/characters/adeyemi_ogunbiyi/char_adeyemi_ogunbiyi.yaml`
// and the `required_stats` gates in
// `content/dialogues/adeyemi_relationship/dialogue_adeyemi_act5_resolution.yaml`.
// If you change one, change all three.
//
// Kept as a hand-maintained fixture (not loaded from YAML at test time)
// because unit tests mock Redis/DB and should not introduce a YAML parser
// dependency just to read static thresholds.

export const ADEYEMI_ENDINGS = {
  friend: {
    required_stats: {
      adeyemi_trust: 'gte:70',
      adeyemi_familiarity: 'gte:75',
      adeyemi_alignment: 'gte:65',
      adeyemi_tension: 'lte:40',
    },
  },
  lover: {
    required_stats: {
      adeyemi_trust: 'gte:75',
      adeyemi_familiarity: 'gte:80',
      adeyemi_alignment: 'gte:60',
      adeyemi_tension: 'gte:30',
    },
  },
  the_mirror: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:65',
      adeyemi_alignment: 'gte:40',
      adeyemi_tension: 'gte:50',
    },
  },
  reluctant_ally: {
    required_stats: {
      adeyemi_trust: 'gte:50',
    },
  },
  failed_friend: {
    required_stats: {
      adeyemi_trust: 'gte:40',
      adeyemi_familiarity: 'gte:60',
      adeyemi_tension: 'gte:50',
    },
  },
  failed_lover: {
    required_stats: {
      adeyemi_trust: 'gte:60',
      adeyemi_familiarity: 'gte:70',
      adeyemi_tension: 'gte:65',
    },
  },
  always_distant: {
    required_stats: {
      adeyemi_trust: 'lte:50',
      adeyemi_familiarity: 'lte:50',
    },
  },
  opponent: {
    required_stats: {
      adeyemi_alignment: 'lte:30',
      adeyemi_tension: 'gte:70',
    },
  },
} as const;

export type EndingName = keyof typeof ADEYEMI_ENDINGS;
