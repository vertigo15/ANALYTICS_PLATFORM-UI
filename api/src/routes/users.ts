import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface UserKPIs {
  current: {
    dau: number;
    wau: number;
    mau: number;
    new_users: number;
    interactions_per_dau: number;
    power_user_ratio: number;
  };
  previous: {
    dau: number;
    wau: number;
    mau: number;
    new_users: number;
    interactions_per_dau: number;
    power_user_ratio: number;
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
        const durationDays = Math.ceil(duration / 86400000);
        const prevTo = new Date(fromDate.getTime() - 86400000);
        const prevFrom = new Date(prevTo.getTime() - duration);

        const prevFromStr = prevFrom.toISOString().split('T')[0];
        const prevToStr = prevTo.toISOString().split('T')[0];
        
        // Calculate yesterday for DAU
        const yesterday = new Date(toDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        // Calculate adaptive threshold for power users: min(3, period/3)
        const powerUserThreshold = Math.max(1, Math.min(3, Math.floor(durationDays / 3)));

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
          daily_user_counts AS (
            SELECT 
              date_day,
              COUNT(DISTINCT user_id) as dau
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
            GROUP BY date_day
            HAVING COUNT(DISTINCT user_id) > 0
          ),
          avg_dau_current AS (
            SELECT AVG(dau) as avg_dau FROM daily_user_counts
          ),
          prev_daily_user_counts AS (
            SELECT 
              date_day,
              COUNT(DISTINCT user_id) as dau
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $4
            GROUP BY date_day
            HAVING COUNT(DISTINCT user_id) > 0
          ),
          avg_dau_previous AS (
            SELECT AVG(dau) as avg_dau FROM prev_daily_user_counts
          ),
          user_activity_days_current AS (
            SELECT
              user_id,
              COUNT(DISTINCT date_day) as active_days
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
            GROUP BY user_id
          ),
          power_users_current AS (
            SELECT
              COUNT(*) FILTER (WHERE active_days >= $6) as power_users,
              COUNT(*) as total_users
            FROM user_activity_days_current
          ),
          user_activity_days_previous AS (
            SELECT
              user_id,
              COUNT(DISTINCT date_day) as active_days
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $4
            GROUP BY user_id
          ),
          power_users_previous AS (
            SELECT
              COUNT(*) FILTER (WHERE active_days >= $6) as power_users,
              COUNT(*) as total_users
            FROM user_activity_days_previous
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
              'interactions_per_dau', CASE 
                WHEN COALESCE(adc.avg_dau, 0) > 0 
                THEN COALESCE(cp.total_messages, 0) / adc.avg_dau 
                ELSE 0 
              END,
              'power_user_ratio', CASE
                WHEN COALESCE(puc.total_users, 0) > 0
                THEN (puc.power_users::float / puc.total_users) * 100
                ELSE 0
              END
            ) as current,
            json_build_object(
              'dau', COALESCE(pp.dau, 0),
              'wau', COALESCE(pp.wau, 0),
              'mau', COALESCE(pp.mau, 0),
              'new_users', COALESCE(nup.new_users, 0),
              'interactions_per_dau', CASE 
                WHEN COALESCE(adp.avg_dau, 0) > 0 
                THEN COALESCE(pp.total_messages, 0) / adp.avg_dau 
                ELSE 0 
              END,
              'power_user_ratio', CASE
                WHEN COALESCE(pup.total_users, 0) > 0
                THEN (pup.power_users::float / pup.total_users) * 100
                ELSE 0
              END
            ) as previous,
            COALESCE(ds.values, ARRAY[]::integer[]) as dau_sparkline,
            COALESCE(ws.values, ARRAY[]::integer[]) as wau_sparkline
          FROM current_period cp
          CROSS JOIN previous_period pp
          CROSS JOIN new_users_current nuc
          CROSS JOIN new_users_previous nup
          CROSS JOIN avg_dau_current adc
          CROSS JOIN avg_dau_previous adp
          CROSS JOIN power_users_current puc
          CROSS JOIN power_users_previous pup
          CROSS JOIN dau_sparkline ds
          CROSS JOIN wau_sparkline ws
        `;

        const { rows, cached } = await queryWithCache<UserKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          [from, to, prevFromStr, prevToStr, yesterdayStr, powerUserThreshold]
        );

        if (rows.length === 0) {
          return {
            data: {
              current: { dau: 0, wau: 0, mau: 0, new_users: 0, interactions_per_dau: 0, power_user_ratio: 0 },
              previous: { dau: 0, wau: 0, mau: 0, new_users: 0, interactions_per_dau: 0, power_user_ratio: 0 },
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
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `users:activity-daily:${from}:${to}`;

      try {
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
          WHERE date_day >= $1 AND date_day <= $2
          GROUP BY date_day
          ORDER BY date_day
        `;

        const { rows, cached } = await queryWithCache<DailyActivity>(
          cacheKey,
          cacheTTL,
          sql,
          [from, to]
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
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `users:activity-heatmap:${from}:${to}`;

      try {
        const sql = `
          WITH daily_totals AS (
            SELECT
              EXTRACT(ISODOW FROM date_day)::integer as day_of_week,
              SUM(total_requests) as total_messages,
              COUNT(DISTINCT user_id) as total_users
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
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
          [from, to]
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
      const { from, to } = request.query;
      const hasDateFilter = from && to;
      const cacheKey = hasDateFilter ? `users:summary:${from}:${to}` : 'users:summary';

      try {
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
          GROUP BY u.user_id, u.email, u.organization_id, u.account_created_at, u.is_deleted
          ORDER BY cost DESC
        `;

        const { rows, cached } = await queryWithCache<UserSummary>(
          cacheKey,
          cacheTTL,
          sql,
          hasDateFilter ? [from, to] : []
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
}
