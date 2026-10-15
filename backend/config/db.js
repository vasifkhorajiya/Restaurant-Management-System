import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

// =====================================================================
//  PostgreSQL connection  (node-postgres)
//
//  The rest of the backend calls   pool.query(sql, params)   with "?" placeholders and
//  reads   [rows]   for SELECTs and   [{ affectedRows, insertId }]   for INSERT/UPDATE/DELETE.
//  This adapter keeps that shape and translates it to PostgreSQL:
//     ?            ->  $1, $2 …            (string literals / comments are skipped)
//     IN (?)       ->  = ANY($1)            when the value is an array
//     INSERT …     ->  … RETURNING id       so insertId keeps working
//     getConnection()                       a pooled client with begin/commit/rollback/release
//  SQL itself is plain PostgreSQL — nothing in here rewrites functions or syntax.
// =====================================================================

// COUNT(*) / SUM(int) come back as bigint (a string in node-pg) -> real JS numbers
pg.types.setTypeParser(20, (v) => Number(v));
// DATE columns stay plain 'YYYY-MM-DD' strings (no timezone-shifted JS Dates)
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC stays a string, exactly like DECIMAL did (the app always wraps it in Number())

const TIMEZONE = /^[A-Za-z0-9_/+\-]+$/.test(process.env.DB_TIMEZONE || '') ? process.env.DB_TIMEZONE : 'Asia/Kolkata';

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'restaurant_management',
    };

const pgPool = new pg.Pool({
  ...config,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // managed databases (Neon, Supabase, Render, RDS…) need TLS
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
});

// "date + time" logic (reports per day, today's sales…) must use the restaurant's timezone, not the server's
pgPool.on('connect', (client) => { client.query(`SET TIME ZONE '${TIMEZONE}'`).catch(() => {}); });
pgPool.on('error', (err) => console.error('PostgreSQL idle client error:', err.message));

// ---------------------------------------------------------------- "?" -> "$n"
export function translate(sql, params = []) {
  let out = '';
  const values = [];
  let i = 0;
  let p = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'" || ch === '"') {                         // string literal / quoted identifier (doubled quote = escaped)
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {                 // -- comment
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '?') {
      const value = params[p++];
      if (Array.isArray(value)) {
        // IN (?) / NOT IN (?) with an array  ->  = ANY($n) / <> ALL($n)
        const notIn = /\s*\bNOT\s+IN\s*\(\s*$/i.exec(out);
        const isIn = notIn ? null : /\s*\bIN\s*\(\s*$/i.exec(out);
        if (notIn) out = `${out.slice(0, notIn.index)} <> ALL(`;
        else if (isIn) out = `${out.slice(0, isIn.index)} = ANY(`;
      }
      values.push(value === undefined ? null : value);
      out += `$${values.length}`;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  if (p !== params.length) throw new Error(`SQL has ${p} placeholder(s) but ${params.length} value(s) were passed`);
  return { text: out, values };
}

// tables whose primary key is not a single "id" column
const NO_ID_TABLES = new Set(['favorites']);

async function run(executor, sql, params) {
  let { text, values } = translate(sql, params);
  let wantsId = false;
  const ins = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(text);
  if (ins && !/\bRETURNING\b/i.test(text) && !NO_ID_TABLES.has(ins[1].toLowerCase())) {
    text = `${text.replace(/[\s;]+$/, '')} RETURNING id`;
    wantsId = true;
  }
  const res = await executor.query(text, values);
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(res.command)) return [res.rows];
  return [{ affectedRows: res.rowCount, insertId: wantsId ? res.rows[0]?.id : undefined, rows: res.rows }];
}

const pool = {
  query: (sql, params = []) => run(pgPool, sql, params),

  // a dedicated connection for transactions
  async getConnection() {
    const client = await pgPool.connect();
    return {
      query: (sql, params = []) => run(client, sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK').catch(() => {}),
      release: () => client.release(),
    };
  },

  end: () => pgPool.end(),
  raw: pgPool,
};

export default pool;
