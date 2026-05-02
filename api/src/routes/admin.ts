import { FastifyInstance } from 'fastify';
import { switchEnv, getCurrentEnv } from '../db';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { env: string } }>('/switch-env', async (request, reply) => {
    const { env } = request.body ?? {};
    if (!env || !['dev', 'stg', 'prod'].includes(env)) {
      reply.code(400);
      throw new Error('env must be dev | stg | prod');
    }
    try {
      const db_host = await switchEnv(env);
      fastify.log.info(`Switched to ${env} (${db_host})`);
      return { success: true, env, db_host };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to switch environment');
    }
  });

  fastify.get('/current-env', async () => ({
    env: getCurrentEnv(),
  }));
}
