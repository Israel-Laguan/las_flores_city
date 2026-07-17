import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  STAGE_PRIORITY,
  getEnv,
  resolveAssetUrl,
  resolveAssetStage,
  type AssetEntry,
} from '../../src/services/AssetStageResolver.js';

describe('AssetStageResolver', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('getEnv()', () => {
    it('returns "development" when NODE_ENV=development', () => {
      process.env.NODE_ENV = 'development';
      expect(getEnv()).toBe('development');
    });

    it('returns "staging" when NODE_ENV=staging', () => {
      process.env.NODE_ENV = 'staging';
      expect(getEnv()).toBe('staging');
    });

    it('returns "production" when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      expect(getEnv()).toBe('production');
    });

    it('returns "production" when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      expect(getEnv()).toBe('production');
    });

    it('returns "production" for unknown values', () => {
      process.env.NODE_ENV = 'test';
      expect(getEnv()).toBe('production');
    });
  });

  describe('STAGE_PRIORITY', () => {
    it('development: dev > staging > production', () => {
      expect(STAGE_PRIORITY.development).toEqual(['dev', 'staging', 'production']);
    });

    it('production: production > staging > dev', () => {
      expect(STAGE_PRIORITY.production).toEqual(['production', 'staging', 'dev']);
    });

    it('staging: dev > staging > production (same as development)', () => {
      expect(STAGE_PRIORITY.staging).toEqual(['dev', 'staging', 'production']);
    });
  });

  describe('resolveAssetUrl()', () => {
    const entries: AssetEntry[] = [
      { url: 'https://dev.example.com/a.png', label: 'dev' },
      { url: 'https://staging.example.com/a.png', label: 'staging' },
      { url: 'https://prod.example.com/a.png', label: 'production' },
    ];

    it('in development: dev URL wins over staging/production', () => {
      process.env.NODE_ENV = 'development';
      expect(resolveAssetUrl(entries)).toBe('https://dev.example.com/a.png');
    });

    it('in production: production URL wins over staging/dev', () => {
      process.env.NODE_ENV = 'production';
      expect(resolveAssetUrl(entries)).toBe('https://prod.example.com/a.png');
    });

    it('in staging: dev URL wins (per user spec)', () => {
      process.env.NODE_ENV = 'staging';
      expect(resolveAssetUrl(entries)).toBe('https://dev.example.com/a.png');
    });

    it('when dev entry is missing, staging URL is used (dev env)', () => {
      process.env.NODE_ENV = 'development';
      const withoutDev = entries.filter(e => e.label !== 'dev');
      expect(resolveAssetUrl(withoutDev)).toBe('https://staging.example.com/a.png');
    });

    it('when dev and staging are missing, production URL is used (dev env)', () => {
      process.env.NODE_ENV = 'development';
      const onlyProd = entries.filter(e => e.label === 'production');
      expect(resolveAssetUrl(onlyProd)).toBe('https://prod.example.com/a.png');
    });

    it('returns null when all entries are empty', () => {
      process.env.NODE_ENV = 'development';
      expect(resolveAssetUrl(null)).toBeNull();
      expect(resolveAssetUrl(undefined)).toBeNull();
      expect(resolveAssetUrl([])).toBeNull();
    });

    it('returns null when entries have empty URLs', () => {
      process.env.NODE_ENV = 'development';
      const empty: AssetEntry[] = [
        { url: '', label: 'dev' },
        { url: '', label: 'staging' },
      ];
      expect(resolveAssetUrl(empty)).toBeNull();
    });

    it('expression filter narrows pool before stage priority', () => {
      process.env.NODE_ENV = 'development';
      const withExpr: AssetEntry[] = [
        { url: 'https://dev.example.com/happy.png', label: 'dev', expression: 'happy' },
        { url: 'https://dev.example.com/sad.png', label: 'dev', expression: 'sad' },
        { url: 'https://prod.example.com/happy.png', label: 'production', expression: 'happy' },
      ];
      expect(resolveAssetUrl(withExpr, { expression: 'happy' })).toBe('https://dev.example.com/happy.png');
      expect(resolveAssetUrl(withExpr, { expression: 'sad' })).toBe('https://dev.example.com/sad.png');
    });

    it('expression filter falls back to all entries when no match', () => {
      process.env.NODE_ENV = 'production';
      const withExpr: AssetEntry[] = [
        { url: 'https://dev.example.com/happy.png', label: 'dev', expression: 'happy' },
        { url: 'https://prod.example.com/base.png', label: 'production' },
      ];
      // No entry has expression 'sad', so all entries become the pool
      expect(resolveAssetUrl(withExpr, { expression: 'sad' })).toBe('https://prod.example.com/base.png');
    });
  });

  describe('resolveAssetStage()', () => {
    it('returns url and stage in development', () => {
      process.env.NODE_ENV = 'development';
      const entries: AssetEntry[] = [
        { url: 'https://dev.example.com/a.png', label: 'dev' },
        { url: 'https://prod.example.com/a.png', label: 'production' },
      ];
      const result = resolveAssetStage(entries);
      expect(result).toEqual({ url: 'https://dev.example.com/a.png', stage: 'dev' });
    });

    it('returns null for empty entries', () => {
      process.env.NODE_ENV = 'development';
      expect(resolveAssetStage(null)).toBeNull();
      expect(resolveAssetStage([])).toBeNull();
    });

    it('returns fallback stage label when no label matches', () => {
      process.env.NODE_ENV = 'development';
      const entries: AssetEntry[] = [
        { url: 'https://example.com/a.png' },
      ];
      const result = resolveAssetStage(entries);
      expect(result).toEqual({ url: 'https://example.com/a.png', stage: 'unknown' });
    });
  });
});
