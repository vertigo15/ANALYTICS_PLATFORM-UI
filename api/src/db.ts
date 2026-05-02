import { Pool, QueryResult, QueryResultRow } from 'pg';
import NodeCache from 'node-cache';
import { AsyncLocalStorage } from 'node:async_hooks';

const VALID_ENVS = ['dev', 'stg', 'prod'] as const;
type Env = typeof VALID_ENVS[number];

const DEFAULT_ENV = (process.env.APP_ENV || 'dev').toLowerCase() as Env;

// ── Per-request env context ───────────────────────────────────────────────────
const envStorage = new AsyncLocalStorage<Env>();

export function getCurrentEnv(): Env {
  return envStorage.getStore() ?? DEFAULT_ENV;
}

/** Call done() (or any sync fn) inside the given env's async context. */
export function runWithEnv(env: string, fn: () => void): void {
  const safeEnv: Env = (VALID_ENVS as readonly string[]).includes(env)
    ? (env as Env)
    : DEFAULT_ENV;
  envStorage.run(safeEnv, fn);
}

// ── One pool per environment, initialised at startup ─────────────────────────
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

const pools: Record<Env, Pool> = {
  dev:  buildPool('dev'),
  stg:  buildPool('stg'),
  prod: buildPool('prod'),
};

const cache = new NodeCache();

// Per-env schema detection cache
const _userJoinColCache: Partial<Record<Env, string>> = {};

export function getDbHost(env?: string): string {
  const e = (env ?? getCurrentEnv()).toUpperCase();
  return process.env[`${e}_DB_HOST`] || process.env.ANALYTICS_DB_HOST || 'unknown';
}

// ── Query helpers ─────────────────────────────────────────────────────────────
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string, params: unknown[] = []
): Promise<QueryResult<T>> {
  const client = await pools[getCurrentEnv()].connect();
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
  const envKey = `${getCurrentEnv()}:${key}`;
  const cached = cache.get<T[]>(envKey);
  if (cached) return { rows: cached, cached: true };
  const result = await query<T>(sql, params);
  cache.set(envKey, result.rows, ttl);
  return { rows: result.rows, cached: false };
}

// ── Schema detection ──────────────────────────────────────────────────────────
export async function getUserJoinCol(): Promise<string> {
  const env = getCurrentEnv();
  if (_userJoinColCache[env]) return _userJoinColCache[env]!;
  try {
    const result = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='gold' AND table_name='fact_messages'
        AND column_name IN ('user_id','user_key')
      ORDER BY ordinal_position LIMIT 1
    `);
    _userJoinColCache[env] = result.rows[0]?.column_name || 'user_id';
  } catch { _userJoinColCache[env] = 'user_id'; }
  return _userJoinColCache[env]!;
}

export default pools[DEFAULT_ENV];
