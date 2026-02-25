import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface Agent {
  agent_id: string;
  agent_name: string;
}

interface AgentSummary {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  owner_email: string;
  total_unique_users: number;
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  total_est_cost_usd: number;
  satisfaction_rate: number;
  total_positive_reactions: number;
  total_negative_reactions: number;
  last_interacted_at: string;
  is_deleted: boolean;
}

interface AgentPerformance {
  date_day: string;
  agent_id: string;
  agent_name: string;
  unique_users: number;
  total_conversations: number;
  total_messages: number;
  avg_messages_per_conv: number;
  total_tokens: number;
  est_cost_usd: number;
  reactions_positive: number;
  reactions_negative: number;
}

interface AgentKPIs {
  active_agents: number;
  total_agent_cost: number;
  total_tokens: number;
  avg_unique_users_per_day: number;
  avg_messages_per_agent: number;
}

interface AgentDetail extends AgentSummary {
  daily_performance: AgentPerformance[];
  recent_conversations: {
    conversation_id: string;
    message_count: number;
    user_email: string;
    date: string;
    est_cost_usd: number;
  }[];
}

export default async function agentsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: ApiResponse<Agent[]> }>('/list', async (_request, reply) => {
    const cacheTTL = 3300; // 55 minutes
    const cacheKey = 'agents:list';

    try {
      const { rows, cached } = await queryWithCache<Agent>(
        cacheKey,
        cacheTTL,
        `SELECT agent_id, agent_name
         FROM gold.dim_agents
         WHERE is_deleted = false
         ORDER BY agent_name`
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
      throw new Error('Failed to fetch agents');
    }
  });

  // GET /api/v1/agents/summary?from=&to= (optional date filter)
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<AgentSummary[]> }>('/summary', async (request, reply) => {
    const { from, to } = request.query;
    const cacheTTL = 3300;
    const cacheKey = `agents:summary:${from || 'all'}:${to || 'all'}`;

    try {
      let sql: string;
      let params: string[] = [];

      if (from && to) {
        // Date-filtered summary derived from mart_llm_cost_by_user_model_day
        sql = `
          WITH filtered AS (
            SELECT
              c.agent_id,
              c.agent_name,
              COALESCE(SUM(c.total_requests), 0) as total_messages,
              COALESCE(SUM(c.total_tokens), 0) as total_tokens,
              COALESCE(SUM(c.est_cost_usd), 0) as total_est_cost_usd,
              COUNT(DISTINCT c.user_id) as total_unique_users
            FROM gold.mart_llm_cost_by_user_model_day c
            WHERE c.agent_id IS NOT NULL
              AND c.date_day >= $1 AND c.date_day <= $2
            GROUP BY c.agent_id, c.agent_name
          )
          SELECT
            f.agent_id,
            COALESCE(f.agent_name, a.agent_name) as agent_name,
            COALESCE(a.agent_type, 'unknown') as agent_type,
            '' as owner_email,
            f.total_unique_users,
            0 as total_conversations,
            f.total_messages,
            f.total_tokens,
            f.total_est_cost_usd,
            0 as satisfaction_rate,
            0 as total_positive_reactions,
            0 as total_negative_reactions,
            NULL as last_interacted_at,
            COALESCE(a.is_deleted, false) as is_deleted
          FROM filtered f
          LEFT JOIN gold.dim_agents a ON f.agent_id = a.agent_id
          ORDER BY f.total_messages DESC`;
        params = [from, to];
      } else {
        // Full summary from mart_agent_summary
        sql = `
          SELECT 
            agent_id,
            agent_name,
            agent_type,
            owner_email,
            COALESCE(total_unique_users, 0) as total_unique_users,
            COALESCE(total_conversations, 0) as total_conversations,
            COALESCE(total_messages, 0) as total_messages,
            COALESCE(total_tokens, 0) as total_tokens,
            COALESCE(total_est_cost_usd, 0) as total_est_cost_usd,
            COALESCE(
              CASE 
                WHEN (total_positive_reactions + total_negative_reactions) > 0
                THEN (total_positive_reactions::float / (total_positive_reactions + total_negative_reactions)) * 100
                ELSE 0
              END, 0
            ) as satisfaction_rate,
            COALESCE(total_positive_reactions, 0) as total_positive_reactions,
            COALESCE(total_negative_reactions, 0) as total_negative_reactions,
            last_interacted_at::text,
            is_deleted
          FROM gold.mart_agent_summary
          ORDER BY total_messages DESC`;
      }

      const { rows, cached } = await queryWithCache<AgentSummary>(
        cacheKey,
        cacheTTL,
        sql,
        params
      );

      return {
        data: rows,
        meta: {
          from,
          to,
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch agent summary');
    }
  });

  // GET /api/v1/agents/performance - derived from mart_llm_cost_by_user_model_day
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<AgentPerformance[]> }>(
    '/performance',
    async (request, reply) => {
      const { from, to, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `agents:performance:${from}:${to}:${agent_id || 'all'}`;
      const cacheTTL = 3300;

      try {
        let sql = `
          SELECT 
            date_day::text,
            agent_id,
            agent_name,
            COUNT(DISTINCT user_id)::int as unique_users,
            0 as total_conversations,
            COALESCE(SUM(total_requests), 0)::int as total_messages,
            0 as avg_messages_per_conv,
            COALESCE(SUM(total_tokens), 0)::bigint as total_tokens,
            COALESCE(SUM(est_cost_usd), 0)::float as est_cost_usd,
            0 as reactions_positive,
            0 as reactions_negative
          FROM gold.mart_llm_cost_by_user_model_day
          WHERE agent_id IS NOT NULL
            AND date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];

        if (agent_id) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(agent_id);
        }

        sql += ` GROUP BY date_day, agent_id, agent_name ORDER BY date_day, agent_name`;

        const { rows, cached } = await queryWithCache<AgentPerformance>(
          cacheKey,
          cacheTTL,
          sql,
          params
        );

        return {
          data: rows,
          meta: {
            from,
            to,
            generated_at: new Date().toISOString(),
            cached,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch agent performance');
      }
    }
  );

  // GET /api/v1/agents/kpis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<AgentKPIs> }>(
    '/kpis',
    async (request, reply) => {
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `agents:kpis:${from}:${to}`;
      const cacheTTL = 3300;

      try {
        // Derive KPIs from mart_llm_cost_by_user_model_day (date-filtered)
        const sql = `
          WITH daily AS (
            SELECT
              date_day,
              agent_id,
              COALESCE(SUM(total_requests), 0) as day_messages,
              COALESCE(SUM(total_tokens), 0) as day_tokens,
              COALESCE(SUM(est_cost_usd), 0) as day_cost,
              COUNT(DISTINCT user_id) as day_unique_users
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE agent_id IS NOT NULL
              AND date_day >= $1 AND date_day <= $2
            GROUP BY date_day, agent_id
          ),
          daily_users AS (
            SELECT date_day, SUM(day_unique_users) as total_unique_users
            FROM daily
            GROUP BY date_day
          )
          SELECT
            COUNT(DISTINCT d.agent_id)::int as active_agents,
            COALESCE(SUM(d.day_cost), 0)::float as total_agent_cost,
            COALESCE(SUM(d.day_tokens), 0)::bigint as total_tokens,
            COALESCE((SELECT AVG(total_unique_users) FROM daily_users), 0)::float as avg_unique_users_per_day,
            CASE
              WHEN COUNT(DISTINCT d.agent_id) > 0
              THEN (COALESCE(SUM(d.day_messages), 0)::float / COUNT(DISTINCT d.agent_id))
              ELSE 0
            END as avg_messages_per_agent
          FROM daily d
        `;

        const { rows, cached } = await queryWithCache<AgentKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          [from, to]
        );

        const defaultKpis: AgentKPIs = {
          active_agents: 0,
          total_agent_cost: 0,
          total_tokens: 0,
          avg_unique_users_per_day: 0,
          avg_messages_per_agent: 0,
        };

        return {
          data: rows.length > 0 ? rows[0] : defaultKpis,
          meta: {
            from,
            to,
            generated_at: new Date().toISOString(),
            cached,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch agent KPIs');
      }
    }
  );

  // GET /api/v1/agents/:agentId
  fastify.get<{
    Params: { agentId: string };
    Querystring: QueryParams;
    Reply: ApiResponse<AgentDetail>;
  }>('/:agentId', async (request, reply) => {
    const { agentId } = request.params;
    const { from, to } = request.query;

    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `agents:detail:${agentId}:${from}:${to}`;
    const cacheTTL = 3300;

    try {
      // Get agent summary
      const summaryResult = await queryWithCache<AgentSummary>(
        cacheKey + ':summary',
        cacheTTL,
        `SELECT 
          agent_id,
          agent_name,
          agent_type,
          owner_email,
          total_unique_users,
          total_conversations,
          total_messages,
          total_tokens,
          total_est_cost_usd,
          COALESCE(
            CASE 
              WHEN (total_positive_reactions + total_negative_reactions) > 0
              THEN (total_positive_reactions::float / (total_positive_reactions + total_negative_reactions)) * 100
              ELSE 0
            END, 0
          ) as satisfaction_rate,
          total_positive_reactions,
          total_negative_reactions,
          last_interacted_at::text,
          is_deleted
         FROM gold.mart_agent_summary
         WHERE agent_id = $1`,
        [agentId]
      );

      if (summaryResult.rows.length === 0) {
        reply.code(404);
        throw new Error('Agent not found');
      }

      const summary = summaryResult.rows[0];

      // Get daily performance
      const performanceResult = await queryWithCache<AgentPerformance>(
        cacheKey + ':performance',
        cacheTTL,
        `SELECT 
          date_day::text,
          agent_id,
          agent_name,
          unique_users,
          total_conversations,
          total_messages,
          avg_messages_per_conv,
          est_cost_usd,
          reactions_positive,
          reactions_negative
         FROM gold.mart_agent_performance_daily
         WHERE agent_id = $1 AND date_day >= $2 AND date_day <= $3
         ORDER BY date_day`,
        [agentId, from, to]
      );

      // Get recent conversations
      const conversationsResult = await queryWithCache<{
        conversation_id: string;
        message_count: number;
        user_email: string;
        date: string;
        est_cost_usd: number;
      }>(
        cacheKey + ':conversations',
        cacheTTL,
        `SELECT 
          m.conversation_id,
          COUNT(*) as message_count,
          MAX(u.email) as user_email,
          MAX(m.message_created_at)::text as date,
          COALESCE(SUM(t.est_cost_usd), 0) as est_cost_usd
         FROM gold.fact_messages m
         LEFT JOIN gold.dim_users u ON m.user_key = u.user_key
         LEFT JOIN gold.fact_model_transactions t 
           ON m.conversation_id = t.transaction_id::text
         WHERE m.agent_key IN (
           SELECT agent_key FROM gold.dim_agents WHERE agent_id = $1
         )
         AND m.message_created_at >= $2 AND m.message_created_at <= $3
         GROUP BY m.conversation_id
         ORDER BY date DESC
         LIMIT 20`,
        [agentId, from, to + 'T23:59:59']
      );

      const detail: AgentDetail = {
        ...summary,
        daily_performance: performanceResult.rows,
        recent_conversations: conversationsResult.rows,
      };

      return {
        data: detail,
        meta: {
          from,
          to,
          generated_at: new Date().toISOString(),
          cached: summaryResult.cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch agent detail');
    }
  });
}
