import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { parseCsv, serializeCsv, serializeField, processRows, parseArgs } = await import('./verify-missing-expression-variants.mjs');

describe('parseCsv (RFC 4180)', () => {
  test('parses simple unquoted fields', () => {
    const text = 'path,prompt,nim_safe_prompt,ratio,done\n';
    const rows = parseCsv(text);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ['path', 'prompt', 'nim_safe_prompt', 'ratio', 'done']);
  });

  test('decodes escaped quotes in quoted fields', () => {
    const text = 'path,prompt,nim_safe_prompt,ratio,done\nval,"pro""mpt","safe","3:4",1\n';
    const rows = parseCsv(text);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['path', 'prompt', 'nim_safe_prompt', 'ratio', 'done']);
    assert.deepEqual(rows[1], ['val', 'pro"mpt', 'safe', '3:4', '1']);
  });

  test('handles quoted fields containing commas', () => {
    const text = 'path,prompt,nim_safe_prompt,ratio,done\nval,"hello, world","safe","3:4",0\n';
    const rows = parseCsv(text);
    assert.deepEqual(rows[1], ['val', 'hello, world', 'safe', '3:4', '0']);
  });

  test('handles unquoted fields with commas in prompt via quoting', () => {
    // Unquoted field with comma would be split; quoting handles it
    const text = 'a/"x,y"/"z/1:1,0\n';
    // Actually test that quoting works for comma-containing fields
    const text2 = 'a,"x,y","z",1:1,0\n';
    const rows = parseCsv(text2);
    assert.deepEqual(rows[0], ['a', 'x,y', 'z', '1:1', '0']);
  });

  test('handles no trailing newline', () => {
    const text = 'a,b,1:1,0';
    const rows = parseCsv(text);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ['a', 'b', '1:1', '0']);
  });

  test('handles CRLF line endings', () => {
    const text = 'a,b,c\r\nd,e,f\r\n';
    const rows = parseCsv(text);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['a', 'b', 'c']);
    assert.deepEqual(rows[1], ['d', 'e', 'f']);
  });

  test('preserves empty fields in position', () => {
    const text = 'a,,c,d,0\n';  // empty second field
    const rows = parseCsv(text);
    assert.deepEqual(rows[0], ['a', '', 'c', 'd', '0']);
  });
});

describe('serializeField / serializeCsv', () => {
  test('does not quote simple fields', () => {
    assert.equal(serializeField('hello'), 'hello');
    assert.equal(serializeField('path/to/file.png'), 'path/to/file.png');
  });

  test('quotes fields containing commas', () => {
    assert.equal(serializeField('hello, world'), '"hello, world"');
  });

  test('quotes and doubles embedded quotes', () => {
    assert.equal(serializeField('say "hi"'), '"say ""hi"""');
  });

  test('round-trip: parse then serialize preserves content', () => {
    const original = 'a,"pro""mpt text","safe prompt","3:4",0\n';
    const rows = parseCsv(original);
    const regenerated = serializeCsv(rows);
    const reparsed = parseCsv(regenerated);
    assert.deepEqual(reparsed, rows);
  });
});

describe('processRows round-trip stability', () => {
  test('running parse+serialize twice produces identical output', () => {
    // CSV with tricky prompt content: embedded quotes and commas
    // Prompt: premium portrait of a man, with detailed features. He said "hello"
    // NimSafe: safe prompt with, comma and "quotes"
    const csvText = [
      'path,prompt,nim_safe_prompt,ratio,done',
      'content/characters/test/assets/test__default.png,"premium portrait of a man, with detailed features. He said ""hello""","safe prompt with, comma and ""quotes""","3:4",0',
      'content/characters/test/assets/test__smirk.png,"another prompt, with comma","safe prompt",1:1,1',
    ].join('\n') + '\n';

    const csvDir = '/tmp/fake';

    // First pass: parse, process, serialize
    const result1 = processRows(csvText, csvDir);
    const output1 = serializeCsv(result1.rows);

    // Second pass: parse the output, process, serialize again
    const result2 = processRows(output1, csvDir);
    const output2 = serializeCsv(result2.rows);

    // The outputs must be byte-identical (no progressive quote escaping)
    assert.equal(output1, output2, 'Round-trip must be stable');

    // Row counts must match
    assert.equal(result1.total, result2.total);
    assert.equal(result1.total, 2);

    // Prompt values must match exactly and not be corrupted
    const r1 = result1.rows[1];
    const r2 = result2.rows[1];
    assert.equal(r1[1], r2[1], 'prompt field must match between passes');
    assert.equal(r1[1], 'premium portrait of a man, with detailed features. He said "hello"', 'prompt not corrupted');
    assert.equal(r2[1], 'premium portrait of a man, with detailed features. He said "hello"', 'prompt not corrupted on 2nd pass');
  });

  test('preserves all rows including those with special characters', () => {
    const csvText = [
      'path,prompt,nim_safe_prompt,ratio,done',
      'a/b/c.png,"prompt with ""quotes"" and, commas","safe","16:9",0',
      'd/e/f.png,"no special chars","safe","1:1",0',
      'g/h/i.png,"tab\there","safe","4:3",0',
    ].join('\n') + '\n';

    const result1 = processRows(csvText, '/tmp');
    const output1 = serializeCsv(result1.rows);
    const result2 = processRows(output1, '/tmp');
    const output2 = serializeCsv(result2.rows);

    assert.equal(output1, output2, 'Stable across two runs');
    assert.equal(result1.total, 3);
    assert.equal(result2.total, 3);
    // Verify prompt values are not progressively escaped
    assert.equal(result1.rows[1][1], 'prompt with "quotes" and, commas');
    assert.equal(result2.rows[1][1], 'prompt with "quotes" and, commas');
  });
});

describe('parseArgs validation', () => {
  test('rejects unknown options', () => {
    assert.throws(() => parseArgs(['--bogus']), { message: /Unknown option/ });
  });

  test('rejects --csv without a value', () => {
    assert.throws(() => parseArgs(['--csv']), { message: /requires a path/ });
  });

  test('rejects --csv followed by another option', () => {
    assert.throws(() => parseArgs(['--csv', '--bogus']), { message: /requires a path/ });
  });
});
