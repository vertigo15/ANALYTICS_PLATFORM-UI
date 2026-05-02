import { FastifyInstance } from 'fastify';
import { getCurrentEnv, getDbHost } from '../db';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Env is now controlled per-request via the x-analytics-env header.
  // The frontend stores the preference in localStorage and sends it with every request.
  fastify.post<{ Body: { env: string } }>('/switch-env', async (request) => {
    const { env } = request.body ?? {};
    // Acknowledge the switch — actual routing is handled per-request via header.
    const safeEnv = ['dev', 'stg', 'prod'].includes(env) ? env : getCurrentEnv();
    return { success: true, env: safeEnv, db_host: getDbHost(safeEnv) };
  });

  fastify.get('/current-env', async () => ({
    env: getCurrentEnv(),
    db_host: getDbHost(),
  }));
}
