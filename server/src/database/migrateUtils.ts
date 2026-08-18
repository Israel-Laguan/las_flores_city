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
// stripFileLevelTransactionControl, so we only break on real statement
// boundaries and keep `$tag$ ... $tag$` bodies (tag = "" for `$$`) intact. The
// splitter is SQL-aware: a `;` inside a single-quoted string literal, a line or
// block comment, or a `$...$` body never terminates a statement, and a
// `;` that is followed on the same line by a trailing `--` comment still counts
// as a terminator (the trailing comment is inert and is carried with the next
// statement).
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  // Tag of the dollar-quoted body we are inside (`''` for `$$`), or null when
  // not inside one. Semicolons inside a body are part of the routine's SQL and
  // must never split the script.
  let dollarTag: string | null = null;
  let i = 0;

  while (i < sql.length) {
    // Inside a `$tag$ ... $tag$` body: only the matching closing delimiter ends
    // it; everything in between (including `;`, quotes and comments) is inert.
    if (dollarTag !== null) {
      const delim = `$${dollarTag}$`;
      if (sql.startsWith(delim, i)) {
        buf += delim;
        i += delim.length;
        dollarTag = null;
      } else {
        buf += sql[i];
        i += 1;
      }
      continue;
    }

    const ch = sql[i];
    const next = sql[i + 1];

    // Single-quoted string literal: `''` is an escaped quote inside the literal.
    if (ch === "'") {
      buf += ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { buf += "''"; i += 2; continue; }
          buf += "'";
          i += 1;
          break;
        }
        buf += sql[i];
        i += 1;
      }
      continue;
    }

    // Line comment `-- ...` runs to the end of the line.
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        buf += sql[i];
        i += 1;
      }
      continue;
    }

    // Block comment `/* ... */`.
    if (ch === '/' && next === '*') {
      buf += '/*';
      i += 2;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') { buf += '*/'; i += 2; break; }
        buf += sql[i];
        i += 1;
      }
      continue;
    }

    // Dollar-quote opener (`$$` or `$tag$`). Treat it as an opener only when a
    // matching closing delimiter appears later; a lone `$` is a literal char.
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*\$|\$)/);
      if (m) {
        const delim = m[0];
        if (sql.indexOf(delim, i + delim.length) !== -1) {
          buf += delim;
          i += delim.length;
          dollarTag = delim.slice(1, -1);
          continue;
        }
      }
      buf += ch;
      i += 1;
      continue;
    }

    // A semicolon outside strings/comments/dollar bodies terminates a statement.
    if (ch === ';') {
      buf += ch;
      i += 1;
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}
