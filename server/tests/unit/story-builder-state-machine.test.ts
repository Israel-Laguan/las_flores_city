import { describe, it, expect } from '@jest/globals';
import type { AssetNeed } from '@las-flores/shared';
import { transitionAssetNeed } from '../../src/services/AssetNeedsService.js';

/** Helper: build an AssetNeed with a given status. */
function need(status: AssetNeed['status']): AssetNeed {
  return { promptType: 'portrait', targetField: 'asset_paths.portrait', status };
}

describe('AssetNeedsService — state machine transitions', () => {
  describe('transitionAssetNeed — valid transitions', () => {
    it('pending → drafted (local generation)', () => {
      const n = need('pending');
      transitionAssetNeed(n, 'drafted');
      expect(n.status).toBe('drafted');
    });

    it('pending → chosen (keep pre-existing default without generating)', () => {
      const n = need('pending');
      transitionAssetNeed(n, 'chosen');
      expect(n.status).toBe('chosen');
    });

    it('pending → failed', () => {
      const n = need('pending');
      transitionAssetNeed(n, 'failed');
      expect(n.status).toBe('failed');
    });

    it('drafted → chosen (user picks a draft)', () => {
      const n = need('drafted');
      transitionAssetNeed(n, 'chosen');
      expect(n.status).toBe('chosen');
    });

    it('drafted → failed', () => {
      const n = need('drafted');
      transitionAssetNeed(n, 'failed');
      expect(n.status).toBe('failed');
    });

    it('drafted → pending (discarded, re-generate)', () => {
      const n = need('drafted');
      transitionAssetNeed(n, 'pending');
      expect(n.status).toBe('pending');
    });

    it('chosen → published (upload to MinIO)', () => {
      const n = need('chosen');
      transitionAssetNeed(n, 'published');
      expect(n.status).toBe('published');
    });

    it('chosen → failed', () => {
      const n = need('chosen');
      transitionAssetNeed(n, 'failed');
      expect(n.status).toBe('failed');
    });

    it('chosen → drafted (user changed their mind)', () => {
      const n = need('chosen');
      transitionAssetNeed(n, 'drafted');
      expect(n.status).toBe('drafted');
    });

    it('published → assigned (URL wired into YAML)', () => {
      const n = need('published');
      transitionAssetNeed(n, 'assigned');
      expect(n.status).toBe('assigned');
    });

    it('published → failed', () => {
      const n = need('published');
      transitionAssetNeed(n, 'failed');
      expect(n.status).toBe('failed');
    });

    it('assigned → failed (terminal failure)', () => {
      const n = need('assigned');
      transitionAssetNeed(n, 'failed');
      expect(n.status).toBe('failed');
    });

    it('failed → pending (retry)', () => {
      const n = need('failed');
      transitionAssetNeed(n, 'pending');
      expect(n.status).toBe('pending');
    });
  });

  describe('transitionAssetNeed — invalid transitions throw', () => {
    const invalid: Array<[AssetNeed['status'], AssetNeed['status']]> = [
      // pending cannot jump to published/assigned
      ['pending', 'published'],
      ['pending', 'assigned'],
      // drafted cannot jump to published/assigned
      ['drafted', 'published'],
      ['drafted', 'assigned'],
      // chosen cannot jump to assigned directly (must publish first)
      ['chosen', 'assigned'],
      // published cannot go back to pending/drafted/chosen
      ['published', 'pending'],
      ['published', 'drafted'],
      ['published', 'chosen'],
      // assigned is terminal except for failed
      ['assigned', 'pending'],
      ['assigned', 'drafted'],
      ['assigned', 'chosen'],
      ['assigned', 'published'],
      // failed can only retry to pending
      ['failed', 'drafted'],
      ['failed', 'chosen'],
      ['failed', 'published'],
      ['failed', 'assigned'],
    ];

    for (const [from, to] of invalid) {
      it(`${from} → ${to} throws`, () => {
        const n = need(from);
        expect(() => transitionAssetNeed(n, to)).toThrow(/Invalid asset need transition/);
        // Status must be unchanged after a failed transition
        expect(n.status).toBe(from);
      });
    }
  });

  describe('transitionAssetNeed — mutates the need in place', () => {
    it('does not return a new object', () => {
      const n = need('pending');
      const result = transitionAssetNeed(n, 'drafted');
      expect(result).toBeUndefined(); // void return
      expect(n.status).toBe('drafted'); // same object mutated
    });
  });
});
