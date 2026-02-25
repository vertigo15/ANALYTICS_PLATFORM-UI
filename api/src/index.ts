import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import healthRoutes from './routes/health';
import freshnessRoutes from './routes/freshness';
import organisationsRoutes from './routes/organisations';
import agentsRoutes from './routes/agents';
import costRoutes from './routes/cost';
import usersRoutes from './routes/users';
import documentsRoutes from './routes/documents';
import aiRoutes from './routes/ai';
import operationsRoutes from './routes/operations';
import analyticsRoutes from './routes/analytics';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

async function start() {
  try {
    await fastify.register(cors, {
      origin: true,
    });

    await fastify.register(healthRoutes, { prefix: '/api/v1' });
    await fastify.register(freshnessRoutes, { prefix: '/api/v1' });
    await fastify.register(organisationsRoutes, { prefix: '/api/v1/users' });
    await fastify.register(agentsRoutes, { prefix: '/api/v1/agents' });
    await fastify.register(costRoutes, { prefix: '/api/v1/cost' });
    await fastify.register(usersRoutes, { prefix: '/api/v1/users' });
    await fastify.register(documentsRoutes, { prefix: '/api/v1/documents' });
    await fastify.register(aiRoutes, { prefix: '/api/v1/ai' });
    await fastify.register(operationsRoutes, { prefix: '/api/v1/operations' });
    await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

    const host = process.env.API_HOST || '0.0.0.0';
    const port = parseInt(process.env.API_PORT || '3001');

    await fastify.listen({ host, port });
    fastify.log.info(`API server listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
