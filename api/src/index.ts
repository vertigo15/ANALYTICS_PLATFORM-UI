import 'dotenv/config';
import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import pool from './db';
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
  logger: { level: process.env.LOG_LEVEL || 'info' },
});

async function start() {
  // ── Global error handler ──────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error({ err: error }, 'Unhandled error');

    if (error.code === 'ECONNREFUSED' || error.message?.includes('timed out')) {
      return reply.status(504).send({
        error: 'Query timed out',
        code: 'TIMEOUT',
        requestId: randomUUID(),
      });
    }

    const status = error.statusCode && error.statusCode < 600 ? error.statusCode : 500;
    return reply.status(status).send({
      error: 'Something went wrong',
      code: 'INTERNAL_ERROR',
      requestId: randomUUID(),
    });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ error: 'Not found', code: 'NOT_FOUND' });
  });

  await fastify.register(cors, { origin: true });

  await fastify.register(healthRoutes,        { prefix: '/api/v1' });
  await fastify.register(freshnessRoutes,     { prefix: '/api/v1' });
  await fastify.register(organisationsRoutes, { prefix: '/api/v1/users' });
  await fastify.register(agentsRoutes,        { prefix: '/api/v1/agents' });
  await fastify.register(costRoutes,          { prefix: '/api/v1/cost' });
  await fastify.register(usersRoutes,         { prefix: '/api/v1/users' });
  await fastify.register(documentsRoutes,     { prefix: '/api/v1/documents' });
  await fastify.register(aiRoutes,            { prefix: '/api/v1/ai' });
  await fastify.register(operationsRoutes,    { prefix: '/api/v1/operations' });
  await fastify.register(analyticsRoutes,     { prefix: '/api/v1/analytics' });

  const host = process.env.API_HOST || '0.0.0.0';
  const port = parseInt(process.env.API_PORT || '3001');

  await fastify.listen({ host, port });
  fastify.log.info(\`API server listening on http://\${host}:\${port}\`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  fastify.log.info(\`Received \${signal}, shutting down gracefully…\`);
  await fastify.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
