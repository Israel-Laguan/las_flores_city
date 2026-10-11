// api/planning/src/compile/compile-pools.ts
// SC-M3 T1: compile personality pools (and which characters use them) into content-addressed
// artifacts, so runtime can serve pool lines from a revision instead of reading planning canon.
// DB-free: every dependency is a port. Nothing here writes; publishing the returned records
// (together with the scene records, in ONE publish) is the caller's step.
//
//   personality_pool  one per ACTIVE pool, name = pool slug, id = the pool's content hash
//   character_pools   one per character that uses >= 1 active pool, name = character slug
//
// All-or-nothing, like compileScenes: a link to a character that does not exist (R10, the same
// content check scene casts get) fails the compile and returns no records. Retired pools are not
// compiled and drop out of every character's link, matching `CharacterPoolRepository.poolsFor`.

import {
  stringifyCharacterPoolsArtifact,
  stringifyPersonalityPoolArtifact,
  type ValidationIssue,
} from '@las-flores/api-contracts';
import type { CharacterPoolRepository, PersonalityPoolRepository } from '../canon/personality-pool-repository.js';
import { buildArtifactRecord, type ArtifactRecord } from './artifact-store.js';
import type { ContentLookup } from './content-lookup.js';

export const POOL_COMPILE_ISSUE_CODES = {
  /** A pool is linked to a character slug that names no character (R10: required content). */
  COMPILE_POOL_CHARACTER_MISSING: 'COMPILE_POOL_CHARACTER_MISSING',
} as const;

export interface CompilePoolsDeps {
  pools: PersonalityPoolRepository;
  links: CharacterPoolRepository;
  content: Pick<ContentLookup, 'characters'>;
  /** Clock for artifact metadata only (never part of the hash). Default: real time. */
  now?: () => Date;
}

export interface CompilePoolsOptions {
  /**
   * Pools to compile. Default: every active pool. A subset is for tests and tooling: character
   * links are then computed from the chosen pools only, so a real revision compiles them all.
   */
  slugs?: readonly string[];
}

export interface CompilePoolsResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Sorted by (artifact_type, name). EMPTY unless `ok`. */
  records: ArtifactRecord[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Compiles pools and character-pool links into artifact records.
 *
 * @param deps - Pool + link repositories, the character lookup port and an optional clock
 * @param options - Which pools to compile (default: all active)
 * @returns `ok`, every issue found, and the records (only when `ok`)
 */
export async function compilePools(deps: CompilePoolsDeps, options: CompilePoolsOptions = {}): Promise<CompilePoolsResult> {
  const wanted = options.slugs === undefined ? undefined : new Set(options.slugs);
  const active = (await deps.pools.list()).filter((r) => wanted === undefined || wanted.has(r.slug));

  const poolsByCharacter = new Map<string, string[]>();
  for (const record of active) {
    for (const character of await deps.links.charactersFor(record.slug)) {
      const list = poolsByCharacter.get(character) ?? [];
      list.push(record.slug);
      poolsByCharacter.set(character, list);
    }
  }

  const characters = [...poolsByCharacter.keys()].sort();
  const known = characters.length > 0 ? await deps.content.characters(characters) : new Set<string>();
  const issues: ValidationIssue[] = characters
    .filter((c) => !known.has(c))
    .map((c) => ({
      code: POOL_COMPILE_ISSUE_CODES.COMPILE_POOL_CHARACTER_MISSING,
      path: `character:${c}`,
      message: `character '${c}' (linked to pool ${poolsByCharacter.get(c)!.map((p) => `'${p}'`).join(', ')}) does not exist`,
      severity: 'error' as const,
    }));
  if (issues.length > 0) return { ok: false, issues, records: [] };

  const createdAt = (deps.now ?? (() => new Date()))().toISOString();
  const records: ArtifactRecord[] = [
    ...active.map((r) => buildArtifactRecord('personality_pool', r.slug, stringifyPersonalityPoolArtifact(r.pool), createdAt)),
    ...characters.map((c) =>
      buildArtifactRecord('character_pools', c, stringifyCharacterPoolsArtifact({ character_slug: c, pools: poolsByCharacter.get(c)! }), createdAt),
    ),
  ].sort((a, b) => cmp(a.artifact.artifact_type, b.artifact.artifact_type) || cmp(a.artifact.name, b.artifact.name));
  return { ok: true, issues: [], records };
}
