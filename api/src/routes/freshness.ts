import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, FreshnessData, FreshnessTable, PageFreshness } from '../types';

const PAGE_TABLE_MAPPING: Record<string, string[]> = {
  cost: ['mart_llm_cost_by_user_model_day', 'mart_llm_cost_hourly'],
  agents: ['mart_agent_performance_daily', 'mart_agent_summary'],
  users: ['fact_user_activity_daily', 'mart_user_summary'],
  documents: ['mart_document_rag_health', 'fact_document_processing'],
  operations: ['mart_operational_hourly'],
};

export default async function freshnessRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ApiResponse<FreshnessData> }>('/freshness', async (_request, reply) => {
    const cacheTTL = 300; // 5 minutes
    const cacheKey = 'freshness:all';

    try {
      const { rows, cached } = await queryWithCache<FreshnessTable>(
        cacheKey,
        cacheTTL,
        `SELECT source_table, last_run_at, last_watermark
         FROM control.watermarks
         ORDER BY last_run_at DESC`
      );

      const data: FreshnessData = {
        cost: buildPageFreshness('cost', rows),
        agents: buildPageFreshness('agents', rows),
        users: buildPageFreshness('users', rows),
        documents: buildPageFreshness('documents', rows),
        operations: buildPageFreshness('operations', rows),
      };

      return {
        data,
        meta: {
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch freshness data');
    }
  });
}

function buildPageFreshness(page: string, allTables: FreshnessTable[]): PageFreshness {
  const pageTables = PAGE_TABLE_MAPPING[page] || [];
  const relevantTables = allTables.filter((t) =>
    pageTables.some((pt) => t.source_table.includes(pt))
  );

  if (relevantTables.length === 0) {
    return {
      last_updated: new Date().toISOString(),
      is_stale: false,
      tables: [],
    };
  }

  const mostRecent = relevantTables.reduce((latest, current) => {
    return new Date(current.last_run_at) > new Date(latest.last_run_at) ? current : latest;
  });

  const hoursSinceUpdate =
    (Date.now() - new Date(mostRecent.last_run_at).getTime()) / (1000 * 60 * 60);
  const isStale = hoursSinceUpdate > 24;

  return {
    last_updated: mostRecent.last_run_at,
    is_stale: isStale,
    tables: relevantTables,
  };
}
