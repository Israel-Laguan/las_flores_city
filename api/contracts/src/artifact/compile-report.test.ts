// api/contracts/src/artifact/compile-report.test.ts
// SC-405: report shape, derived counts, stable JSON.

import { COMPILE_ISSUE_CODES, buildCompileReport, stringifyCompileReport, type CompileSceneEntry } from './compile-report.js';

const issue = (severity: 'error' | 'warning' | 'hint', scene_slug = 'a') => ({
  code: 'X',
  path: 'p',
  message: 'm',
  severity,
  scene_slug,
});

const ok = (slug: string): CompileSceneEntry => ({ scene_slug: slug, status: 'compiled', artifact_id: 'a'.repeat(64), issues: [issue('hint', slug)] });
const failed = (slug: string): CompileSceneEntry => ({ scene_slug: slug, status: 'failed', artifact_id: null, issues: [issue('error', slug), issue('warning', slug)] });

describe('buildCompileReport', () => {
  test('sorts scenes by slug and derives counts', () => {
    const report = buildCompileReport([failed('b'), ok('c'), ok('a')]);
    expect(report.scenes.map((s) => s.scene_slug)).toEqual(['a', 'b', 'c']);
    expect(report).toMatchObject({ ok: false, error_count: 1, warning_count: 1, hint_count: 2, report_version: 1 });
  });

  test('ok only when every scene compiled', () => {
    expect(buildCompileReport([ok('a'), ok('b')]).ok).toBe(true);
    expect(buildCompileReport([]).ok).toBe(true);
  });

  test('does not mutate its input', () => {
    const entries = [ok('b'), ok('a')];
    buildCompileReport(entries);
    expect(entries.map((e) => e.scene_slug)).toEqual(['b', 'a']);
  });

  test('stringify is byte-stable regardless of input order', () => {
    expect(stringifyCompileReport(buildCompileReport([ok('b'), failed('a')]))).toBe(
      stringifyCompileReport(buildCompileReport([failed('a'), ok('b')])),
    );
  });

  test('issue codes equal their keys', () => {
    for (const [k, v] of Object.entries(COMPILE_ISSUE_CODES)) expect(v).toBe(k);
  });
});
