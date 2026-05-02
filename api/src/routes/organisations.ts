import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse } from '../types';

interface Organisation {
  organization_id: string;
  organization_name: string;
}

export default async function organisationsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ApiResponse<Organisation[]> }>('/organisations', async (_request, reply) => {
    const cacheTTL = 3300;
    const cacheKey = 'organisations:list';

    try {
      // Try dim_organizations first (dev/prod) — has real org names
      const { rows, cached } = await queryWithCache<Organisation>(
        cacheKey,
        cacheTTL,
        `SELECT organization_id::text AS organization_id,
                COALESCE(organization_name, organization_id::text) AS organization_name
         FROM gold.dim_organizations
         WHERE is_deleted = false AND is_active = true
         ORDER BY organization_name`
      );
      return { data: rows, meta: { generated_at: new Date().toISOString(), cached } };
    } catch {
      // Fallback: staging — dim_organizations doesn't exist, use dim_users
      try {
        const { rows, cached } = await queryWithCache<Organisation>(
          cacheKey + ':fallback',
          cacheTTL,
          `SELECT DISTINCT
                  organization_id::text AS organization_id,
                  organization_id::text AS organization_name
           FROM gold.dim_users
           WHERE organization_id IS NOT NULL
           ORDER BY organization_id`
        );
        return { data: rows, meta: { generated_at: new Date().toISOString(), cached } };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch organisations');
      }
    }
  });
}
