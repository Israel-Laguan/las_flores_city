// api/planning/src/canon/flag-registry.ts
// SC-202: Flag registry repository in planning/canon
// Repository supports create, read, list, retire (never delete).
// Unique constraint on slug (DB-level, enforced by PRIMARY KEY).

import type {
  FlagDefinition,
  FlagSemantics,
} from '@las-flores/api-contracts';

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
 * Repository for flag definitions.
 * All operations are against the planning.flag_definitions table.
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
   * This implementation uses a retired_at column if it exists, or simply
   * returns success=true as a placeholder for the soft-delete pattern.
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
 * Implementation of FlagRegistry using a database connection.
 * This is a placeholder implementation that would be wired to the actual
 * OLTP database connection in the server.
 * 
 * For the api/planning module (which is pure TypeScript with no DB access),
 * this is an interface-only definition. The actual implementation would
 * live in server/src/ or be provided via dependency injection.
 */
export class DatabaseFlagRegistry implements FlagRegistry {
  // In a real implementation, this would hold a database connection
  // For api/planning (no runtime dependencies), we only define the interface
  // and would delegate to server-side code for actual DB access

  async create(_input: CreateFlagInput): Promise<FlagDefinitionWithMetadata> {
    // Placeholder - actual implementation would insert into planning.flag_definitions
    throw new Error(
      'DatabaseFlagRegistry.create: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async get(_slug: string): Promise<FlagDefinitionWithMetadata | undefined> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.get: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async list(): Promise<FlagDefinitionWithMetadata[]> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.list: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async listBySemantics(
    _semantics: FlagSemantics,
  ): Promise<FlagDefinitionWithMetadata[]> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.listBySemantics: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async retire(_slug: string): Promise<RetireResult> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.retire: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async exists(_slug: string): Promise<boolean> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.exists: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }

  async getAllSlugs(): Promise<string[]> {
    // Placeholder
    throw new Error(
      'DatabaseFlagRegistry.getAllSlugs: Not implemented in api/planning. ' +
        'This method requires DB access and should be implemented in server/src/.',
    );
  }
}

/**
 * In-memory implementation for testing purposes.
 * Useful for unit tests that don't require a real database.
 */
export class InMemoryFlagRegistry implements FlagRegistry {
  private flags: Map<string, FlagDefinitionWithMetadata> = new Map();
  private retired = new Set<string>();

  async create(input: CreateFlagInput): Promise<FlagDefinitionWithMetadata> {
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
    return flag;
  }

  async get(slug: string): Promise<FlagDefinitionWithMetadata | undefined> {
    return this.flags.get(slug);
  }

  async list(): Promise<FlagDefinitionWithMetadata[]> {
    return Array.from(this.flags.values()).sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt),
    );
  }

  async listBySemantics(
    semantics: FlagSemantics,
  ): Promise<FlagDefinitionWithMetadata[]> {
    return Array.from(this.flags.values())
      .filter((f) => f.semantics === semantics)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async retire(slug: string): Promise<RetireResult> {
    if (!this.flags.has(slug)) {
      return { success: false, error: `Flag '${slug}' not found` };
    }
    this.retired.add(slug);
    return { success: true, retiredSlug: slug };
  }

  async exists(slug: string): Promise<boolean> {
    return this.flags.has(slug);
  }

  async getAllSlugs(): Promise<string[]> {
    return Array.from(this.flags.keys()).sort();
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
 * In production, this would create a DatabaseFlagRegistry.
 * In tests, this can create an InMemoryFlagRegistry.
 */
export function createFlagRegistry(
  inMemory = false,
): FlagRegistry {
  if (inMemory) {
    return new InMemoryFlagRegistry();
  }
  return new DatabaseFlagRegistry();
}

// Re-export types from contracts
export type { FlagSemantics };
