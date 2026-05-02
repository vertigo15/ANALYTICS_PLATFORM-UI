import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface UserKPIs {
  current: {
    dau: number;
    wau: number;
    mau: number;
    new_users: number;
    new_active_users: number;
    interactions_per_dau: number;
    churn_rate: number;
  };
  previous: {
    dau: number;
    wau: number;
    mau: number;
    new_users: number;
    new_active_users: number;
    interactions_per_dau: number;
    churn_rate: number;
  };
  dau_sparkline: number[];
  wau_sparkline: number[];
}

interface DailyActivity {
  date_day: string;
  dau: number;
  dau_7d_ma: number;
  messages_sent: number;
  total_tokens: number;
  est_cost_usd: number;
}

interface ActivityHeatmap {
  day_of_week: number;
  hour: number;
  message_count: number;
  distinct_users: number;
}

interface UserSummary {
  user_id: string;
  email: string;
  org: string | null;
  conversations: number;
  messages: number;
  tokens: number;
  cost: number;
  last_active_at: string | null;
  account_created_at: string;
  is_deleted: boolean;
}

interface UserDetail {
  user_id: string;
  email: string;
  org: string | null;
  account_created_at: string;
  total_conversations: number;
  total_messages: number;
  total_est_cost_usd: number;
  unique_agents_used: number;
  daily_activity: {
    date_day: string;
    messages_sent: number;
  }[];
  cost_by_model: {
    model_name: string;
    est_cost_usd: number;
  }[];
  recent_conversations: {
    conversation_id: string;
    agent_name: string | null;
    message_count: number;
    last_message_at: string;
    est_cost_usd: number;
  }[];
}

