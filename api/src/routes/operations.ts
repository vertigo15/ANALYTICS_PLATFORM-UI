import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse } from '../types';

interface OperationsKPIs {
  messages_last_hour: number;
  cost_last_hour: number;
  doc_failure_rate_24h: number;
  active_users_last_hour: number;
}

interface HealthIndicator {
  label: string;
  status: 'ok' | 'warning' | 'error';
  description: string;
}

interface HourlyOperations {
  date_hour: string;
  new_messages: number;
  user_messages: number;
  assistant_messages: number;
  total_tokens: number;
  total_cost_usd: number;
  new_documents: number;
  failed_documents: number;
  doc_failure_rate: number;
  active_users: number;
  unique_agents_used: number;
  avg_user_messages_7d: number;
  stddev_user_messages_7d: number;
  avg_assistant_messages_7d: number;
}

interface PlatformEvent {
  timestamp: string;
  event_type: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
}
interface TriggerKPIs {
  total_triggers: number;
  successful_triggers: number;
  failed_triggers: number;
  success_rate: number;
  avg_duration_sec: number;
  distinct_triggers: number;
  distinct_target_types: number;
}


interface TriggerKPIs {
  total_triggers: number;
  successful_triggers: number;
  failed_triggers: number;
  success_rate: number;
  avg_duration_sec: number;
  distinct_triggers: number;
  distinct_target_types: number;
}

