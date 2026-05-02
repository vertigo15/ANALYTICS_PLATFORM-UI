import { Pool, QueryResult, QueryResultRow } from 'pg';
import NodeCache from 'node-cache';

const env = (process.env.APP_ENV || 'dev').toUpperCase(); // DEV | STG | PROD

const pool = new Pool({
  host:     process.env[`${env}_DB_HOST`]     || process.env.ANALYTICS_DB_HOST,
  port:     parseInt(process.env[`${env}_DB_PORT`]  || process.env.ANALYTICS_DB_PORT || '5432'),
  database: process.env[`${env}_DB_NAME`]     || process.env.ANALYTICS_DB_NAME,
  user:     process.env[`${env}_DB_USER`]     || process.env.ANALYTICS_DB_USER,
  password: process.env[`${env}_DB_PASSWORD`] || process.env.ANALYTICS_DB_PASSWORD,
  ssl: (process.env[`${env}_DB_SSLMODE`] || process.env.ANALYTICS_DB_SSLMODE) === 'require'
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error(`[db] Unexpected pool error (env=${env}):`, err.message);
});

const cache = new NodeCache();

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 10000');
    return await client.query<T>(sql, params);
  } finally {
    client.release();
  }
}

export async function queryWithCache<T extends QueryResultRow = QueryResultRow>(
  key: string,
  ttl: number,
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; cached: boolean }> {
  const cached = cache.get<T[]>(key);
  if (cached) return { rows: cached, cached: true };

  const result = await query<T>(sql, params);
  cache.set(key, result.rows, ttl);
  return { rows: result.rows, cached: false };
}


// ── Schema detection (runs once, cached) ─────────────────────────────────────
// fact_messages uses 'user_id' in dev/prod, 'user_key' in staging
let _userJoinCol: string | null = null;

export async function getUserJoinCol(): Promise<string> {
  if (_userJoinCol) return _userJoinCol;
  try {
    const result = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'gold'
        AND table_name   = 'fact_messages'
        AND column_name IN ('user_id', 'user_key')
      ORDER BY ordinal_position LIMIT 1
    `);
    _userJoinCol = result.rows[0]?.column_name || 'user_id';
  } catch {
    _userJoinCol = 'user_id';
  }
  return _userJoinCol;
}

export default pool;