export default async function usersRoutes(fastify: FastifyInstance) {
  const cacheTTL = 3300; // 55 minutes

  // GET /api/v1/users/kpis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<UserKPIs> }>(
    '/kpis',
    async (request, reply) => {
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `users:kpis:${from}:${to}`;

      try {
        // Calculate previous period and date ranges
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const duration = toDate.getTime() - fromDate.getTime();
        const prevTo = new Date(fromDate.getTime() - 86400000);
        const prevFrom = new Date(prevTo.getTime() - duration);

        const prevFromStr = prevFrom.toISOString().split('T')[0];
        const prevToStr = prevTo.toISOString().split('T')[0];
        
        // Calculate yesterday for DAU
        const yesterday = new Date(toDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const sql = `
          WITH daily_stats AS (
            SELECT
              date_day,
              COUNT(DISTINCT user_id) as dau,
              SUM(total_requests) as messages
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $5
            GROUP BY date_day
          ),
          current_period AS (
            SELECT
              COUNT(DISTINCT CASE WHEN date_day = $5 THEN user_id END) as dau,
              COUNT(DISTINCT CASE WHEN date_day >= $5::date - INTERVAL '6 days' THEN user_id END) as wau,
              COUNT(DISTINCT CASE WHEN date_day >= $5::date - INTERVAL '29 days' THEN user_id END) as mau,
              SUM(total_requests) as total_messages,
              COUNT(DISTINCT date_day) FILTER (WHERE EXISTS (
                SELECT 1 FROM gold.mart_llm_cost_by_user_model_day sub 
                WHERE sub.date_day = gold.mart_llm_cost_by_user_model_day.date_day
              )) as days_with_activity
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
          ),
          previous_period AS (
            SELECT
              COUNT(DISTINCT CASE WHEN date_day = $4 THEN user_id END) as dau,
              COUNT(DISTINCT CASE WHEN date_day >= $4::date - INTERVAL '6 days' THEN user_id END) as wau,
              COUNT(DISTINCT CASE WHEN date_day >= $4::date - INTERVAL '29 days' THEN user_id END) as mau,
              SUM(total_requests) as total_messages,
              COUNT(DISTINCT date_day) FILTER (WHERE EXISTS (
                SELECT 1 FROM gold.mart_llm_cost_by_user_model_day sub 
                WHERE sub.date_day = gold.mart_llm_cost_by_user_model_day.date_day
              )) as days_with_activity
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $4
          ),
          daily_interactions_current AS (
            SELECT 
              date_day,
              COUNT(DISTINCT user_id) as dau,
              SUM(total_requests) as messages,
              CASE WHEN COUNT(DISTINCT user_id) > 0
                THEN SUM(total_requests)::float / COUNT(DISTINCT user_id)
                ELSE 0
              END as interactions_per_dau
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
            GROUP BY date_day
          ),
          avg_interactions_current AS (
            SELECT AVG(interactions_per_dau) as avg_ipd FROM daily_interactions_current
          ),
          daily_interactions_previous AS (
            SELECT 
              date_day,
              COUNT(DISTINCT user_id) as dau,
              SUM(total_requests) as messages,
              CASE WHEN COUNT(DISTINCT user_id) > 0
                THEN SUM(total_requests)::float / COUNT(DISTINCT user_id)
                ELSE 0
              END as interactions_per_dau
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $4
            GROUP BY date_day
          ),
          avg_interactions_previous AS (
            SELECT AVG(interactions_per_dau) as avg_ipd FROM daily_interactions_previous
          ),
          new_active_users_current AS (
            SELECT COUNT(DISTINCT user_id)::integer as cnt
            FROM (
              SELECT user_id, MIN(date_day) as first_activity
              FROM gold.mart_llm_cost_by_user_model_day
              GROUP BY user_id
            ) fa
            WHERE fa.first_activity >= $1 AND fa.first_activity <= $2
          ),
          new_active_users_previous AS (
            SELECT COUNT(DISTINCT user_id)::integer as cnt
            FROM (
              SELECT user_id, MIN(date_day) as first_activity
              FROM gold.mart_llm_cost_by_user_model_day
              GROUP BY user_id
            ) fa
            WHERE fa.first_activity >= $3 AND fa.first_activity <= $4
          ),
          churn_current AS (
            SELECT
              COUNT(DISTINCT prev.user_id)::integer as prev_active,
              COUNT(DISTINCT prev.user_id) FILTER (
                WHERE prev.user_id NOT IN (
                  SELECT DISTINCT user_id FROM gold.mart_llm_cost_by_user_model_day
                  WHERE date_day >= $1 AND date_day <= $2
                )
              )::integer as churned
            FROM (
              SELECT DISTINCT user_id FROM gold.mart_llm_cost_by_user_model_day
              WHERE date_day >= $3 AND date_day <= $4
            ) prev
          ),
          churn_previous AS (
            SELECT
              COUNT(DISTINCT prev2.user_id)::integer as prev_active,
              COUNT(DISTINCT prev2.user_id) FILTER (
                WHERE prev2.user_id NOT IN (
                  SELECT DISTINCT user_id FROM gold.mart_llm_cost_by_user_model_day
                  WHERE date_day >= $3 AND date_day <= $4
                )
              )::integer as churned
            FROM (
              SELECT DISTINCT user_id FROM gold.mart_llm_cost_by_user_model_day
              WHERE date_day >= ($3::date - ($2::date - $1::date)) AND date_day < $3
            ) prev2
          ),
          new_users_current AS (
            SELECT COUNT(*) as new_users
            FROM gold.dim_users
            WHERE account_created_at >= $1 AND account_created_at <= $2
          ),
          new_users_previous AS (
            SELECT COUNT(*) as new_users
            FROM gold.dim_users
            WHERE account_created_at >= $3 AND account_created_at <= $4
          ),
          dau_sparkline AS (
            SELECT ARRAY_AGG(dau ORDER BY date_day DESC) as values
            FROM daily_stats
            WHERE date_day > $2::date - INTERVAL '7 days' AND date_day <= $2
          ),
          wau_daily AS (
            SELECT 
              date_day,
              COUNT(DISTINCT user_id) as dau
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $2::date - INTERVAL '6 days' AND date_day <= $2
            GROUP BY date_day
          ),
          wau_sparkline AS (
            SELECT ARRAY_AGG(dau ORDER BY date_day DESC) as values
            FROM wau_daily
          )
          SELECT
            json_build_object(
              'dau', COALESCE(cp.dau, 0),
              'wau', COALESCE(cp.wau, 0),
              'mau', COALESCE(cp.mau, 0),
              'new_users', COALESCE(nuc.new_users, 0),
              'new_active_users', COALESCE(nauc.cnt, 0),
              'interactions_per_dau', COALESCE(aic.avg_ipd, 0),
              'churn_rate', CASE
                WHEN COALESCE(cc.prev_active, 0) > 0
                THEN (cc.churned::float / cc.prev_active) * 100
                ELSE 0
              END
            ) as current,
            json_build_object(
              'dau', COALESCE(pp.dau, 0),
              'wau', COALESCE(pp.wau, 0),
              'mau', COALESCE(pp.mau, 0),
              'new_users', COALESCE(nup.new_users, 0),
              'new_active_users', COALESCE(naup.cnt, 0),
              'interactions_per_dau', COALESCE(aip.avg_ipd, 0),
              'churn_rate', CASE
                WHEN COALESCE(cp2.prev_active, 0) > 0
                THEN (cp2.churned::float / cp2.prev_active) * 100
                ELSE 0
              END
            ) as previous,
            COALESCE(ds.values, ARRAY[]::integer[]) as dau_sparkline,
            COALESCE(ws.values, ARRAY[]::integer[]) as wau_sparkline
          FROM current_period cp
          CROSS JOIN previous_period pp
          CROSS JOIN new_users_current nuc
          CROSS JOIN new_users_previous nup
          CROSS JOIN new_active_users_current nauc
          CROSS JOIN new_active_users_previous naup
          CROSS JOIN avg_interactions_current aic
          CROSS JOIN avg_interactions_previous aip
          CROSS JOIN churn_current cc
          CROSS JOIN churn_previous cp2
          CROSS JOIN dau_sparkline ds
          CROSS JOIN wau_sparkline ws
        `;

        const { rows, cached } = await queryWithCache<UserKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          [from, to, prevFromStr, prevToStr, yesterdayStr]
        );

        if (rows.length === 0) {
          return {
            data: {
              current: { dau: 0, wau: 0, mau: 0, new_users: 0, new_active_users: 0, interactions_per_dau: 0, churn_rate: 0 },
              previous: { dau: 0, wau: 0, mau: 0, new_users: 0, new_active_users: 0, interactions_per_dau: 0, churn_rate: 0 },
              dau_sparkline: [],
              wau_sparkline: [],
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
        throw new Error('Failed to fetch user KPIs');
      }
    }
  );

  // GET /api/v1/users/activity-daily
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DailyActivity[]> }>(
    '/activity-daily',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `users:activity-daily:${from}:${to}:${organization_id || 'all'}`;

      try {
        const params: (string | null)[] = [from, to];
        let orgFilter = '';
        if (organization_id) {
          orgFilter = `AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $3)`;
          params.push(organization_id);
        }

        const sql = `
          SELECT
            date_day::text as date_day,
            COUNT(DISTINCT user_id) as dau,
            AVG(COUNT(DISTINCT user_id)) OVER (
              ORDER BY date_day
              ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ) as dau_7d_ma,
            SUM(total_requests) as messages_sent,
            SUM(total_tokens) as total_tokens,
            SUM(est_cost_usd) as est_cost_usd
          FROM gold.mart_llm_cost_by_user_model_day
          WHERE date_day >= $1 AND date_day <= $2 ${orgFilter}
          GROUP BY date_day
          ORDER BY date_day
        `;

        const { rows, cached } = await queryWithCache<DailyActivity>(
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
        throw new Error('Failed to fetch daily activity');
      }
    }
  );

  // GET /api/v1/users/activity-heatmap
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<ActivityHeatmap[]> }>(
    '/activity-heatmap',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `users:activity-heatmap:${from}:${to}:${organization_id || 'all'}`;

      try {
        const params: (string | null)[] = [from, to];
        let orgFilter = '';
        if (organization_id) {
          orgFilter = `AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $3)`;
          params.push(organization_id);
        }

        const sql = `
          WITH daily_totals AS (
            SELECT
              EXTRACT(ISODOW FROM date_day)::integer as day_of_week,
              SUM(total_requests) as total_messages,
              COUNT(DISTINCT user_id) as total_users
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2 ${orgFilter}
            GROUP BY day_of_week
          ),
          hours AS (
            SELECT generate_series(0, 23) as hour
          )
          SELECT
            dt.day_of_week,
            h.hour,
            (dt.total_messages / 24)::integer as message_count,
            dt.total_users as distinct_users
          FROM daily_totals dt
          CROSS JOIN hours h
          ORDER BY dt.day_of_week, h.hour
        `;

        const { rows, cached } = await queryWithCache<ActivityHeatmap>(
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
        throw new Error('Failed to fetch activity heatmap');
      }
    }
  );

  // GET /api/v1/users/summary
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<UserSummary[]> }>(
    '/summary',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;
      const hasDateFilter = from && to;
      const cacheKey = hasDateFilter
        ? `users:summary:${from}:${to}:${organization_id || 'all'}`
        : `users:summary:${organization_id || 'all'}`;

      try {
        // Build org filter — always applied to dim_users directly since the query already joins it
        const orgWhere = organization_id ? `AND u.organization_id = $${hasDateFilter ? 3 : 1}` : '';
        const params: (string | null)[] = hasDateFilter
          ? ([from, to, ...(organization_id ? [organization_id] : [])] as string[])
          : (organization_id ? [organization_id] : []);

        const sql = hasDateFilter
          ? `
          SELECT
            u.user_id,
            u.email,
            u.organization_id as org,
            COUNT(DISTINCT DATE_TRUNC('day', c.date_day))::integer as conversations,
            COALESCE(SUM(c.total_requests), 0)::integer as messages,
            COALESCE(SUM(c.total_tokens), 0)::bigint as tokens,
            COALESCE(SUM(c.est_cost_usd), 0)::numeric as cost,
            MAX(all_activity.last_active) as last_active_at,
            u.account_created_at,
            u.is_deleted
          FROM gold.dim_users u
          LEFT JOIN gold.mart_llm_cost_by_user_model_day c
            ON u.user_id = c.user_id AND c.date_day >= $1 AND c.date_day <= $2
          LEFT JOIN LATERAL (
            SELECT MAX(date_day) as last_active
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE user_id = u.user_id
          ) all_activity ON true
          WHERE 1=1 ${orgWhere}
          GROUP BY u.user_id, u.email, u.organization_id, u.account_created_at, u.is_deleted
          ORDER BY cost DESC
        `
          : `
          SELECT
            u.user_id,
            u.email,
            u.organization_id as org,
            COUNT(DISTINCT DATE_TRUNC('day', c.date_day))::integer as conversations,
            COALESCE(SUM(c.total_requests), 0)::integer as messages,
            COALESCE(SUM(c.total_tokens), 0)::bigint as tokens,
            COALESCE(SUM(c.est_cost_usd), 0)::numeric as cost,
            MAX(c.date_day) as last_active_at,
            u.account_created_at,
            u.is_deleted
          FROM gold.dim_users u
          LEFT JOIN gold.mart_llm_cost_by_user_model_day c ON u.user_id = c.user_id
          WHERE 1=1 ${orgWhere}
          GROUP BY u.user_id, u.email, u.organization_id, u.account_created_at, u.is_deleted
          ORDER BY cost DESC
        `;

        const { rows, cached } = await queryWithCache<UserSummary>(
          cacheKey,
          cacheTTL,
          sql,
          params
        );

        return {
          data: rows,
          meta: {
            ...(hasDateFilter ? { from, to } : {}),
            generated_at: new Date().toISOString(),
            cached,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch user summary');
      }
    }
  );

  // GET /api/v1/users/:userId
  fastify.get<{
    Params: { userId: string };
    Querystring: QueryParams;
    Reply: ApiResponse<UserDetail>;
  }>('/:userId', async (request, reply) => {
    const { userId } = request.params;
    const { from, to } = request.query;

    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `users:detail:${userId}:${from}:${to}`;

    try {
      // Get user profile and stats
      const userSql = `
        SELECT
          u.user_id,
          u.email,
          u.organization_id as org,
          u.account_created_at,
          0 as total_conversations,
          COALESCE(SUM(c.total_requests), 0)::integer as total_messages,
          COALESCE(SUM(c.est_cost_usd), 0)::numeric as total_est_cost_usd,
          COUNT(DISTINCT c.model)::integer as unique_agents_used
        FROM gold.dim_users u
        LEFT JOIN gold.mart_llm_cost_by_user_model_day c
          ON u.user_id = c.user_id
          AND c.date_day >= $2
          AND c.date_day <= $3
        WHERE u.user_id = $1
        GROUP BY u.user_id, u.email, u.organization_id, u.account_created_at
      `;

      const userResult = await queryWithCache<{
        user_id: string;
        email: string;
        org: string | null;
        account_created_at: string;
        total_conversations: number;
        total_messages: number;
        total_est_cost_usd: number;
        unique_agents_used: number;
      }>(cacheKey + ':profile', cacheTTL, userSql, [userId, from, to]);

      if (userResult.rows.length === 0) {
        reply.code(404);
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Get daily activity
      const dailySql = `
        SELECT
          date_day::text as date_day,
          SUM(total_requests)::integer as messages_sent
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        GROUP BY date_day
        ORDER BY date_day
      `;

      const dailyResult = await queryWithCache<{
        date_day: string;
        messages_sent: number;
      }>(cacheKey + ':daily', cacheTTL, dailySql, [userId, from, to]);

      // Get cost by model
      const costByModelSql = `
        SELECT
          model as model_name,
          SUM(est_cost_usd) as est_cost_usd
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        GROUP BY model
        ORDER BY est_cost_usd DESC
        LIMIT 10
      `;

      const costByModelResult = await queryWithCache<{
        model_name: string;
        est_cost_usd: number;
      }>(cacheKey + ':cost-by-model', cacheTTL, costByModelSql, [userId, from, to]);

      // Get recent activity by model (simulating conversations)
      const conversationsSql = `
        SELECT
          model || '-' || date_day::text as conversation_id,
          model as agent_name,
          total_requests as message_count,
          date_day as last_message_at,
          est_cost_usd
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        ORDER BY date_day DESC, est_cost_usd DESC
        LIMIT 10
      `;

      const conversationsResult = await queryWithCache<{
        conversation_id: string;
        agent_name: string | null;
        message_count: number;
        last_message_at: string;
        est_cost_usd: number;
      }>(cacheKey + ':conversations', cacheTTL, conversationsSql, [userId, from, to]);

      const detail: UserDetail = {
        user_id: user.user_id,
        email: user.email,
        org: user.org,
        account_created_at: user.account_created_at,
        total_conversations: user.total_conversations,
        total_messages: user.total_messages,
        total_est_cost_usd: user.total_est_cost_usd,
        unique_agents_used: user.unique_agents_used,
        daily_activity: dailyResult.rows,
        cost_by_model: costByModelResult.rows,
        recent_conversations: conversationsResult.rows,
      };

      return {
        data: detail,
        meta: {
          from,
          to,
          generated_at: new Date().toISOString(),
          cached: userResult.cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch user detail');
    }
  });
  // GET /api/v1/users/sharing — sharing activity KPIs + trend
  fastify.get<{ Querystring: QueryParams }>('/sharing', async (request, reply) => {
    const { from, to } = request.query;
    if (!from || !to) { reply.code(400); throw new Error('from and to required'); }

    const cacheTTL = 3300;
    try {
      const [kpiRes, trendRes] = await Promise.all([
        queryWithCache(
          `sharing:kpis:${from}:${to}`, cacheTTL,
          `SELECT
            COALESCE(SUM(CASE WHEN feature_type='agent'  THEN active_shares ELSE 0 END),0)::int  AS active_agent_shares,
            COALESCE(SUM(CASE WHEN feature_type='source' THEN active_shares ELSE 0 END),0)::int  AS active_source_shares,
            COALESCE(SUM(CASE WHEN feature_type='skill'  THEN active_shares ELSE 0 END),0)::int  AS active_skill_shares,
            COALESCE(SUM(active_shares),0)::int    AS total_active_shares,
            COALESCE(SUM(shares_granted),0)::int   AS total_granted,
            COALESCE(SUM(shares_revoked),0)::int   AS total_revoked,
            COALESCE(MAX(unique_granters),0)::int  AS unique_sharers,
            COALESCE(MAX(unique_recipients),0)::int AS unique_recipients
           FROM gold.mart_sharing_activity_daily
           WHERE date_day >= $1 AND date_day <= $2`,
          [from, to]
        ),
        queryWithCache(
          `sharing:trend:${from}:${to}`, cacheTTL,
          `SELECT date_day::text, feature_type,
            SUM(shares_granted)::int  AS granted,
            SUM(shares_revoked)::int  AS revoked,
            SUM(active_shares)::int   AS active
           FROM gold.mart_sharing_activity_daily
           WHERE date_day >= $1 AND date_day <= $2
           GROUP BY date_day, feature_type
           ORDER BY date_day`,
          [from, to]
        ),
      ]);

      return {
        data: { kpis: kpiRes.rows[0] ?? {}, trend: trendRes.rows },
        meta: { from, to, generated_at: new Date().toISOString(), cached: kpiRes.cached },
      };
    } catch (error: any) {
      if (error?.code === '42P01') {
        return { data: { kpis: {}, trend: [] }, meta: { from, to, generated_at: new Date().toISOString(), cached: false } };
      }
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch sharing data');
    }
  });

}
