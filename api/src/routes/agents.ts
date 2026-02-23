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
  est_cost_usd: number;
  reactions_positive: number;
  reactions_negative: number;
}

interface AgentKPIs {
  current: {
    active_agents: number;
    total_conversations: number;
    avg_satisfaction_rate: number;
    most_used_agent: { agent_id: string; agent_name: string; total_conversations: number } | null;
  };
  previous: {
    active_agents: number;
    total_conversations: number;
    avg_satisfaction_rate: number;
  };
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

  // GET /api/v1/agents/summary
  fastify.get<{ Reply: ApiResponse<AgentSummary[]> }>('/summary', async (_request, reply) => {
    const cacheTTL = 3300;
    const cacheKey = 'agents:summary';

    try {
      const { rows, cached } = await queryWithCache<AgentSummary>(
        cacheKey,
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
         ORDER BY total_conversations DESC`
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
      throw new Error('Failed to fetch agent summary');
    }
  });

  // GET /api/v1/agents/performance
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
            unique_users,
            total_conversations,
            total_messages,
            avg_messages_per_conv,
            est_cost_usd,
            reactions_positive,
            reactions_negative
          FROM gold.mart_agent_performance_daily
          WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];

        if (agent_id) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(agent_id);
        }

        sql += ` ORDER BY date_day, agent_name`;

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
        // Use mart_agent_summary since mart_agent_performance_daily may be empty
        const sql = `
          WITH summary_stats AS (
            SELECT 
              COUNT(*) FILTER (WHERE total_messages > 0 AND is_deleted = false) as active_agents,
              COALESCE(SUM(total_messages), 0) as total_conversations,
              COALESCE(AVG(
                CASE 
                  WHEN (total_positive_reactions + total_negative_reactions) > 0
                  THEN (total_positive_reactions::float / (total_positive_reactions + total_negative_reactions)) * 100
                  ELSE NULL
                END
              ), 0) as avg_satisfaction_rate
            FROM gold.mart_agent_summary
            WHERE is_deleted = false
          ),
          most_used AS (
            SELECT 
              agent_id,
              agent_name,
              total_messages as total_conversations
            FROM gold.mart_agent_summary
            WHERE is_deleted = false AND total_messages > 0
            ORDER BY total_messages DESC
            LIMIT 1
          )
          SELECT 
            json_build_object(
              'active_agents', COALESCE(ss.active_agents, 0),
              'total_conversations', COALESCE(ss.total_conversations, 0),
              'avg_satisfaction_rate', COALESCE(ss.avg_satisfaction_rate, 0),
              'most_used_agent', CASE 
                WHEN mu.agent_id IS NOT NULL THEN json_build_object(
                  'agent_id', mu.agent_id,
                  'agent_name', mu.agent_name,
                  'total_conversations', mu.total_conversations
                )
                ELSE NULL
              END
            ) as current,
            json_build_object(
              'active_agents', 0,
              'total_conversations', 0,
              'avg_satisfaction_rate', 0
            ) as previous
          FROM summary_stats ss
          LEFT JOIN most_used mu ON true
        `;

        const { rows, cached } = await queryWithCache<AgentKPIs>(
          cacheKey,
          cacheTTL,
          sql
        );

        if (rows.length === 0) {
          return {
            data: {
              current: {
                active_agents: 0,
                total_conversations: 0,
                avg_satisfaction_rate: 0,
                most_used_agent: null,
              },
              previous: {
                active_agents: 0,
                total_conversations: 0,
                avg_satisfaction_rate: 0,
              },
            },
            meta: {
              from,
              to,
              generated_at: new Date().toISOString(),
              cached,
            },
          };
        }

        return {
          data: rows[0],
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
