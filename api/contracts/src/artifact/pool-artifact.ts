// api/contracts/src/artifact/pool-artifact.ts
// SC-M3 T1: payloads of the two pool artifact kinds, their canonical bytes and identity.
//
//   personality_pool  name = pool slug. The bytes ARE `stringifyPersonalityPool`, so the artifact id
//                     equals the pool's planning `content_hash`: one identity per pool (D3).
//   character_pools   name = character slug. Which ACTIVE pools a character uses. Kept out of the
//                     pool bytes on purpose: a pool carries no character data (POOL_FIELD_UNKNOWN),
//                     and linking one more character must not change the pool's id.
//
// A character with no active pools has NO character_pools artifact (absence = no pools), so a
// payload with an empty `pools` list is invalid. Pure data and pure functions.

import { personalityPoolFromJSON, stringifyPersonalityPool, type PersonalityPool } from '../dialogue/personality-pool.js';
import { isValidSlug } from '../scene/slug.js';
import { createArtifactId, type ArtifactId } from './artifact.js';
import { sha256Hex } from './scene-artifact.js';

export const CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION = 1 as const;

export interface CharacterPoolsArtifactPayload {
  character_slug: string;
  /** Active pool slugs the character uses. Non-empty. Canonical form: sorted, unique. */
  pools: string[];
}

export class InvalidPoolArtifactError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid pool artifact: ${problems.join('; ')}`);
    this.name = 'InvalidPoolArtifactError';
    this.problems = problems;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Canonical bytes of a pool artifact: identical to the planning pool bytes. */
export function stringifyPersonalityPoolArtifact(pool: PersonalityPool): string {
  return stringifyPersonalityPool(pool);
}

/** Artifact id of a pool: sha256 hex of its canonical bytes (== planning `content_hash`). */
export function personalityPoolArtifactContentHash(pool: PersonalityPool): ArtifactId {
  return createArtifactId(sha256Hex(stringifyPersonalityPoolArtifact(pool)));
}

/**
 * Strict parse of stored pool artifact bytes.
 *
 * @throws InvalidPoolArtifactError when the bytes are not JSON or not a valid pool
 */
export function personalityPoolArtifactFromBytes(bytes: string): PersonalityPool {
  let value: unknown;
  try {
    value = JSON.parse(bytes);
  } catch {
    throw new InvalidPoolArtifactError(['bytes are not valid JSON']);
  }
  try {
    return personalityPoolFromJSON(value);
  } catch (err) {
    throw new InvalidPoolArtifactError([(err as Error).message]);
  }
}

function checkLink(payload: CharacterPoolsArtifactPayload): string[] {
  const problems: string[] = [];
  if (!isValidSlug(payload.character_slug)) problems.push(`character_slug '${String(payload.character_slug)}' is not a valid slug`);
  if (!Array.isArray(payload.pools) || payload.pools.length === 0) {
    problems.push('pools must be a non-empty array (no active pools = no artifact)');
  } else {
    payload.pools.forEach((p, i) => {
      if (!isValidSlug(p)) problems.push(`pools[${i}] '${String(p)}' is not a valid slug`);
    });
  }
  return problems;
}

/** Canonical JSON form: pool slugs sorted and de-duplicated, keys sorted, version stamped. */
export function characterPoolsArtifactToJSON(payload: CharacterPoolsArtifactPayload): Record<string, unknown> {
  const problems = checkLink(payload);
  if (problems.length > 0) throw new InvalidPoolArtifactError(problems);
  return {
    character_slug: payload.character_slug,
    pools: [...new Set(payload.pools)].sort(),
    schema_version: CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION,
  };
}

export function stringifyCharacterPoolsArtifact(payload: CharacterPoolsArtifactPayload): string {
  return JSON.stringify(characterPoolsArtifactToJSON(payload));
}

export function characterPoolsArtifactContentHash(payload: CharacterPoolsArtifactPayload): ArtifactId {
  return createArtifactId(sha256Hex(stringifyCharacterPoolsArtifact(payload)));
}

/**
 * Strict parse of stored character_pools bytes. Stored bytes must already be canonical (pools
 * sorted and unique), so a hand-edited row cannot smuggle in a second spelling of one link.
 *
 * @throws InvalidPoolArtifactError listing every problem found
 */
export function characterPoolsArtifactFromBytes(bytes: string): CharacterPoolsArtifactPayload {
  let value: unknown;
  try {
    value = JSON.parse(bytes);
  } catch {
    throw new InvalidPoolArtifactError(['bytes are not valid JSON']);
  }
  if (!isPlainObject(value)) throw new InvalidPoolArtifactError(['payload must be an object']);
  const problems: string[] = [];
  for (const k of Object.keys(value)) {
    if (!['character_slug', 'pools', 'schema_version'].includes(k)) problems.push(`unknown field '${k}'`);
  }
  for (const k of ['character_slug', 'pools', 'schema_version']) {
    if (value[k] === undefined) problems.push(`'${k}' is required`);
  }
  if (value.schema_version !== undefined && value.schema_version !== CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION) {
    problems.push(`schema_version must be ${CHARACTER_POOLS_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (problems.length > 0) throw new InvalidPoolArtifactError(problems);
  const payload = { character_slug: value.character_slug as string, pools: value.pools as string[] };
  problems.push(...checkLink(payload));
  if (problems.length === 0) {
    const canonical = [...new Set(payload.pools)].sort();
    if (JSON.stringify(canonical) !== JSON.stringify(payload.pools)) problems.push('pools must be sorted and unique');
  }
  if (problems.length > 0) throw new InvalidPoolArtifactError(problems);
  return { character_slug: payload.character_slug, pools: [...payload.pools] };
}
