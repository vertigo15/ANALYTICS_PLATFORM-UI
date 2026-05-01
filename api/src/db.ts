import { Pool, QueryResult, QueryResultRow } from 'pg';
import NodeCache from 'node-cache';

const pool = new Pool({
  host:     process.env.ANALYTICS_DB_HOST,
  port:     parseInt(process.env.ANALYTICS_DB_PORT || '5432'),
  database: process.env.ANALYTICS_DB_NAME,
  user:     process.env.ANALYTICS_DB_USER,
  password: process.env.ANALYTICS_DB_PASSWORD,
  ssl: process.env.ANALYTICS_DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
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

export default pool;
