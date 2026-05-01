import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { HealthResponse } from '../types/index';

const APP_ENV = process.env.APP_ENV || 'dev';
const prefix  = APP_ENV.toUpperCase();
const DB_HOST = process.env[`${prefix}_DB_HOST`] || process.env.ANALYTICS_DB_HOST || 'unknown';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    try {
      await query('SELECT 1');
      return {
        status: 'ok',
        db: 'connected',
        env: APP_ENV,
        db_host: DB_HOST,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.code(503);
      return {
        status: 'error',
        db: 'disconnected',
        env: APP_ENV,
        db_host: DB_HOST,
        timestamp: new Date().toISOString(),
      };
    }
  });
}
