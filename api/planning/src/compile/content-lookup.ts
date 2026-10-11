// api/planning/src/compile/content-lookup.ts
// SC-405: the compile step's window onto content that lives OUTSIDE planning canon
// (legacy `scenes` locations + `districts`, `characters`, dialogue trees). A port, so
// api/planning stays DB-free: the Postgres implementation lives in server/src/planning.
//
// Set-based on purpose: compile gathers every id it needs across all scenes and asks once
// per kind, so a compile of N scenes costs a constant number of lookups, not N.

import type { WeatherTag } from '@las-flores/api-contracts';

export interface LocationInfo {
  /** `districts.weather` of the location's district (A6: snapshotted into the artifact). */
  districtWeather: WeatherTag;
}

export interface ContentLookup {
  /** Present key = the location row exists. */
  locations(ids: readonly string[]): Promise<ReadonlyMap<string, LocationInfo>>;
  /** The subset of `slugs` that name an existing character. */
  characters(slugs: readonly string[]): Promise<ReadonlySet<string>>;
  /**
   * The subset of `slugs` that name an existing dialogue. OPTIONAL: a backend with no
   * dialogue slug identity omits it, and compile reports COMPILE_DIALOGUE_REFS_UNVERIFIED
   * instead of passing the refs unchecked.
   */
  dialogues?(slugs: readonly string[]): Promise<ReadonlySet<string>>;
}

/** Fixed-content implementation for unit tests. */
export class InMemoryContentLookup implements ContentLookup {
  constructor(
    private readonly data: {
      locations?: Record<string, LocationInfo>;
      characters?: readonly string[];
      /** Omit to model a backend that cannot resolve dialogue slugs. */
      dialogues?: readonly string[];
    },
  ) {
    if (data.dialogues !== undefined) {
      const known = new Set(data.dialogues);
      this.dialogues = async (slugs) => new Set(slugs.filter((s) => known.has(s)));
    }
  }

  dialogues?: (slugs: readonly string[]) => Promise<ReadonlySet<string>>;

  async locations(ids: readonly string[]): Promise<ReadonlyMap<string, LocationInfo>> {
    const known = this.data.locations ?? {};
    return new Map(ids.filter((id) => id in known).map((id) => [id, known[id]]));
  }

  async characters(slugs: readonly string[]): Promise<ReadonlySet<string>> {
    return new Set(slugs.filter((s) => (this.data.characters ?? []).includes(s)));
  }
}
