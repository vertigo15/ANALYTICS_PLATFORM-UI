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

interface AgentLatencyKPIs {
  avg_latency_sec: number;
  p95_latency_sec: number;
  avg_ttft_ms: number | null;
  avg_tokens_per_sec: number | null;
  agents_with_latency: number;
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
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<Agent[]> }>('/list', async (request, reply) => {
    const { organization_id } = request.query;
    const cacheTTL = 3300; // 55 minutes
    const cacheKey = `agents:list:${organization_id || 'all'}`;
    const params = organization_id ? [organization_id] : [];
    const sql = organization_id
      ? `SELECT DISTINCT c.agent_id, COALESCE(c.agent_name, a.agent_name) AS agent_name
         FROM gold.mart_llm_cost_by_user_model_day c
         LEFT JOIN gold.dim_agents a ON c.agent_id = a.agent_id
         WHERE c.agent_id IS NOT NULL
           AND c.user_id IN (
             SELECT user_id FROM gold.dim_users WHERE organization_id = $1
           )
         ORDER BY agent_name`
      : `SELECT agent_id, agent_name
         FROM gold.dim_agents
         WHERE is_deleted = false
         ORDER BY agent_name`;

    try {
      const { rows, cached } = await queryWithCache<Agent>(
        cacheKey,
        cacheTTL,
        sql,
        params
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
    const { from, to, organization_id } = request.query;
    const cacheTTL = 3300;
    const cacheKey = `agents:summary:${from || 'all'}:${to || 'all'}:${organization_id || 'all'}`;

    try {
      let sql: string;
      let params: string[] = [];

      if (from && to) {
        // Date-filtered summary derived from mart_llm_cost_by_user_model_day
        params = [from, to];
        let orgFilter = '';
        if (organization_id) {
          orgFilter = `AND c.user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $3)`;
          params.push(organization_id);
        }
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
              AND c.date_day >= $1 AND c.date_day <= $2 ${orgFilter}
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
      const { from, to, agent_id, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `agents:performance:${from}:${to}:${agent_id || 'all'}:${organization_id || 'all'}`;
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

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.length + 1})`;
          params.push(organization_id);
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
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `agents:kpis:${from}:${to}:${organization_id || 'all'}`;
      const cacheTTL = 3300;

      try {
        const kpiParams: (string | null)[] = [from, to];
        let costOrgFilter = '';
        let messageOrgFilter = '';
        if (organization_id) {
          costOrgFilter = `AND user_id IN (
            SELECT user_id FROM gold.dim_users WHERE organization_id = $3
          )`;
          messageOrgFilter = `AND user_id IN (
            SELECT user_id FROM gold.dim_users WHERE organization_id = $3
          )`;
          kpiParams.push(organization_id);
        }

        const sql = `
          WITH cost_totals AS (
            SELECT
              COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
              COALESCE(SUM(est_cost_usd), 0)::float AS total_agent_cost
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE agent_id IS NOT NULL
              AND date_day >= $1::date
              AND date_day <= $2::date
              ${costOrgFilter}
          ),
          daily_users AS (
            SELECT
              DATE(message_created_at) AS date_day,
              COUNT(DISTINCT user_id)::integer AS distinct_users
            FROM gold.fact_messages
            WHERE agent_id IS NOT NULL
              AND message_created_at >= $1::timestamp
              AND message_created_at < ($2::date + INTERVAL '1 day')
              ${messageOrgFilter}
            GROUP BY DATE(message_created_at)
          ),
          message_totals AS (
            SELECT
              COUNT(*)::bigint AS total_messages,
              COUNT(DISTINCT agent_id)::integer AS active_agents
            FROM gold.fact_messages
            WHERE agent_id IS NOT NULL
              AND message_created_at >= $1::timestamp
              AND message_created_at < ($2::date + INTERVAL '1 day')
              ${messageOrgFilter}
          )
          SELECT
            mt.active_agents,
            ct.total_agent_cost,
            ct.total_tokens,
            COALESCE((SELECT AVG(distinct_users) FROM daily_users), 0)::float as avg_unique_users_per_day,
            CASE
              WHEN mt.active_agents > 0
              THEN mt.total_messages::float / mt.active_agents
              ELSE 0
            END as avg_messages_per_agent
          FROM cost_totals ct
          CROSS JOIN message_totals mt
        `;

        const { rows, cached } = await queryWithCache<AgentKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          kpiParams
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
    const { from, to, organization_id } = request.query;

    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `agents:detail:${agentId}:${from}:${to}:${organization_id || 'all'}`;
    const cacheTTL = 3300;
    const summaryParams = organization_id
      ? [from, to, agentId, organization_id]
      : [from, to, agentId];
    const detailParams = organization_id
      ? [agentId, from, to, organization_id]
      : [agentId, from, to];
    const summaryOrgFilter = organization_id
      ? `AND c.user_id IN (
          SELECT user_id FROM gold.dim_users WHERE organization_id = $4
        )`
      : '';
    const detailOrgFilter = organization_id
      ? `AND user_id IN (
          SELECT user_id FROM gold.dim_users WHERE organization_id = $4
        )`
      : '';
    const conversationOrgFilter = organization_id
      ? `AND m.user_id IN (
          SELECT user_id FROM gold.dim_users WHERE organization_id = $4
        )`
      : '';

    try {
      // Derive the summary from organization-filterable activity rather than a global mart.
      const summaryResult = await queryWithCache<AgentSummary>(
        cacheKey + ':summary',
        cacheTTL,
        `WITH filtered AS (
           SELECT
             c.agent_id,
             MAX(c.agent_name) AS agent_name,
             COUNT(DISTINCT c.user_id)::int AS total_unique_users,
             COALESCE(SUM(c.total_requests), 0)::int AS total_messages,
             COALESCE(SUM(c.total_tokens), 0)::bigint AS total_tokens,
             COALESCE(SUM(c.est_cost_usd), 0)::float AS total_est_cost_usd,
             MAX(c.date_day)::text AS last_interacted_at
           FROM gold.mart_llm_cost_by_user_model_day c
           WHERE c.date_day >= $1::date
             AND c.date_day <= $2::date
             AND c.agent_id = $3
             ${summaryOrgFilter}
           GROUP BY c.agent_id
         )
         SELECT
           f.agent_id,
           COALESCE(f.agent_name, a.agent_name) AS agent_name,
           COALESCE(a.agent_type, 'unknown') AS agent_type,
           COALESCE(a.owner_email, '') AS owner_email,
           f.total_unique_users,
           0::int AS total_conversations,
           f.total_messages,
           f.total_tokens,
           f.total_est_cost_usd,
           0::float AS satisfaction_rate,
           0::int AS total_positive_reactions,
           0::int AS total_negative_reactions,
           f.last_interacted_at,
           COALESCE(a.is_deleted, false) AS is_deleted
         FROM filtered f
         LEFT JOIN gold.dim_agents a ON f.agent_id = a.agent_id`,
        summaryParams
      );

      if (summaryResult.rows.length === 0) {
        reply.code(404);
        throw new Error('Agent not found');
      }

      const summary = summaryResult.rows[0];

      // Get daily performance from the same organization-filterable source.
      const performanceResult = await queryWithCache<AgentPerformance>(
        cacheKey + ':performance',
        cacheTTL,
        `SELECT 
          date_day::text,
          agent_id,
          agent_name,
          COUNT(DISTINCT user_id)::int AS unique_users,
          0::int AS total_conversations,
          COALESCE(SUM(total_requests), 0)::int AS total_messages,
          0::float AS avg_messages_per_conv,
          COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
          COALESCE(SUM(est_cost_usd), 0)::float AS est_cost_usd,
          0::int AS reactions_positive,
          0::int AS reactions_negative
         FROM gold.mart_llm_cost_by_user_model_day
         WHERE agent_id = $1
           AND date_day >= $2::date
           AND date_day <= $3::date
           ${detailOrgFilter}
         GROUP BY date_day, agent_id, agent_name
         ORDER BY date_day`,
        detailParams
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
         LEFT JOIN gold.dim_users u ON m.user_id = u.user_id
         LEFT JOIN (
           SELECT message_id, SUM(est_cost_usd) AS est_cost_usd
           FROM gold.fact_model_transactions
           WHERE message_id IS NOT NULL
           GROUP BY message_id
         ) t ON t.message_id = m.message_id
         WHERE m.agent_id = $1
         AND m.message_created_at >= $2::timestamp
         AND m.message_created_at < ($3::date + INTERVAL '1 day')
         ${conversationOrgFilter}
         GROUP BY m.conversation_id
         ORDER BY date DESC
         LIMIT 20`,
        detailParams
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
  // GET /api/v1/agents/latency — response time KPIs from raw fact rows
  fastify.get<{ Querystring: QueryParams }>('/latency', async (request, reply) => {
    const { from, to, organization_id } = request.query;
    if (!from || !to) { reply.code(400); throw new Error('from and to required'); }

    const cacheKey = `agents:latency:${from}:${to}:${organization_id || 'all'}`;
    const cacheTTL = 3300;
    try {
      const params: (string | null)[] = [from, to];
      let messageOrgFilter = '';
      let transactionOrgFilter = '';
      if (organization_id) {
        messageOrgFilter = `AND fm.user_id IN (
          SELECT user_id FROM gold.dim_users WHERE organization_id = $3
        )`;
        transactionOrgFilter = `AND fmt.user_id IN (
          SELECT user_id FROM gold.dim_users WHERE organization_id = $3
        )`;
        params.push(organization_id);
      }

      const { rows, cached } = await queryWithCache<AgentLatencyKPIs>(
        cacheKey, cacheTTL,
        `WITH message_stats AS (
           SELECT
             AVG(fm.response_latency_seconds)::numeric AS avg_latency_sec,
             PERCENTILE_CONT(0.95) WITHIN GROUP (
               ORDER BY fm.response_latency_seconds
             )::numeric AS p95_latency_sec,
             COUNT(DISTINCT fm.agent_id)::integer AS agents_with_latency
           FROM gold.fact_messages fm
           WHERE fm.agent_id IS NOT NULL
             AND fm.response_latency_seconds IS NOT NULL
             AND fm.response_latency_seconds >= 0
             AND fm.message_created_at >= $1::timestamp
             AND fm.message_created_at < ($2::date + INTERVAL '1 day')
             ${messageOrgFilter}
         ),
         transaction_stats AS (
           SELECT
             AVG(NULLIF(fmt.ttft_ms, 0))::numeric AS avg_ttft_ms,
             AVG(NULLIF(fmt.output_tokens_per_second, 0))::numeric AS avg_tokens_per_sec
           FROM gold.fact_model_transactions fmt
           WHERE fmt.agent_id IS NOT NULL
             AND fmt.transacted_at >= $1::timestamp
             AND fmt.transacted_at < ($2::date + INTERVAL '1 day')
             ${transactionOrgFilter}
         )
         SELECT
           ROUND(COALESCE(ms.avg_latency_sec, 0), 2)::float AS avg_latency_sec,
           ROUND(COALESCE(ms.p95_latency_sec, 0), 2)::float AS p95_latency_sec,
           ROUND(ts.avg_ttft_ms, 0)::float AS avg_ttft_ms,
           ROUND(ts.avg_tokens_per_sec, 2)::float AS avg_tokens_per_sec,
           COALESCE(ms.agents_with_latency, 0)::int AS agents_with_latency
         FROM message_stats ms
         CROSS JOIN transaction_stats ts`,
        params
      );

      const defaults: AgentLatencyKPIs = {
        avg_latency_sec: 0, p95_latency_sec: 0,
        avg_ttft_ms: null, avg_tokens_per_sec: null, agents_with_latency: 0,
      };
      return {
        data: rows[0] ?? defaults,
        meta: { from, to, generated_at: new Date().toISOString(), cached },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch agent latency');
    }
  });

}
