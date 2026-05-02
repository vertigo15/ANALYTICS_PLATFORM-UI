import { FastifyInstance } from 'fastify';
import { queryWithCache, getUserJoinCol } from '../db';
import { ApiResponse, QueryParams } from '../types';

// ── Types ──────────────────────────────────────────────────────────

interface AnalyticsKPIs {
  total_conversations: number;
  avg_response_time_sec: number;
  avg_turns_per_conversation: number;
  tool_call_rate: number;
}

interface ConversationRow {
  conversation_id: string;
  title: string | null;
  date: string;
  user_email: string;
  turns: number;
  duration_sec: number;
  outcome: string;
  has_tool_calls: boolean;
  likes: number;
  dislikes: number;
}

interface ConversationListResponse {
  rows: ConversationRow[];
  total: number;
}

interface OutcomeBreakdownRow {
  outcome: string;
  count: number;
  percentage: number;
}

interface ResponseTimeTrend {
  date_day: string;
  avg_response_time_sec: number;
}

interface DepthOverTimeRow {
  date_day: string;
  avg_turns: number;
  total_conversations: number;
}

interface ConversationMessageRow {
  message_id: string;
  role: string;
  content: string;
  agent_id: string | null;
  agent_name: string | null;
  has_tool_calls: boolean;
  finish_reason: string | null;
  reaction_type: string | null;
  timestamp: string;
  latency_ms: number | null;
  tool_calls: string | null;
  user_email: string | null;
}

interface AgentHandoff {
  agent_id: string;
  agent_name: string;
  order_index: number;
  start_time: string;
  end_time: string;
  latency_ms: number;
  status: string;
  message_count: number;
}

interface ConversationDetailResponse {
  conversation_id: string;
  date: string;
  duration_sec: number;
  turns: number;
  user_email: string | null;
  outcome: string;
  has_tool_calls: boolean;
  positive_reactions: number;
  negative_reactions: number;
  agents_involved: string[];
  handoffs: AgentHandoff[];
  messages: ConversationMessageRow[];
}

// ── Routes ─────────────────────────────────────────────────────────

