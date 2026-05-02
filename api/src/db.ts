import { Pool, QueryResult, QueryResultRow } from 'pg';
import NodeCache from 'node-cache';

// ── Dynamic env state ─────────────────────────────────────────────────────────
let _currentEnv = (process.env.APP_ENV || 'dev').toLowerCase();
let _userJoinCol: string | null = null;

function buildPool(envKey: string): Pool {
  const p = envKey.toUpperCase();
  const pool = new Pool({
    host:     process.env[`${p}_DB_HOST`]     || process.env.ANALYTICS_DB_HOST,
    port:     parseInt(process.env[`${p}_DB_PORT`]  || process.env.ANALYTICS_DB_PORT || '5432'),
    database: process.env[`${p}_DB_NAME`]     || process.env.ANALYTICS_DB_NAME,
    user:     process.env[`${p}_DB_USER`]     || process.env.ANALYTICS_DB_USER,
    password: process.env[`${p}_DB_PASSWORD`] || process.env.ANALYTICS_DB_PASSWORD,
    ssl: (process.env[`${p}_DB_SSLMODE`] || process.env.ANALYTICS_DB_SSLMODE) === 'require'
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', err => console.error(`[db:${envKey}] pool error:`, err.message));
  return pool;
}

let _pool = buildPool(_currentEnv);
const cache = new NodeCache();

// ── Switch DB at runtime (no restart needed) ──────────────────────────────────
export async function switchEnv(newEnv: string): Promise<string> {
  const valid = ['dev', 'stg', 'prod'];
  if (!valid.includes(newEnv)) throw new Error(`Invalid env: ${newEnv}`);

  const old = _pool;
  _pool = buildPool(newEnv);
  _currentEnv = newEnv;
  _userJoinCol = null;       // re-detect schema for new DB
  cache.flushAll();           // clear cached query results

  // drain old pool gracefully
  setTimeout(() => old.end().catch(() => {}), 5000);

  const p = newEnv.toUpperCase();
  return process.env[`${p}_DB_HOST`] || process.env.ANALYTICS_DB_HOST || 'unknown';
}

export function getCurrentEnv(): string { return _currentEnv; }

// ── Query helpers ─────────────────────────────────────────────────────────────
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string, params: unknown[] = []
): Promise<QueryResult<T>> {
  const client = await _pool.connect();
  try {
    await client.query('SET statement_timeout = 10000');
    return await client.query<T>(sql, params);
  } finally {
    client.release();
  }
}

export async function queryWithCache<T extends QueryResultRow = QueryResultRow>(
  key: string, ttl: number, sql: string, params: unknown[] = []
): Promise<{ rows: T[]; cached: boolean }> {
  const cached = cache.get<T[]>(key);
  if (cached) return { rows: cached, cached: true };
  const result = await query<T>(sql, params);
  cache.set(key, result.rows, ttl);
  return { rows: result.rows, cached: false };
}

// ── Schema detection ──────────────────────────────────────────────────────────
export async function getUserJoinCol(): Promise<string> {
  if (_userJoinCol) return _userJoinCol;
  try {
    const result = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='gold' AND table_name='fact_messages'
        AND column_name IN ('user_id','user_key')
      ORDER BY ordinal_position LIMIT 1
    `);
    _userJoinCol = result.rows[0]?.column_name || 'user_id';
  } catch { _userJoinCol = 'user_id'; }
  return _userJoinCol!;
}

export default _pool;
