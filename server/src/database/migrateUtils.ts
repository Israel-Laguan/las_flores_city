// Pure, side-effect-free helpers for the migration runner. They are extracted
// into their own module so they can be unit-tested without pulling in the CLI
// entry side effects of migrate.ts (which declares __dirname via import.meta
// and collides with ts-jest's CommonJS transform).

export function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash === 0 ? 1 : hash;
}

export function parseVersion(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : filename;
}

// Migration files historically wrapped themselves in a top-level BEGIN/COMMIT so
// the wrapper transaction in withOLTPTransaction/withOLAPTransaction would then
// open a *nested* transaction. A file-level COMMIT inside that wrapper can close
// the inner savepoint before recordMigration runs, leaving schema changes
// applied without matching bookkeeping on a later failure. We now let the
// wrapper own the single transaction and strip the file-level transaction
// control statements here — but only those at the top level, never the
// BEGIN/COMMIT/ROLLBACK that appear inside PL/pgSQL `$$` ... `$$` bodies.
export function stripFileLevelTransactionControl(sql: string): string {
  const lines = sql.split('\n');
  let inDollarBlock = false;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (/\$\$/.test(trimmed)) {
      const dollars = (trimmed.match(/\$\$/g) || []).length;
      // Toggle per pair; an odd count within a line keeps us in/out of a block.
      if (dollars % 2 === 1) inDollarBlock = !inDollarBlock;
    }
    if (!inDollarBlock && /^(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(trimmed)) {
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// Split a SQL file into individual statements for execution in autocommit mode.
// node-postgres sends a multi-statement string as ONE simple-query message, and
// PostgreSQL wraps that in an implicit transaction block. A COMMIT inside a
// PL/pgSQL body (as used by nontransactional migrations like 075) is therefore
// illegal and raises `2D000 invalid transaction termination`. Splitting into
// separate `query()` calls avoids the implicit block — each statement gets its
// own autocommit transaction, so an in-body COMMIT is legal.
//
// Top-level transaction control (BEGIN/COMMIT/ROLLBACK) was already stripped by
// stripFileLevelTransactionControl, so we only need to break on statement
// boundaries while keeping $$ ... $$ bodies intact.
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollarBlock = false;
  let dollarTag = '';
  const lines = sql.split('\n');
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      buf += raw + '\n';
      continue;
    }
    if (!inDollarBlock) {
      // Find the first `$$` opening (with optional tag) anywhere in the line.
      // A tag is `$$tag$`; an untagged opener is `$$` at end-of-line.
      const openMatch = trimmed.match(/\$\$(\w*)\$?/);
      if (openMatch) {
        const tag = openMatch[1] ?? '';
        const after = trimmed.slice(openMatch.index! + openMatch[0].length);
        const closeRe = new RegExp(`\\$${tag}\\$`);
        if (closeRe.test(after)) {
          // Open and close on the same line — not a block spanning lines.
          buf += raw + '\n';
          if (buf.trim()) {
            out.push(buf.trim());
            buf = '';
          }
          continue;
        }
        inDollarBlock = true;
        dollarTag = tag;
      }
    } else {
      const closeRe = new RegExp(`\\$${dollarTag}\\$`);
      if (closeRe.test(trimmed)) {
        inDollarBlock = false;
        dollarTag = '';
      }
    }
    buf += raw + '\n';
    if (!inDollarBlock && /;\s*$/.test(raw)) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(s => s.length > 0);
}