export default async function analyticsRoutes(fastify: FastifyInstance) {

  // ── KPIs ───────────────────────────────────────────────────────
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<AnalyticsKPIs> }>(
    '/kpis',
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `analytics:kpis:${from}:${to}`;
      const cacheTTL = 3300;

      try {
        const sql = `
          WITH response_pairs AS (
            SELECT
              conversation_id,
              message_created_at,
              role,
              LEAD(message_created_at) OVER (
                PARTITION BY conversation_id ORDER BY message_created_at
              ) AS next_ts,
              LEAD(role) OVER (
                PARTITION BY conversation_id ORDER BY message_created_at
              ) AS next_role
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
          ),
          conversations AS (
            SELECT
              conversation_id,
              COUNT(*)::int AS turns
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
            GROUP BY conversation_id
            HAVING COUNT(*) >= 2
          ),
          assistant_stats AS (
            SELECT
              COUNT(*)::int AS total_assistant_msgs,
              SUM(CASE WHEN has_tool_calls THEN 1 ELSE 0 END)::int AS tool_call_msgs
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
              AND role = 'assistant'
          )
          SELECT
            (SELECT COUNT(*)::int FROM conversations) AS total_conversations,
            COALESCE(
              (SELECT AVG(EXTRACT(EPOCH FROM next_ts - message_created_at))::float
               FROM response_pairs WHERE role = 'user' AND next_role = 'assistant'),
              0
            ) AS avg_response_time_sec,
            COALESCE(
              (SELECT AVG(turns)::float FROM conversations),
              0
            ) AS avg_turns_per_conversation,
            COALESCE(
              (SELECT (tool_call_msgs::float / NULLIF(total_assistant_msgs, 0)) * 100 FROM assistant_stats),
              0
            )::float AS tool_call_rate
        `;

        const { rows, cached } = await queryWithCache<AnalyticsKPIs>(
          cacheKey, cacheTTL, sql, [from, to]
        );

        const defaults: AnalyticsKPIs = {
          total_conversations: 0,
          avg_response_time_sec: 0,
          avg_turns_per_conversation: 0,
          tool_call_rate: 0,
        };

        return {
          data: rows.length > 0 ? rows[0] : defaults,
          meta: { from, to, generated_at: new Date().toISOString(), cached },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch analytics KPIs');
      }
    }
  );

  // ── Conversations list (paginated) ─────────────────────────────
  fastify.get<{
    Querystring: QueryParams & { page?: string; pageSize?: string };
    Reply: ApiResponse<ConversationListResponse>;
  }>('/conversations', async (request, reply) => {
    const userJoinCol = await getUserJoinCol();
    const { from, to, organization_id } = request.query;
    const page = Math.max(1, parseInt(request.query.page || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize || '25')));
    const offset = (page - 1) * pageSize;

    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `analytics:conversations:${from}:${to}:${page}:${pageSize}:${organization_id || 'all'}`;
    const cacheTTL = 3300;

    try {
      let orgFilter = '';
      const baseParams: (string | number | null)[] = [from, to];
      if (organization_id) {
        orgFilter = `AND m.${userJoinCol} IN (SELECT ${userJoinCol} FROM gold.dim_users WHERE organization_id = $${baseParams.length + 1})`;
        baseParams.push(organization_id);
      }
      const paginationOffset = baseParams.length;
      const dataParams = [...baseParams, pageSize, offset];
      const countParams = [...baseParams];

      const sql = `
        WITH conv AS (
          SELECT
            m.conversation_id,
            MAX(m.message_created_at)::text AS date,
            MIN(du.email) AS user_email,
            COUNT(*)::int AS turns,
            EXTRACT(EPOCH FROM (MAX(m.message_created_at) - MIN(m.message_created_at)))::int AS duration_sec,
            (ARRAY_AGG(m.role ORDER BY m.message_created_at DESC))[1] AS last_role,
            BOOL_OR(m.has_tool_calls) AS has_tool_calls,
            SUM(CASE WHEN m.reaction_type = 'like' THEN 1 ELSE 0 END)::int AS likes,
            SUM(CASE WHEN m.reaction_type = 'dislike' THEN 1 ELSE 0 END)::int AS dislikes
          FROM gold.fact_messages m
          LEFT JOIN gold.dim_users du ON m.${userJoinCol} = du.${userJoinCol}
          WHERE m.message_created_at >= $1::timestamp
            AND m.message_created_at <= ($2::date + INTERVAL '1 day')
            ${orgFilter}
          GROUP BY m.conversation_id
          HAVING COUNT(*) >= 2
        )
        SELECT
          c.conversation_id,
          sc.title,
          c.date,
          COALESCE(c.user_email, 'Unknown') AS user_email,
          c.turns,
          COALESCE(c.duration_sec, 0) AS duration_sec,
          CASE
            WHEN c.last_role = 'assistant' THEN 'Completed'
            ELSE 'Abandoned'
          END AS outcome,
          c.has_tool_calls,
          c.likes,
          c.dislikes
        FROM conv c
        LEFT JOIN silver.conversations sc ON sc.conversation_id = c.conversation_id
        ORDER BY c.date DESC
        LIMIT $${paginationOffset + 1} OFFSET $${paginationOffset + 2}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS total FROM (
          SELECT m.conversation_id
          FROM gold.fact_messages m
          WHERE m.message_created_at >= $1::timestamp
            AND m.message_created_at <= ($2::date + INTERVAL '1 day')
            ${orgFilter}
          GROUP BY m.conversation_id
          HAVING COUNT(*) >= 2
        ) sub
      `;

      const [dataResult, countResult] = await Promise.all([
        queryWithCache<ConversationRow>(cacheKey, cacheTTL, sql, dataParams),
        queryWithCache<{ total: number }>(cacheKey + ':count', cacheTTL, countSql, countParams),
      ]);

      return {
        data: {
          rows: dataResult.rows,
          total: countResult.rows[0]?.total || 0,
        },
        meta: { from, to, generated_at: new Date().toISOString(), cached: dataResult.cached },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch conversations');
    }
  });

  // ── Outcome Breakdown ────────────────────────────────────────
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<OutcomeBreakdownRow[]> }>(
    '/outcome-breakdown',
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `analytics:outcome-breakdown:${from}:${to}`;
      const cacheTTL = 3300;

      try {
        const sql = `
          WITH conv AS (
            SELECT
              conversation_id,
              (ARRAY_AGG(role ORDER BY message_created_at DESC))[1] AS last_role,
              BOOL_OR(has_tool_calls) AS used_tools
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
            GROUP BY conversation_id
            HAVING COUNT(*) >= 2
          ),
          categorized AS (
            SELECT
              CASE WHEN last_role = 'assistant' THEN 'Completed' ELSE 'Abandoned' END AS outcome,
              COUNT(*)::int AS count
            FROM conv
            GROUP BY 1
          )
          SELECT
            outcome,
            count,
            ROUND((count::numeric / NULLIF(SUM(count) OVER (), 0)) * 100, 1)::float AS percentage
          FROM categorized
          ORDER BY count DESC
        `;

        const { rows, cached } = await queryWithCache<OutcomeBreakdownRow>(
          cacheKey, cacheTTL, sql, [from, to]
        );

        return {
          data: rows,
          meta: { from, to, generated_at: new Date().toISOString(), cached },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch outcome breakdown');
      }
    }
  );

  // ── Response Time Trend (daily) ────────────────────────────────
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<ResponseTimeTrend[]> }>(
    '/response-time-by-agent',
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `analytics:resp-time:${from}:${to}`;
      const cacheTTL = 3300;

      try {
        const sql = `
          WITH msg_pairs AS (
            SELECT
              DATE(message_created_at) AS date_day,
              message_created_at,
              role,
              LEAD(message_created_at) OVER (
                PARTITION BY conversation_id ORDER BY message_created_at
              ) AS next_ts,
              LEAD(role) OVER (
                PARTITION BY conversation_id ORDER BY message_created_at
              ) AS next_role
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
          )
          SELECT
            date_day::text,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM next_ts - message_created_at)),
              0
            )::float AS avg_response_time_sec
          FROM msg_pairs
          WHERE role = 'user' AND next_role = 'assistant'
          GROUP BY date_day
          ORDER BY date_day
        `;

        const { rows, cached } = await queryWithCache<ResponseTimeTrend>(
          cacheKey, cacheTTL, sql, [from, to]
        );

        return {
          data: rows,
          meta: { from, to, generated_at: new Date().toISOString(), cached },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch response time trend');
      }
    }
  );

  // ── Conversation Depth Over Time ───────────────────────────────
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DepthOverTimeRow[]> }>(
    '/depth-over-time',
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `analytics:depth:${from}:${to}`;
      const cacheTTL = 3300;

      try {
        const sql = `
          WITH conv_daily AS (
            SELECT
              conversation_id,
              DATE(MIN(message_created_at)) AS date_day,
              COUNT(*)::int AS turns
            FROM gold.fact_messages
            WHERE message_created_at >= $1::timestamp
              AND message_created_at <= ($2::date + INTERVAL '1 day')
            GROUP BY conversation_id
            HAVING COUNT(*) >= 2
          )
          SELECT
            date_day::text,
            AVG(turns)::float AS avg_turns,
            COUNT(*)::int AS total_conversations
          FROM conv_daily
          GROUP BY date_day
          ORDER BY date_day
        `;

        const { rows, cached } = await queryWithCache<DepthOverTimeRow>(
          cacheKey, cacheTTL, sql, [from, to]
        );

        return {
          data: rows,
          meta: { from, to, generated_at: new Date().toISOString(), cached },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch depth over time');
      }
    }
  );

  // ── Single Conversation Detail (Drill-Down) ────────────────────
  fastify.get<{
    Params: { conversationId: string };
    Reply: ApiResponse<ConversationDetailResponse>;
  }>('/conversations/:conversationId', async (request, reply) => {
    const { conversationId } = request.params;

    const userJoinCol = await getUserJoinCol();
    const cacheKey = `analytics:conv-detail:${conversationId}`;
    const cacheTTL = 3300;

    try {
      const messagesSql = `
        WITH ordered AS (
          SELECT
            m.message_id,
            m.message_id::text AS msg_id_text,
            m.role,
            m.has_tool_calls,
            m.finish_reason,
            m.reaction_type,
            m.message_created_at::text AS timestamp,
            du.email AS user_email,
            LAG(m.message_created_at) OVER (ORDER BY m.message_created_at) AS prev_ts,
            m.message_created_at AS raw_ts
          FROM gold.fact_messages m
          LEFT JOIN gold.dim_users du ON m.${userJoinCol} = du.${userJoinCol}
          WHERE m.conversation_id = $1
        ),
        content_agg AS (
          SELECT
            cb.message_id,
            STRING_AGG(
              CASE WHEN cb.block_type = 'message' THEN cb.text_content ELSE NULL END,
              E'\n' ORDER BY cb.sequence
            ) AS text_content,
            STRING_AGG(
              CASE WHEN cb.block_type = 'function_call' THEN cb.content_json->>'name' ELSE NULL END,
              ', ' ORDER BY cb.sequence
            ) AS tool_names
          FROM gold.fact_message_content_blocks cb
          WHERE cb.message_id IN (SELECT message_id FROM ordered)
          GROUP BY cb.message_id
        )
        SELECT
          o.msg_id_text AS message_id,
          o.role,
          COALESCE(c.text_content, '') AS content,
          NULL::text AS agent_id,
          NULL::text AS agent_name,
          o.has_tool_calls,
          o.finish_reason,
          o.reaction_type,
          o.timestamp,
          o.user_email,
          c.tool_names AS tool_calls,
          CASE
            WHEN o.prev_ts IS NOT NULL
              THEN (EXTRACT(EPOCH FROM (o.raw_ts - o.prev_ts)) * 1000)::int
            ELSE NULL
          END AS latency_ms
        FROM ordered o
        LEFT JOIN content_agg c ON o.message_id = c.message_id
        ORDER BY o.raw_ts ASC
      `;

      const { rows: messages, cached } = await queryWithCache<ConversationMessageRow>(
        cacheKey + ':messages', cacheTTL, messagesSql, [conversationId]
      );

      if (messages.length === 0) {
        reply.code(404);
        throw new Error('Conversation not found');
      }

      const firstTs = new Date(messages[0].timestamp).getTime();
      const lastTs = new Date(messages[messages.length - 1].timestamp).getTime();
      const lastRole = messages[messages.length - 1].role;

      const detail: ConversationDetailResponse = {
        conversation_id: conversationId,
        date: messages[0].timestamp,
        duration_sec: Math.round((lastTs - firstTs) / 1000),
        turns: messages.length,
        user_email: messages.find(m => m.user_email)?.user_email || null,
        outcome: lastRole === 'assistant' ? 'Completed' : 'Abandoned',
        has_tool_calls: messages.some(m => m.has_tool_calls),
        positive_reactions: messages.filter(m => m.reaction_type === 'like').length,
        negative_reactions: messages.filter(m => m.reaction_type === 'dislike').length,
        agents_involved: [],
        handoffs: [],
        messages,
      };

      return {
        data: detail,
        meta: { generated_at: new Date().toISOString(), cached },
      };
    } catch (error) {
      fastify.log.error(error);
      if (!reply.sent) {
        reply.code(500);
        throw new Error('Failed to fetch conversation detail');
      }
      throw error;
    }
  });
}
