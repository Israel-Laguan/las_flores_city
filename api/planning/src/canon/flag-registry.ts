// api/planning/src/canon/flag-registry.ts
// SC-202: Flag registry repository in planning/canon
// Repository supports create, read, list, retire (never delete).
// Unique constraint on slug (DB-level, enforced by PRIMARY KEY).

import type {
  FlagDefinition,
  FlagSemantics,
} from '@las-flores/api-contracts';
import { validateFlagSlug } from '@las-flores/api-contracts';

/**
 * Input for creating a new flag definition.
 */
export interface CreateFlagInput {
  slug: string;
  meaning: string;
  semantics: FlagSemantics;
}

/**
 * Output when a flag is created or retrieved.
 */
export interface FlagDefinitionWithMetadata extends FlagDefinition {
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of a retire operation.
 */
export interface RetireResult {
  success: boolean;
  retiredSlug?: string;
  error?: string;
}

/**
 * Repository for flag definitions (`planning.flag_definitions`).
 * Implemented by InMemoryFlagRegistry here and PgFlagRegistry in server/src/planning.
 * Only the planning module has access to this repository.
 */
export interface FlagRegistry {
  /**
   * Create a new flag definition.
   * Throws if a flag with the same slug already exists (DB PRIMARY KEY violation).
   * Validates the slug format before attempting DB write.
   */
  create(input: CreateFlagInput): Promise<FlagDefinitionWithMetadata>;

  /**
   * Get a flag definition by slug.
   * Returns undefined if not found.
   */
  get(slug: string): Promise<FlagDefinitionWithMetadata | undefined>;

  /**
   * List all flag definitions.
   * Ordered by createdAt ascending (oldest first).
   */
  list(): Promise<FlagDefinitionWithMetadata[]>;

  /**
   * List flag definitions by semantics.
   * Returns only flags with the specified semantics.
   */
  listBySemantics(semantics: FlagSemantics): Promise<FlagDefinitionWithMetadata[]>;

  /**
   * Retire a flag definition.
   * Does NOT delete the row (soft delete for audit trail).
   * In practice, retirement is achieved by: (1) removing from active use,
   * (2) preventing new content from referencing it.
   * 
   * Retirement is recorded (`retired_at` in `planning.flag_definitions`) and the
   * flag stops appearing in `exists`, `getAllSlugs` and `listBySemantics`;
   * `get` and `list` still return it for the audit trail. Retiring twice, or an
   * unknown slug, returns `success: false` with an `error`.
   *
   * Note: The SC-202 spec says "never delete" - so we mark as retired.
   */
  retire(slug: string): Promise<RetireResult>;

  /**
   * Check if a flag with the given slug exists.
   */
  exists(slug: string): Promise<boolean>;

  /**
   * Get all flag slugs.
   * Useful for validation and dependency analysis.
   */
  getAllSlugs(): Promise<string[]>;
}

/**
 * Defensive copy of a stored flag definition.
 *
 * The registry owns the object held in its map. Returning it by reference let a
 * caller edit a `create()` or `get()` result and silently mutate stored registry
 * state — every later read then saw the edited definition. Copies are required
 * for this in-memory implementation to behave like a real repository, where a
 * fetched row is likewise the caller's own object.
 */
function copyFlag(
  flag: FlagDefinitionWithMetadata,
): FlagDefinitionWithMetadata {
  return { ...flag };
}

/**
 * In-memory implementation for testing purposes.
 * Useful for unit tests that don't require a real database.
 */
export class InMemoryFlagRegistry implements FlagRegistry {
  private flags: Map<string, FlagDefinitionWithMetadata> = new Map();
  private retired = new Set<string>();

  async create(input: CreateFlagInput): Promise<FlagDefinitionWithMetadata> {
    // The registry contract says create validates the slug format; without this
    // the in-memory implementation accepted slugs production must reject, so
    // tests could pass on a definition the DB trigger would refuse.
    validateFlagSlug(input.slug);

    const now = new Date().toISOString();
    const flag: FlagDefinitionWithMetadata = {
      slug: input.slug,
      meaning: input.meaning,
      semantics: input.semantics,
      createdAt: now,
      updatedAt: now,
    };

    if (this.flags.has(input.slug)) {
      throw new Error(`Flag with slug '${input.slug}' already exists`);
    }

    this.flags.set(input.slug, flag);
    return copyFlag(flag);
  }

  async get(slug: string): Promise<FlagDefinitionWithMetadata | undefined> {
    const flag = this.flags.get(slug);
    return flag ? copyFlag(flag) : undefined;
  }

  /**
   * All flags, retired included (retire never deletes — the row is kept for audit).
   */
  async list(): Promise<FlagDefinitionWithMetadata[]> {
    return Array.from(this.flags.values())
      .map(copyFlag)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Active (non-retired) flags with the given semantics.
   */
  async listBySemantics(
    semantics: FlagSemantics,
  ): Promise<FlagDefinitionWithMetadata[]> {
    return Array.from(this.flags.values())
      .filter((f) => f.semantics === semantics && !this.retired.has(f.slug))
      .map(copyFlag)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async retire(slug: string): Promise<RetireResult> {
    if (!this.flags.has(slug)) {
      return { success: false, error: `Flag '${slug}' not found` };
    }
    if (this.retired.has(slug)) {
      return { success: false, retiredSlug: slug, error: `Flag '${slug}' is already retired` };
    }
    this.retired.add(slug);
    return { success: true, retiredSlug: slug };
  }

  /**
   * True only for flags that exist AND are not retired — a retired flag is no
   * longer referenceable by new content, so `exists` must not vouch for it.
   */
  async exists(slug: string): Promise<boolean> {
    return this.flags.has(slug) && !this.retired.has(slug);
  }

  /**
   * Active slugs only. validateFlagReferences feeds off this list, so a
   * retired flag must disappear from it or new content would keep validating
   * against a retired canon entry.
   */
  async getAllSlugs(): Promise<string[]> {
    return Array.from(this.flags.keys())
      .filter((slug) => !this.retired.has(slug))
      .sort();
  }

  /**
   * Slugs that have been retired (audit trail).
   */
  async listRetiredSlugs(): Promise<string[]> {
    return Array.from(this.retired).sort();
  }

  /**
   * Clear all flags (for test cleanup).
   */
  clear(): void {
    this.flags.clear();
    this.retired.clear();
  }
}

/**
 * Factory function to create a flag registry.
 *
 * `api/planning` has no database access, so the DB-backed registry lives in
 * `server/src/planning/PgFlagRegistry.ts` and is passed in here. The caller must
 * name the backing explicitly — `'memory'` for tests, or a concrete
 * `FlagRegistry` — so the factory can never hand back a registry whose methods
 * throw.
 */
export function createFlagRegistry(backing: 'memory' | FlagRegistry): FlagRegistry {
  return backing === 'memory' ? new InMemoryFlagRegistry() : backing;
}

// Re-export types from contracts
export type { FlagSemantics };