export default async function operationsRoutes(fastify: FastifyInstance) {
  // GET /api/v1/operations/kpis
  fastify.get<{ Reply: ApiResponse<OperationsKPIs> }>('/kpis', async (_request, reply) => {
    const cacheKey = 'operations:kpis';
    const cacheTTL = 60; // 1 minute for near-realtime

    try {
      const { rows, cached } = await queryWithCache<OperationsKPIs>(
        cacheKey,
        cacheTTL,
        `SELECT
          COALESCE((
            SELECT SUM(new_messages)
            FROM gold.mart_operational_hourly
            WHERE date_hour >= NOW() - INTERVAL '1 hour'
          ), 0)::int AS messages_last_hour,
          COALESCE((
            SELECT SUM(total_cost_usd)
            FROM gold.mart_operational_hourly
            WHERE date_hour >= NOW() - INTERVAL '1 hour'
          ), 0)::float AS cost_last_hour,
          COALESCE((
            SELECT AVG(doc_failure_rate)
            FROM gold.mart_operational_hourly
            WHERE date_hour >= NOW() - INTERVAL '24 hours'
          ), 0)::float AS doc_failure_rate_24h,
          COALESCE((
            SELECT SUM(active_users)
            FROM gold.mart_operational_hourly
            WHERE date_hour >= NOW() - INTERVAL '1 hour'
          ), 0)::int AS active_users_last_hour`
      );

      return {
        data: rows[0],
        meta: {
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch operations KPIs');
    }
  });

  // GET /api/v1/operations/status
  fastify.get<{ Reply: ApiResponse<HealthIndicator[]> }>('/status', async (_request, reply) => {
    const cacheKey = 'operations:status';
    const cacheTTL = 120; // 2 minutes

    try {
      // Fetch recent metrics to derive health indicators
      const { rows: recent, cached } = await queryWithCache<{
        total_messages: number;
        doc_failure_rate: number;
        active_users: number;
        total_cost_usd: number;
        unique_agents_used: number;
        hours_since_last_data: number;
      }>(
        cacheKey + ':raw',
        cacheTTL,
        `SELECT
          COALESCE(SUM(new_messages), 0)::int AS total_messages,
          COALESCE(AVG(doc_failure_rate), 0)::float AS doc_failure_rate,
          COALESCE(SUM(active_users), 0)::int AS active_users,
          COALESCE(SUM(total_cost_usd), 0)::float AS total_cost_usd,
          COALESCE(SUM(unique_agents_used), 0)::int AS unique_agents_used,
          EXTRACT(EPOCH FROM (NOW() - MAX(date_hour))) / 3600 AS hours_since_last_data
        FROM gold.mart_operational_hourly
        WHERE date_hour >= NOW() - INTERVAL '4 hours'`
      );

      const metrics = recent[0];
      const hoursSinceData = Number(metrics.hours_since_last_data) || 999;

      const indicators: HealthIndicator[] = [
        {
          label: 'Data Pipeline',
          status: hoursSinceData < 2 ? 'ok' : hoursSinceData < 4 ? 'warning' : 'error',
          description: hoursSinceData < 2
            ? 'Data is current'
            : hoursSinceData < 4
            ? `Data is ${Math.round(hoursSinceData)}h old`
            : 'Data pipeline may be stalled',
        },
        {
          label: 'Message Volume',
          status: Number(metrics.total_messages) > 0 ? 'ok' : 'warning',
          description: Number(metrics.total_messages) > 0
            ? `${metrics.total_messages} messages in last 4h`
            : 'No messages in last 4 hours',
        },
        {
          label: 'Document Processing',
          status:
            Number(metrics.doc_failure_rate) < 0.05
              ? 'ok'
              : Number(metrics.doc_failure_rate) < 0.15
              ? 'warning'
              : 'error',
          description: `Failure rate: ${(Number(metrics.doc_failure_rate) * 100).toFixed(1)}%`,
        },
        {
          label: 'User Activity',
          status: Number(metrics.active_users) > 0 ? 'ok' : 'warning',
          description: `${metrics.active_users} active users in last 4h`,
        },
        {
          label: 'Cost',
          status:
            Number(metrics.total_cost_usd) < 100
              ? 'ok'
              : Number(metrics.total_cost_usd) < 500
              ? 'warning'
              : 'error',
          description: `$${Number(metrics.total_cost_usd).toFixed(2)} in last 4h`,
        },
      ];

      return {
        data: indicators,
        meta: {
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch operations status');
    }
  });

  // GET /api/v1/operations/hourly?hours=24
  fastify.get<{
    Querystring: { hours?: string };
    Reply: ApiResponse<HourlyOperations[]>;
  }>('/hourly', async (request, reply) => {
    const hours = parseInt(request.query.hours || '24', 10);
    const cacheKey = `operations:hourly:${hours}`;
    const cacheTTL = 120;

    try {
      const { rows, cached } = await queryWithCache<HourlyOperations>(
        cacheKey,
        cacheTTL,
        `SELECT
          date_hour::text,
          new_messages::int,
          user_messages::int,
          assistant_messages::int,
          total_tokens::bigint,
          total_cost_usd::float,
          new_documents::int,
          failed_documents::int,
          doc_failure_rate::float,
          active_users::int,
          unique_agents_used::int,
          COALESCE(AVG(user_messages) OVER (
            ORDER BY date_hour
            ROWS BETWEEN 168 PRECEDING AND 1 PRECEDING
          ), 0)::float AS avg_user_messages_7d,
          COALESCE(STDDEV(user_messages) OVER (
            ORDER BY date_hour
            ROWS BETWEEN 168 PRECEDING AND 1 PRECEDING
          ), 0)::float AS stddev_user_messages_7d,
          COALESCE(AVG(assistant_messages) OVER (
            ORDER BY date_hour
            ROWS BETWEEN 168 PRECEDING AND 1 PRECEDING
          ), 0)::float AS avg_assistant_messages_7d
        FROM gold.mart_operational_hourly
        WHERE date_hour >= NOW() - INTERVAL '${hours} hours'
        ORDER BY date_hour ASC`
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
      throw new Error('Failed to fetch hourly operations');
    }
  });

  // GET /api/v1/operations/events
  fastify.get<{ Reply: ApiResponse<PlatformEvent[]> }>('/events', async (_request, reply) => {
    const cacheKey = 'operations:events';
    const cacheTTL = 120;

    try {
      // Derive events from anomalies/spikes in recent data
      const { rows: hourlyRows, cached } = await queryWithCache<{
        date_hour: string;
        new_messages: number;
        user_messages: number;
        doc_failure_rate: number;
        failed_documents: number;
        new_documents: number;
        total_cost_usd: number;
        active_users: number;
        avg_messages_7d: number;
        stddev_messages_7d: number;
      }>(
        cacheKey + ':raw',
        cacheTTL,
        `SELECT
          date_hour::text,
          new_messages::int,
          user_messages::int,
          doc_failure_rate::float,
          failed_documents::int,
          new_documents::int,
          total_cost_usd::float,
          active_users::int,
          COALESCE(AVG(new_messages) OVER (
            ORDER BY date_hour
            ROWS BETWEEN 168 PRECEDING AND 1 PRECEDING
          ), 0)::float AS avg_messages_7d,
          COALESCE(STDDEV(new_messages) OVER (
            ORDER BY date_hour
            ROWS BETWEEN 168 PRECEDING AND 1 PRECEDING
          ), 0)::float AS stddev_messages_7d
        FROM gold.mart_operational_hourly
        WHERE date_hour >= NOW() - INTERVAL '48 hours'
        ORDER BY date_hour DESC`
      );

      const events: PlatformEvent[] = [];

      for (const row of hourlyRows) {
        const avgMsg = Number(row.avg_messages_7d);
        const stddevMsg = Number(row.stddev_messages_7d);
        const upperBound = avgMsg + 2 * stddevMsg;
        const msgs = Number(row.new_messages);
        const failRate = Number(row.doc_failure_rate);
        const cost = Number(row.total_cost_usd);

        // Message volume spike
        if (stddevMsg > 0 && msgs > upperBound && msgs > 10) {
          events.push({
            timestamp: row.date_hour,
            event_type: 'Message Volume Spike',
            description: `${msgs} messages (expected ~${Math.round(avgMsg)} ± ${Math.round(stddevMsg)})`,
            severity: msgs > avgMsg + 3 * stddevMsg ? 'error' : 'warning',
          });
        }

        // Document failures
        if (Number(row.failed_documents) > 0) {
          events.push({
            timestamp: row.date_hour,
            event_type: 'Document Failures',
            description: `${row.failed_documents} failed of ${row.new_documents} new documents (${(failRate * 100).toFixed(1)}% failure rate)`,
            severity: failRate > 0.2 ? 'error' : 'warning',
          });
        }

        // High cost alert
        if (cost > 50) {
          events.push({
            timestamp: row.date_hour,
            event_type: 'High Cost Alert',
            description: `$${cost.toFixed(2)} in a single hour`,
            severity: cost > 100 ? 'error' : 'warning',
          });
        }

        // Quiet period (no activity)
        if (msgs === 0 && Number(row.active_users) === 0 && avgMsg > 5) {
          events.push({
            timestamp: row.date_hour,
            event_type: 'Quiet Period',
            description: 'No messages or active users (unusual based on 7-day average)',
            severity: 'info',
          });
        }
      }

      // If no events found, add an info event
      if (events.length === 0) {
        events.push({
          timestamp: new Date().toISOString(),
          event_type: 'System Status',
          description: 'No anomalies detected in the last 48 hours',
          severity: 'info',
        });
      }

      // Limit to most recent 50 events
      return {
        data: events.slice(0, 50),
        meta: {
          generated_at: new Date().toISOString(),
          cached,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch operations events');
    }
  });
  // GET /api/v1/operations/triggers
  fastify.get('/triggers', async (request: any, reply) => {
    const { from, to } = request.query as { from: string; to: string };
    if (!from || !to) {
      reply.code(400);
      throw new Error('from and to query parameters are required');
    }

    const cacheKey = `operations:triggers:${from}:${to}`;
    const cacheTTL = 3300;

    try {
      const { rows, cached } = await queryWithCache<TriggerKPIs>(
        cacheKey,
        cacheTTL,
        `SELECT
          COUNT(*)::integer                                                      AS total_triggers,
          COUNT(*) FILTER (WHERE status = 'success')::integer                   AS successful_triggers,
          COUNT(*) FILTER (WHERE status = 'failed' OR has_error)::integer       AS failed_triggers,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'success')::numeric
            / NULLIF(COUNT(*), 0) * 100, 1
          )::numeric                                                             AS success_rate,
          ROUND(AVG(execution_duration_seconds)::numeric, 2)                    AS avg_duration_sec,
          COUNT(DISTINCT trigger_id)::integer                                   AS distinct_triggers,
          COUNT(DISTINCT target_type)::integer                                  AS distinct_target_types
         FROM gold.fact_trigger_executions
         WHERE execution_created_at >= $1::timestamp
           AND execution_created_at <= ($2::date + INTERVAL '1 day')`,
        [from, to]
      );

      const defaults: TriggerKPIs = {
        total_triggers: 0, successful_triggers: 0, failed_triggers: 0,
        success_rate: 0, avg_duration_sec: 0,
        distinct_triggers: 0, distinct_target_types: 0,
      };

      return {
        data: rows[0] || defaults,
        meta: { from, to, generated_at: new Date().toISOString(), cached },
      };
    } catch (error: any) {
      // Table may not exist in all environments (e.g. staging)
      if (error?.code === '42P01') {
        return {
          data: { total_triggers: 0, successful_triggers: 0, failed_triggers: 0,
                  success_rate: 0, avg_duration_sec: 0, distinct_triggers: 0, distinct_target_types: 0 },
          meta: { from, to, generated_at: new Date().toISOString(), cached: false },
        };
      }
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch trigger KPIs');
    }
  });

}
