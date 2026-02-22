import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse } from '../types';

interface Organisation {
  organization_id: string;
}

export default async function organisationsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ApiResponse<Organisation[]> }>('/organisations', async (_request, reply) => {
    const cacheTTL = 3300; // 55 minutes
    const cacheKey = 'organisations:list';

    try {
      const { rows, cached } = await queryWithCache<Organisation>(
        cacheKey,
        cacheTTL,
        `SELECT DISTINCT organization_id
         FROM gold.dim_users
         WHERE organization_id IS NOT NULL
         ORDER BY organization_id`
      );

      return {
        data: rows,
        meta: {
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch organisations');
    }
  });
}
