// api/contracts/src/artifact/reader.ts
// SC-M3 T2: the READ side of artifact storage, the only part of it runtime may depend on.
//
// Planning's `ArtifactStore` (write + read, in api/planning) is not importable from runtime, so the
// read contract lives here. `StoredArtifact` is structurally identical to planning's
// `ArtifactRecord`, so a planning store satisfies `ArtifactReader` without an adapter.

import type { Artifact, ArtifactId } from './artifact.js';

/** An artifact's metadata plus its canonical payload bytes (UTF-8 JSON text), exactly as stored. */
export interface StoredArtifact {
  artifact: Artifact;
  payload: string;
}

/** Read-only access to compiled artifacts by content id. Runtime holds SELECT on this data and nothing else. */
export interface ArtifactReader {
  /** The stored artifact, or undefined when no artifact has that id. */
  get(id: ArtifactId): Promise<StoredArtifact | undefined>;
}
