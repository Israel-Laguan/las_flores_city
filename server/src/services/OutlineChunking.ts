export interface EntityCandidate {
  name: string;
  type: string;
  description: string;
}

/**
 * Split a long description into chunks that fit within maxChars.
 * Strategy: split by headings first, then by paragraph boundaries for
 * sections that still exceed the limit.
 */
export function chunkDescription(description: string, maxChars: number): string[] {
  if (description.length <= maxChars) return [description];

  // Split by heading lines (## or ###)
  const sections: string[] = [];
  let current = '';
  for (const line of description.split('\n')) {
    if (/^#{1,3}\s+/.test(line) && current.trim()) {
      sections.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) sections.push(current.trim());

  // Further split oversized sections by double-newline (paragraphs)
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= maxChars) {
      chunks.push(section);
      continue;
    }
    const paragraphs = section.split(/\n{2,}/);
    let buffer = '';
    for (const para of paragraphs) {
      if (buffer.length + para.length + 2 > maxChars && buffer.trim()) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      if (para.length > maxChars) {
        for (let i = 0; i < para.length; i += maxChars) {
          chunks.push(para.slice(i, i + maxChars));
        }
      } else {
        buffer += para + '\n\n';
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
  }

  return chunks.length > 0 ? chunks : [description.slice(0, maxChars)];
}

/**
 * Normalize a name for deduplication: lowercase, strip separators (keep Unicode letters/numbers).
 */
export function normalizeName(name: string): string {
  return String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Merge entity candidates from multiple chunks, deduplicating by
 * normalized name + type. Longer descriptions win on merge.
 */
export function mergeCandidates(allCandidates: EntityCandidate[]): EntityCandidate[] {
  const seen = new Map<string, EntityCandidate>();

  for (const candidate of allCandidates) {
    const key = `${normalizeName(candidate.name)}:${String(candidate.type || '')}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
    } else if ((candidate.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      seen.set(key, candidate);
    }
  }

  return Array.from(seen.values());
}

/**
 * Build a condensed synopsis from merged candidates + original description.
 * Gives the outline LLM a compact but complete picture of what to plan.
 */
export function buildSynopsisFromCandidates(
  candidates: EntityCandidate[],
  originalDescription: string,
  options: { maxItems?: number } = {},
): string {
  const { maxItems } = options;
  // Truncate original description to keep the synopsis manageable
  const maxDescLen = 2000;
  const descSnippet = originalDescription.length > maxDescLen
    ? originalDescription.slice(0, maxDescLen) + '...'
    : originalDescription;

  // Optionally cap the number of candidates
  const cappedCandidates = maxItems && candidates.length > maxItems
    ? candidates.slice(0, maxItems)
    : candidates;

  // Group candidates by type
  const byType = new Map<string, EntityCandidate[]>();
  for (const c of cappedCandidates) {
    const list = byType.get(c.type) || [];
    list.push(c);
    byType.set(c.type, list);
  }

  const rosterParts: string[] = [];
  for (const [type, items] of byType) {
    const itemList = items.map(c => {
      const desc = c.description ? ` — ${c.description.slice(0, 80)}` : '';
      return `  - ${c.name}${desc}`;
    }).join('\n');
    rosterParts.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n${itemList}`);
  }

  const itemCapNote = maxItems && candidates.length > maxItems
    ? `\n\nNote: This is a condensed roster (${maxItems} of ${candidates.length} entities). Prioritize the most important entities.`
    : '';

  return `From the story bible:\n${descSnippet}\n\nExtracted entity roster (${cappedCandidates.length} entities):\n\n${rosterParts.join('\n\n')}${itemCapNote}`;
}
