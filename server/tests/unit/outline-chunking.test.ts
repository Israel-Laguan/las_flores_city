import { describe, it, expect } from '@jest/globals';
import {
  chunkDescription,
  normalizeName,
  mergeCandidates,
  buildSynopsisFromCandidates,
  type EntityCandidate,
} from '../../src/services/OutlineChunking.js';

describe('OutlineChunking', () => {
  describe('chunkDescription', () => {
    it('returns single chunk when under maxChars', () => {
      const result = chunkDescription('Hello world', 100);
      expect(result).toEqual(['Hello world']);
    });

    it('splits by heading first', () => {
      const text = '# Title\n\nPara 1.\n\n## Subtitle\n\nPara 2.';
      const result = chunkDescription(text, 20);
      expect(result.length).toBeGreaterThan(1);
    });

    it('falls back to hard slice for oversized paragraphs', () => {
      const longPara = 'A'.repeat(100);
      const result = chunkDescription(longPara, 10);
      expect(result.length).toBeGreaterThan(1);
      expect(result.every(chunk => chunk.length <= 10)).toBe(true);
    });

    it('returns hard slice when no chunking possible', () => {
      const result = chunkDescription('A'.repeat(100), 45);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].length).toBeLessThanOrEqual(45);
    });
  });

  describe('normalizeName', () => {
    it('lowercases and strips separators', () => {
      expect(normalizeName('Diego The Bartender')).toBe('diegothebartender');
    });

    it('preserves unicode letters and numbers', () => {
      expect(normalizeName('Müller_Özil-123')).toBe('müllerözil123');
    });

    it('handles empty string', () => {
      expect(normalizeName('')).toBe('');
    });
  });

  describe('mergeCandidates', () => {
    it('deduplicates by normalized name + type', () => {
      const candidates: EntityCandidate[] = [
        { name: 'Diego', type: 'character', description: 'Short' },
        { name: 'diego', type: 'character', description: 'Longer description' },
        { name: 'Diego', type: 'location', description: 'Bar' },
      ];
      const result = mergeCandidates(candidates);
      expect(result).toHaveLength(2);
    });

    it('longest description wins on merge', () => {
      const candidates: EntityCandidate[] = [
        { name: 'Item A', type: 'vault', description: 'Short' },
        { name: 'Item A', type: 'vault', description: 'A much longer and better description' },
      ];
      const result = mergeCandidates(candidates);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('A much longer and better description');
    });
  });

  describe('buildSynopsisFromCandidates', () => {
    it('truncates description at 2000 chars', () => {
      const longDesc = 'A'.repeat(3000);
      const candidates: EntityCandidate[] = [
        { name: 'Thing', type: 'vault', description: 'A thing' },
      ];
      const result = buildSynopsisFromCandidates(candidates, longDesc);
      expect(result.length).toBeLessThan(2100);
    });

    it('respects maxItems cap', () => {
      const candidates: EntityCandidate[] = [
        { name: 'Item 0', type: 'vault', description: 'desc' },
        { name: 'Item 1', type: 'vault', description: 'desc' },
        { name: 'Item 2', type: 'vault', description: 'desc' },
      ];
      const result = buildSynopsisFromCandidates(candidates, 'desc', { maxItems: 2 });
      const itemCount = (result.match(/\n  - /g) || []).length;
      expect(itemCount).toBe(2);
    });

    it('includes itemCapNote when capped', () => {
      const candidates: EntityCandidate[] = [
        { name: 'A', type: 'vault', description: 'd' },
        { name: 'B', type: 'vault', description: 'd' },
      ];
      const result = buildSynopsisFromCandidates(candidates, 'desc', { maxItems: 1 });
      expect(result).toContain('condensed roster');
    });
  });
});
