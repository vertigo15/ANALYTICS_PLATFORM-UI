import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { HealthResponse } from '../types';

const ENV = process.env.APP_ENV || 'dev';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    try {
      await query('SELECT 1');
      return {
        status: 'ok',
        db: 'connected',
        env: ENV,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.code(503);
      return {
        status: 'error',
        db: 'disconnected',
        env: ENV,
        timestamp: new Date().toISOString(),
      };
    }
  });
}
