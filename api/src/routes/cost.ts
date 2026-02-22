import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface DailyCost {
  date: string;
  model: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
}

interface ModelCost {
  model: string;
  provider: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
  pct_of_total: number;
}

interface TopUser {
  user_id: string;
  user_email: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
  top_model: string;
}

interface PeriodSummary {
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
}

interface CostSummary {
  current: PeriodSummary;
  previous: PeriodSummary;
  most_expensive_model: string;
  cost_per_1k_tokens: number;
}

interface UserCostDetail {
  user_id: string;
  user_email: string;
  organization_id: string | null;
  summary: PeriodSummary;
  by_model: { model: string; est_cost_usd: number; total_tokens: number }[];
  daily: { date: string; est_cost_usd: number; total_tokens: number }[];
  recent_activity: {
    date: string;
    model: string;
    provider: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    est_cost_usd: number;
  }[];
}

interface CostDetailRow {
  date: string;
  user_email: string;
  model: string;
  provider: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  est_cost_usd: number;
}

interface TokensByModel {
  model: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export default async function costRoutes(fastify: FastifyInstance) {
  const cacheTTL = 3300; // 55 minutes

  // GET /api/v1/cost/daily
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DailyCost[]> }>(
    '/daily',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:daily:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        let sql = `
          SELECT 
            date_day::text as date,
            model,
            SUM(est_cost_usd) as est_cost_usd,
            SUM(total_tokens) as total_tokens,
            SUM(total_requests) as total_requests
          FROM gold.mart_llm_cost_by_user_model_day
          WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.length + 1})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(agent_id);
        }

        sql += ` GROUP BY date_day, model ORDER BY date_day, model`;

        const { rows, cached } = await queryWithCache<DailyCost>(cacheKey, cacheTTL, sql, params);

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
        throw new Error('Failed to fetch daily cost data');
      }
    }
  );

  // GET /api/v1/cost/by-model
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<ModelCost[]> }>(
    '/by-model',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:by-model:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        let sql = `
          WITH totals AS (
            SELECT SUM(est_cost_usd) as total_cost FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];
        let paramIndex = 2;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${++paramIndex})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${++paramIndex}`;
          params.push(agent_id);
        }

        sql += `
          ),
          ranked_models AS (
            SELECT 
              model,
              provider,
              SUM(est_cost_usd) AS est_cost_usd,
              SUM(total_tokens) AS total_tokens,
              SUM(total_requests) AS total_requests,
              ROW_NUMBER() OVER (ORDER BY SUM(est_cost_usd) DESC) AS rank
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.indexOf(organization_id) + 1})`;
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.indexOf(agent_id) + 1}`;
        }

        sql += `
            GROUP BY model, provider
          ),
          grouped AS (
            SELECT 
              CASE WHEN rank <= 6 THEN model ELSE 'Others' END AS model,
              CASE WHEN rank <= 6 THEN provider ELSE 'Multiple' END AS provider,
              SUM(est_cost_usd) AS est_cost_usd,
              SUM(total_tokens) AS total_tokens,
              SUM(total_requests) AS total_requests
            FROM ranked_models
            GROUP BY 1, 2
          )
          SELECT 
            g.model,
            g.provider,
            g.est_cost_usd,
            g.total_tokens,
            g.total_requests,
            ROUND((g.est_cost_usd / NULLIF(t.total_cost, 0) * 100)::numeric, 2) AS pct_of_total
          FROM grouped g
          CROSS JOIN totals t
          ORDER BY CASE WHEN g.model = 'Others' THEN 1 ELSE 0 END, g.est_cost_usd DESC
        `;

        const { rows, cached } = await queryWithCache<ModelCost>(cacheKey, cacheTTL, sql, params);

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
        throw new Error('Failed to fetch cost by model');
      }
    }
  );

  // GET /api/v1/cost/top-users
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<TopUser[]> }>(
    '/top-users',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:top-users:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        let sql = `
          WITH user_totals AS (
            SELECT 
              user_id,
              user_email,
              SUM(est_cost_usd) as est_cost_usd,
              SUM(total_tokens) as total_tokens,
              SUM(total_requests) as total_requests
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];
        let paramIndex = 2;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${++paramIndex})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${++paramIndex}`;
          params.push(agent_id);
        }

        sql += `
            GROUP BY user_id, user_email
          ),
          top_models AS (
            SELECT DISTINCT ON (user_id)
              user_id,
              model as top_model
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.indexOf(organization_id) + 1})`;
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.indexOf(agent_id) + 1}`;
        }

        sql += `
            ORDER BY user_id, est_cost_usd DESC
          )
          SELECT 
            ut.user_id,
            ut.user_email,
            ut.est_cost_usd,
            ut.total_tokens,
            ut.total_requests,
            tm.top_model
          FROM user_totals ut
          LEFT JOIN top_models tm ON ut.user_id = tm.user_id
          ORDER BY ut.est_cost_usd DESC
          LIMIT 20
        `;

        const { rows, cached } = await queryWithCache<TopUser>(cacheKey, cacheTTL, sql, params);

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
        throw new Error('Failed to fetch top users');
      }
    }
  );

  // GET /api/v1/cost/summary
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<CostSummary> }>(
    '/summary',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:summary:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        // Calculate previous period dates
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const duration = toDate.getTime() - fromDate.getTime();
        const prevTo = new Date(fromDate.getTime() - 86400000); // day before from
        const prevFrom = new Date(prevTo.getTime() - duration);

        const prevFromStr = prevFrom.toISOString().split('T')[0];
        const prevToStr = prevTo.toISOString().split('T')[0];

        let sql = `
          WITH current_period AS (
            SELECT 
              SUM(est_cost_usd) as est_cost_usd,
              SUM(total_tokens) as total_tokens,
              SUM(total_requests) as total_requests
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to, prevFromStr, prevToStr];
        let paramIndex = 2;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${++paramIndex})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${++paramIndex}`;
          params.push(agent_id);
        }

        sql += `
          ),
          previous_period AS (
            SELECT 
              SUM(est_cost_usd) as est_cost_usd,
              SUM(total_tokens) as total_tokens,
              SUM(total_requests) as total_requests
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $3 AND date_day <= $4
        `;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.indexOf(organization_id) + 1})`;
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.indexOf(agent_id) + 1}`;
        }

        sql += `
          ),
          most_expensive AS (
            SELECT model
            FROM gold.mart_llm_cost_by_user_model_day
            WHERE date_day >= $1 AND date_day <= $2
        `;

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.indexOf(organization_id) + 1})`;
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.indexOf(agent_id) + 1}`;
        }

        sql += `
            GROUP BY model
            ORDER BY SUM(est_cost_usd) DESC
            LIMIT 1
          )
          SELECT 
            json_build_object(
              'est_cost_usd', COALESCE(cp.est_cost_usd, 0),
              'total_tokens', COALESCE(cp.total_tokens, 0),
              'total_requests', COALESCE(cp.total_requests, 0)
            ) as current,
            json_build_object(
              'est_cost_usd', COALESCE(pp.est_cost_usd, 0),
              'total_tokens', COALESCE(pp.total_tokens, 0),
              'total_requests', COALESCE(pp.total_requests, 0)
            ) as previous,
            COALESCE(me.model, 'N/A') as most_expensive_model,
            CASE 
              WHEN COALESCE(cp.total_tokens, 0) > 0 
              THEN COALESCE(cp.est_cost_usd, 0) / (COALESCE(cp.total_tokens, 0) / 1000.0)
              ELSE 0
            END as cost_per_1k_tokens
          FROM current_period cp
          CROSS JOIN previous_period pp
          LEFT JOIN most_expensive me ON true
        `;

        const { rows, cached } = await queryWithCache<{
          current: PeriodSummary;
          previous: PeriodSummary;
          most_expensive_model: string;
          cost_per_1k_tokens: number;
        }>(cacheKey, cacheTTL, sql, params);

        if (rows.length === 0) {
          return {
            data: {
              current: { est_cost_usd: 0, total_tokens: 0, total_requests: 0 },
              previous: { est_cost_usd: 0, total_tokens: 0, total_requests: 0 },
              most_expensive_model: 'N/A',
              cost_per_1k_tokens: 0,
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
        throw new Error('Failed to fetch cost summary');
      }
    }
  );

  // GET /api/v1/cost/user/:userId
  fastify.get<{
    Params: { userId: string };
    Querystring: QueryParams;
    Reply: ApiResponse<UserCostDetail>;
  }>('/user/:userId', async (request, reply) => {
    const { userId } = request.params;
    const { from, to } = request.query;

    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `cost:user:${userId}:${from}:${to}`;

    try {
      // Get user info and summary
      const userSql = `
        SELECT 
          u.user_id,
          u.email as user_email,
          u.organization_id,
          COALESCE(SUM(c.est_cost_usd), 0) as est_cost_usd,
          COALESCE(SUM(c.total_tokens), 0) as total_tokens,
          COALESCE(SUM(c.total_requests), 0) as total_requests
        FROM gold.dim_users u
        LEFT JOIN gold.mart_llm_cost_by_user_model_day c 
          ON u.user_id = c.user_id 
          AND c.date_day >= $2 
          AND c.date_day <= $3
        WHERE u.user_id = $1
        GROUP BY u.user_id, u.email, u.organization_id
      `;

      const userResult = await queryWithCache<{
        user_id: string;
        user_email: string;
        organization_id: string | null;
        est_cost_usd: number;
        total_tokens: number;
        total_requests: number;
      }>(cacheKey + ':user', cacheTTL, userSql, [userId, from, to]);

      if (userResult.rows.length === 0) {
        reply.code(404);
        throw new Error('User not found');
      }

      const userInfo = userResult.rows[0];

      // Get cost by model
      const byModelSql = `
        SELECT 
          model,
          SUM(est_cost_usd) as est_cost_usd,
          SUM(total_tokens) as total_tokens
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        GROUP BY model
        ORDER BY est_cost_usd DESC
      `;

      const byModelResult = await queryWithCache<{
        model: string;
        est_cost_usd: number;
        total_tokens: number;
      }>(cacheKey + ':by-model', cacheTTL, byModelSql, [userId, from, to]);

      // Get daily costs
      const dailySql = `
        SELECT 
          date_day::text as date,
          SUM(est_cost_usd) as est_cost_usd,
          SUM(total_tokens) as total_tokens
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        GROUP BY date_day
        ORDER BY date_day
      `;

      const dailyResult = await queryWithCache<{
        date: string;
        est_cost_usd: number;
        total_tokens: number;
      }>(cacheKey + ':daily', cacheTTL, dailySql, [userId, from, to]);

      // Get recent activity
      const activitySql = `
        SELECT 
          date_day::text as date,
          model,
          provider,
          total_requests as requests,
          total_input_tokens as input_tokens,
          total_output_tokens as output_tokens,
          est_cost_usd
        FROM gold.mart_llm_cost_by_user_model_day
        WHERE user_id = $1 AND date_day >= $2 AND date_day <= $3
        ORDER BY date_day DESC, est_cost_usd DESC
        LIMIT 10
      `;

      const activityResult = await queryWithCache<{
        date: string;
        model: string;
        provider: string;
        requests: number;
        input_tokens: number;
        output_tokens: number;
        est_cost_usd: number;
      }>(cacheKey + ':activity', cacheTTL, activitySql, [userId, from, to]);

      const detail: UserCostDetail = {
        user_id: userInfo.user_id,
        user_email: userInfo.user_email,
        organization_id: userInfo.organization_id,
        summary: {
          est_cost_usd: userInfo.est_cost_usd,
          total_tokens: userInfo.total_tokens,
          total_requests: userInfo.total_requests,
        },
        by_model: byModelResult.rows,
        daily: dailyResult.rows,
        recent_activity: activityResult.rows,
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
      throw new Error('Failed to fetch user cost detail');
    }
  });

  // GET /api/v1/cost/detail - For the table
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<CostDetailRow[]> }>(
    '/detail',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:detail:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        let sql = `
          SELECT 
            date_day::text as date,
            user_email,
            model,
            provider,
            total_requests as requests,
            total_input_tokens as input_tokens,
            total_output_tokens as output_tokens,
            total_reasoning_tokens as reasoning_tokens,
            est_cost_usd
          FROM gold.mart_llm_cost_by_user_model_day
          WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.length + 1})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(agent_id);
        }

        sql += ` ORDER BY date_day DESC, est_cost_usd DESC`;

        const { rows, cached } = await queryWithCache<CostDetailRow>(
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
        throw new Error('Failed to fetch cost detail');
      }
    }
  );

  // GET /api/v1/cost/tokens-by-model
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<TokensByModel[]> }>(
    '/tokens-by-model',
    async (request, reply) => {
      const { from, to, organization_id, agent_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `cost:tokens-by-model:${from}:${to}:${organization_id || 'all'}:${agent_id || 'all'}`;

      try {
        // Use aggregated mart table (available in current schema) instead of joining dim_dates
        let sql = `
          SELECT 
            model,
            SUM(total_input_tokens) as input_tokens,
            SUM(total_output_tokens) as output_tokens,
            SUM(total_reasoning_tokens) as reasoning_tokens,
            SUM(total_tokens) as total_tokens
          FROM gold.mart_llm_cost_by_user_model_day
          WHERE date_day >= $1 AND date_day <= $2
        `;
        const params: (string | null)[] = [from, to];

        if (organization_id) {
          sql += ` AND user_id IN (SELECT user_id FROM gold.dim_users WHERE organization_id = $${params.length + 1})`;
          params.push(organization_id);
        }

        if (agent_id) {
          sql += ` AND agent_id = $${params.length + 1}`;
          params.push(agent_id);
        }

        sql += `
          GROUP BY model
          ORDER BY SUM(total_tokens) DESC
          LIMIT 10
        `;

        const { rows, cached } = await queryWithCache<TokensByModel>(cacheKey, cacheTTL, sql, params);

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
        throw new Error('Failed to fetch tokens by model');
      }
    }
  );
}
