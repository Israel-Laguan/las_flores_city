// SC-M3 T2: fixture helper for runtime tests (runtime may not import planning's record builders).

import { sha256Hex, type ArtifactType, type StoredArtifact } from '@las-flores/api-contracts';

export const stored = (type: ArtifactType, name: string, payload: string): StoredArtifact => {
  const id = sha256Hex(payload);
  return {
    artifact: { artifact_id: id, artifact_type: type, content_hash: id, manifest_version: 1, name, created_at: '2026-10-10T00:00:00.000Z', size_bytes: Buffer.byteLength(payload), dependencies: [] },
    payload,
  };
};
