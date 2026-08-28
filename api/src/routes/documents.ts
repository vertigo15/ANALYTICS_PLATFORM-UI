import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface DocumentKPIs {
  total_documents: number;
  success_rate: number;
  avg_chunks_per_doc: number;
  currently_failing: number;
  avg_words_per_chunk: number;
  docs_with_embeddings: number;
  embedding_eligible_documents: number;
  embedding_coverage: number;
}

interface DocumentFunnel {
  status: string;
  count: number;
}

interface DailyDocument {
  date: string;
  status: string;
  count: number;
}

interface DocumentByTechnique {
  parsing_technique: string;
  uploaded: number;
  processed: number;
  failed: number;
  success_rate: number;
  avg_chunks_per_doc: number;
  avg_words_per_chunk: number;
}

interface DocumentByTypeDaily {
  date: string;
  content_type_group: string;
  doc_count: number;
  total_size_bytes: number;
  total_embeddings: number;
  est_cost_usd: number;
}

interface DocumentListItem {
  document_id: string;
  file_name: string;
  content_type_group: string | null;
  parsing_technique: string | null;
  status: string;
  file_size_bytes: number;
  total_chunks: number | null;
  total_words: number | null;
  has_embeddings: boolean;
  owner_email: string | null;
  document_created_at: string;
}

interface TopUploader {
  email: string;
  total_documents: number;
  processed: number;
  failed: number;
  success_rate: number;
}

interface ContentTypeBreakdown {
  content_type_group: string;
  doc_count: number;
  total_size_bytes: number;
  processed: number;
  failed: number;
  success_rate: number;
}

interface FailureCorrelation {
  dimension: string;
  bucket: string;
  total: number;
  failed: number;
  failure_rate: number;
}

interface DocumentLoadSummary {
  total_documents: number;
  total_size_bytes: number;
  avg_file_size_bytes: number;
  avg_upload_duration_seconds: number;
  p50_upload_duration_seconds: number;
  p95_upload_duration_seconds: number;
  avg_processing_duration_seconds: number;
  p50_processing_duration_seconds: number;
  p95_processing_duration_seconds: number;
  processed_documents: number;
  pending_documents: number;
  failed_documents: number;
  pending_with_completed_upload: number;
  pending_without_processing_job: number;
  pending_over_7d: number;
  failed_upload_documents: number;
  avg_recorded_wait_seconds: number;
  p50_recorded_wait_seconds: number;
  p95_recorded_wait_seconds: number;
  peak_day: string | null;
  peak_day_documents: number;
}

interface DocumentLoadDaily {
  date: string;
  documents: number;
  total_size_bytes: number;
  avg_upload_duration_seconds: number;
  avg_processing_duration_seconds: number;
  processed_documents: number;
  pending_documents: number;
  failed_documents: number;
}

interface DocumentLoadAnalysis {
  summary: DocumentLoadSummary;
  daily: DocumentLoadDaily[];
}

interface DocumentStageMetric {
  stage_order: number;
  stage_key: string;
  stage_name: string;
  eligible_documents: number;
  succeeded_documents: number;
  failed_documents: number;
  pending_documents: number;
  success_rate: number;
  avg_seconds: number;
  p50_seconds: number;
  p95_seconds: number;
  timing_definition: string;
  timing_is_estimate: boolean;
}

interface DocumentStageAnalysis {
  summary: {
    uploaded_documents: number;
    ready_documents: number;
    incomplete_documents: number;
    end_to_end_success_rate: number;
    avg_end_to_end_seconds: number;
    p50_end_to_end_seconds: number;
    p95_end_to_end_seconds: number;
  };
  stages: DocumentStageMetric[];
  telemetry: {
    upload_data_through: string | null;
    processing_data_through: string | null;
    end_to_end_sample_size: number;
    chunk_timing_is_estimate: boolean;
  };
}

interface DocumentListResponse {
  data: DocumentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

function documentOutcomeSql(alias = ''): string {
  const column = (name: string) => alias ? `${alias}.${name}` : name;
  return `CASE
    WHEN UPPER(COALESCE(${column('status')}, '')) = 'FAILED'
      OR UPPER(COALESCE(${column('active_processing_status')}, '')) = 'FAILED'
      OR UPPER(COALESCE(${column('latest_upload_attempt_status')}, '')) = 'FAILED'
      THEN 'FAILED'
    WHEN UPPER(COALESCE(${column('active_processing_status')}, '')) IN ('COMPLETED', 'READY')
      THEN 'PROCESSED'
    ELSE 'PENDING'
  END`;
}

export default async function documentsRoutes(fastify: FastifyInstance) {
  const cacheTTL = 3300; // 55 minutes

  // GET /api/v1/documents/kpis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentKPIs> }>(
    '/kpis',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:kpis:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND organization_id = $3' : '';

      try {
        const sql = `
          WITH scoped_docs AS (
            SELECT
              *,
              ${documentOutcomeSql()} AS outcome
            FROM gold.fact_document_processing
            WHERE document_created_at >= $1::timestamp
              AND document_created_at < ($2::date + INTERVAL '1 day')
              AND COALESCE(is_deleted, false) = false
              ${orgFilter}
          ),
          period_docs AS (
            SELECT
              COUNT(DISTINCT document_id) as total_docs,
              COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PROCESSED')
                AS successful_docs,
              COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'FAILED')
                AS failed_docs,
              AVG(CASE
                WHEN outcome = 'PROCESSED' AND total_chunks IS NOT NULL
                THEN total_chunks
              END) as avg_chunks,
              CASE
                WHEN SUM(CASE
                  WHEN outcome = 'PROCESSED' AND total_chunks > 0
                  THEN total_chunks ELSE 0
                END) > 0
                THEN SUM(CASE
                  WHEN outcome = 'PROCESSED' AND total_chunks > 0
                  THEN total_words ELSE 0
                END)::numeric
                  / SUM(CASE
                    WHEN outcome = 'PROCESSED' AND total_chunks > 0
                    THEN total_chunks ELSE 0
                  END)::numeric
                ELSE 0
              END as avg_words_per_chunk,
              COUNT(DISTINCT CASE
                WHEN outcome = 'PROCESSED' AND has_embeddings
                THEN document_id
              END) as docs_with_embeddings
            FROM scoped_docs
          ),
          currently_failing AS (
            SELECT COUNT(DISTINCT document_id) as failing_count
            FROM scoped_docs
            WHERE outcome = 'FAILED'
          )
          SELECT
            COALESCE(pd.total_docs, 0)::integer             AS total_documents,
            CASE
              WHEN (pd.successful_docs + pd.failed_docs) > 0
              THEN (
                pd.successful_docs::numeric
                / (pd.successful_docs + pd.failed_docs)::numeric
                * 100
              )
              ELSE 0
            END::numeric                                     AS success_rate,
            COALESCE(pd.avg_chunks, 0)::numeric             AS avg_chunks_per_doc,
            COALESCE(cf.failing_count, 0)::integer          AS currently_failing,
            COALESCE(pd.avg_words_per_chunk, 0)::numeric    AS avg_words_per_chunk,
            COALESCE(pd.docs_with_embeddings, 0)::integer   AS docs_with_embeddings,
            COALESCE(pd.successful_docs, 0)::integer        AS embedding_eligible_documents,
            CASE
              WHEN pd.successful_docs > 0
              THEN pd.docs_with_embeddings::numeric / pd.successful_docs::numeric
              ELSE 0
            END::numeric                                     AS embedding_coverage
          FROM period_docs pd
          CROSS JOIN currently_failing cf
        `;

        const { rows, cached } = await queryWithCache<DocumentKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          params
        );

        if (rows.length === 0) {
          return {
            data: {
              total_documents: 0,
              success_rate: 0,
              avg_chunks_per_doc: 0,
              currently_failing: 0,
              avg_words_per_chunk: 0,
              docs_with_embeddings: 0,
              embedding_eligible_documents: 0,
              embedding_coverage: 0,
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
        throw new Error('Failed to fetch document KPIs');
      }
    }
  );

  // GET /api/v1/documents/load-analysis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentLoadAnalysis> }>(
    '/load-analysis',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:load-analysis:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND organization_id = $3' : '';
      const baseCte = `
        WITH base AS (
          SELECT
            document_id,
            document_created_at,
            COALESCE(file_size_bytes, 0)::bigint AS file_size_bytes,
            max_processing_duration_seconds,
            COALESCE(processing_job_count, 0)::integer AS processing_job_count,
            latest_upload_attempt_status,
            CASE
              WHEN first_upload_attempt_started_at IS NOT NULL
                AND COALESCE(
                  last_upload_attempt_completed_at,
                  last_upload_attempt_failed_at
                ) >= first_upload_attempt_started_at
              THEN EXTRACT(EPOCH FROM (
                COALESCE(
                  last_upload_attempt_completed_at,
                  last_upload_attempt_failed_at
                ) - first_upload_attempt_started_at
              ))
            END AS upload_duration_seconds,
            ${documentOutcomeSql()} AS outcome
          FROM gold.fact_document_processing
          WHERE document_created_at >= $1::timestamp
            AND document_created_at < ($2::date + INTERVAL '1 day')
            AND COALESCE(is_deleted, false) = false
            ${orgFilter}
        )
      `;

      const summarySql = `
        ${baseCte},
        daily_load AS (
          SELECT
            DATE(document_created_at) AS date_day,
            COUNT(DISTINCT document_id)::integer AS documents
          FROM base
          GROUP BY DATE(document_created_at)
        ),
        peak_day AS (
          SELECT date_day, documents
          FROM daily_load
          ORDER BY documents DESC, date_day DESC
          LIMIT 1
        )
        SELECT
          COUNT(DISTINCT document_id)::integer AS total_documents,
          COALESCE(SUM(file_size_bytes), 0)::bigint AS total_size_bytes,
          COALESCE(AVG(file_size_bytes), 0)::numeric AS avg_file_size_bytes,
          COALESCE(AVG(upload_duration_seconds), 0)::numeric AS avg_upload_duration_seconds,
          COALESCE(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY upload_duration_seconds)
              FILTER (WHERE upload_duration_seconds IS NOT NULL),
            0
          )::numeric AS p50_upload_duration_seconds,
          COALESCE(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY upload_duration_seconds)
              FILTER (WHERE upload_duration_seconds IS NOT NULL),
            0
          )::numeric AS p95_upload_duration_seconds,
          COALESCE(AVG(max_processing_duration_seconds), 0)::numeric
            AS avg_processing_duration_seconds,
          COALESCE(
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY max_processing_duration_seconds)
              FILTER (WHERE max_processing_duration_seconds IS NOT NULL),
            0
          )::numeric AS p50_processing_duration_seconds,
          COALESCE(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY max_processing_duration_seconds)
              FILTER (WHERE max_processing_duration_seconds IS NOT NULL),
            0
          )::numeric AS p95_processing_duration_seconds,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PROCESSED')::integer
            AS processed_documents,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PENDING')::integer
            AS pending_documents,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'FAILED')::integer
            AS failed_documents,
          COUNT(DISTINCT document_id) FILTER (
            WHERE outcome = 'PENDING'
              AND UPPER(COALESCE(latest_upload_attempt_status, '')) = 'COMPLETED'
          )::integer AS pending_with_completed_upload,
          COUNT(DISTINCT document_id) FILTER (
            WHERE outcome = 'PENDING'
              AND UPPER(COALESCE(latest_upload_attempt_status, '')) = 'COMPLETED'
              AND processing_job_count = 0
          )::integer AS pending_without_processing_job,
          COUNT(DISTINCT document_id) FILTER (
            WHERE outcome = 'PENDING'
              AND document_created_at < NOW() - INTERVAL '7 days'
          )::integer AS pending_over_7d,
          COUNT(DISTINCT document_id) FILTER (
            WHERE outcome = 'FAILED'
              AND UPPER(COALESCE(latest_upload_attempt_status, '')) = 'FAILED'
          )::integer AS failed_upload_documents,
          COALESCE(
            AVG(upload_duration_seconds + max_processing_duration_seconds)
              FILTER (
                WHERE outcome = 'PROCESSED'
                  AND upload_duration_seconds IS NOT NULL
                  AND max_processing_duration_seconds IS NOT NULL
              ),
            0
          )::numeric AS avg_recorded_wait_seconds,
          COALESCE(
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY upload_duration_seconds + max_processing_duration_seconds
            ) FILTER (
              WHERE outcome = 'PROCESSED'
                AND upload_duration_seconds IS NOT NULL
                AND max_processing_duration_seconds IS NOT NULL
            ),
            0
          )::numeric AS p50_recorded_wait_seconds,
          COALESCE(
            PERCENTILE_CONT(0.95) WITHIN GROUP (
              ORDER BY upload_duration_seconds + max_processing_duration_seconds
            ) FILTER (
              WHERE outcome = 'PROCESSED'
                AND upload_duration_seconds IS NOT NULL
                AND max_processing_duration_seconds IS NOT NULL
            ),
            0
          )::numeric AS p95_recorded_wait_seconds,
          (SELECT date_day::text FROM peak_day) AS peak_day,
          COALESCE((SELECT documents FROM peak_day), 0)::integer AS peak_day_documents
        FROM base
      `;

      const dailySql = `
        ${baseCte}
        SELECT
          DATE(document_created_at)::text AS date,
          COUNT(DISTINCT document_id)::integer AS documents,
          COALESCE(SUM(file_size_bytes), 0)::bigint AS total_size_bytes,
          COALESCE(AVG(upload_duration_seconds), 0)::numeric AS avg_upload_duration_seconds,
          COALESCE(AVG(max_processing_duration_seconds), 0)::numeric
            AS avg_processing_duration_seconds,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PROCESSED')::integer
            AS processed_documents,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PENDING')::integer
            AS pending_documents,
          COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'FAILED')::integer
            AS failed_documents
        FROM base
        GROUP BY DATE(document_created_at)
        ORDER BY DATE(document_created_at)
      `;

      try {
        const [summaryResult, dailyResult] = await Promise.all([
          queryWithCache<DocumentLoadSummary>(
            `${cacheKey}:summary`,
            cacheTTL,
            summarySql,
            params
          ),
          queryWithCache<DocumentLoadDaily>(
            `${cacheKey}:daily`,
            cacheTTL,
            dailySql,
            params
          ),
        ]);

        return {
          data: {
            summary: summaryResult.rows[0],
            daily: dailyResult.rows,
          },
          meta: {
            from,
            to,
            generated_at: new Date().toISOString(),
            cached: summaryResult.cached && dailyResult.cached,
          },
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500);
        throw new Error('Failed to fetch document load analysis');
      }
    }
  );

  // GET /api/v1/documents/stage-analysis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentStageAnalysis> }>(
    '/stage-analysis',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:stage-analysis:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND organization_id = $3' : '';

      try {
        const sql = `
          WITH latest_uploads AS (
            SELECT DISTINCT ON (document_id)
              document_id,
              organization_id,
              started_at AS upload_started_at,
              completed_at AS upload_completed_at,
              failed_at AS upload_failed_at,
              (
                LOWER(COALESCE(status, '')) IN (
                  'completed', 'success', 'succeeded', 'processed'
                )
                AND failed_at IS NULL
              ) AS upload_succeeded,
              (
                LOWER(COALESCE(status, '')) IN (
                  'failed', 'error', 'timed_out', 'timeout'
                )
                OR failed_at IS NOT NULL
              ) AS upload_failed,
              CASE
                WHEN completed_at >= started_at
                  THEN EXTRACT(EPOCH FROM (completed_at - started_at))
                WHEN failed_at >= started_at
                  THEN EXTRACT(EPOCH FROM (failed_at - started_at))
              END AS upload_seconds
            FROM bronze.doc_upload_attempts
            WHERE started_at >= $1::timestamp
              AND started_at < ($2::date + INTERVAL '1 day')
              AND document_id IS NOT NULL
              AND NOT COALESCE(_is_deleted, false)
              ${orgFilter}
            ORDER BY
              document_id,
              COALESCE(completed_at, failed_at, started_at) DESC,
              COALESCE(attempt_number, 0) DESC
          ),
          processing_jobs AS (
            SELECT DISTINCT ON (u.document_id)
              u.*,
              p.id AS processing_id,
              p.created_at AS processing_created_at
            FROM latest_uploads u
            LEFT JOIN bronze.doc_document_processing p
              ON p.document_id = u.document_id
              AND NOT COALESCE(p._is_deleted, false)
              AND p.created_at >= u.upload_started_at - INTERVAL '5 minutes'
              AND p.created_at < u.upload_started_at + INTERVAL '7 days'
            ORDER BY u.document_id, p.created_at DESC NULLS LAST
          ),
          task_rollup AS (
            SELECT
              t.document_processing_id,
              BOOL_OR(
                UPPER(t.task_type) = 'TEXT_EXTRACTION'
                AND UPPER(t.status) = 'COMPLETED'
              ) AS parse_succeeded,
              BOOL_OR(
                UPPER(t.task_type) = 'TEXT_EXTRACTION'
                AND UPPER(t.status) = 'FAILED'
              ) AS parse_failed,
              MIN(t.queued_at) FILTER (
                WHERE UPPER(t.task_type) = 'TEXT_EXTRACTION'
              ) AS parse_queued_at,
              MAX(t.completed_at) FILTER (
                WHERE UPPER(t.task_type) = 'TEXT_EXTRACTION'
                  AND UPPER(t.status) = 'COMPLETED'
              ) AS parse_completed_at,
              BOOL_OR(
                UPPER(t.task_type) = 'EMBEDDING'
                AND LOWER(COALESCE(t.variant, 'original')) = 'original'
              ) AS embedding_present,
              BOOL_OR(
                UPPER(t.task_type) = 'EMBEDDING'
                AND LOWER(COALESCE(t.variant, 'original')) = 'original'
                AND UPPER(t.status) = 'COMPLETED'
              ) AS embedding_succeeded,
              BOOL_OR(
                UPPER(t.task_type) = 'EMBEDDING'
                AND LOWER(COALESCE(t.variant, 'original')) = 'original'
                AND UPPER(t.status) = 'FAILED'
              ) AS embedding_failed,
              MIN(t.queued_at) FILTER (
                WHERE UPPER(t.task_type) = 'EMBEDDING'
                  AND LOWER(COALESCE(t.variant, 'original')) = 'original'
              ) AS embedding_queued_at,
              MAX(t.completed_at) FILTER (
                WHERE UPPER(t.task_type) = 'EMBEDDING'
                  AND LOWER(COALESCE(t.variant, 'original')) = 'original'
                  AND UPPER(t.status) = 'COMPLETED'
              ) AS embedding_completed_at,
              MAX(COALESCE(t.completed_at, t.started_at, t.queued_at, t.created_at))
                AS last_task_event_at
            FROM bronze.doc_processing_tasks t
            INNER JOIN processing_jobs j
              ON j.processing_id = t.document_processing_id
            WHERE NOT COALESCE(t._is_deleted, false)
            GROUP BY t.document_processing_id
          ),
          lifecycle AS (
            SELECT
              j.document_id,
              j.upload_started_at,
              j.upload_completed_at,
              j.upload_succeeded,
              j.upload_failed,
              j.upload_seconds,
              j.processing_id,
              j.processing_created_at,
              COALESCE(t.parse_succeeded, false) AS parse_succeeded,
              COALESCE(t.parse_failed, false) AS parse_failed,
              t.parse_queued_at,
              t.parse_completed_at,
              COALESCE(t.embedding_present, false) AS chunk_succeeded,
              COALESCE(t.embedding_succeeded, false) AS embedding_succeeded,
              COALESCE(t.embedding_failed, false) AS embedding_failed,
              t.embedding_queued_at,
              t.embedding_completed_at,
              t.last_task_event_at,
              EXTRACT(EPOCH FROM (
                j.processing_created_at - j.upload_completed_at
              )) AS handoff_seconds,
              EXTRACT(EPOCH FROM (
                t.parse_completed_at - t.parse_queued_at
              )) AS parse_seconds,
              EXTRACT(EPOCH FROM (
                t.embedding_queued_at - t.parse_completed_at
              )) AS chunk_seconds,
              EXTRACT(EPOCH FROM (
                t.embedding_completed_at - t.embedding_queued_at
              )) AS embedding_seconds,
              EXTRACT(EPOCH FROM (
                t.embedding_completed_at - j.upload_started_at
              )) AS end_to_end_seconds
            FROM processing_jobs j
            LEFT JOIN task_rollup t
              ON t.document_processing_id = j.processing_id
          ),
          overall AS (
            SELECT
              COUNT(*) FILTER (WHERE upload_succeeded)::integer AS uploaded_documents,
              COUNT(*) FILTER (WHERE embedding_succeeded)::integer AS ready_documents,
              (
                COUNT(*) FILTER (WHERE upload_succeeded)
                - COUNT(*) FILTER (WHERE embedding_succeeded)
              )::integer AS incomplete_documents,
              COALESCE(
                100.0 * COUNT(*) FILTER (WHERE embedding_succeeded)
                / NULLIF(COUNT(*) FILTER (WHERE upload_succeeded), 0),
                0
              )::numeric AS end_to_end_success_rate,
              COALESCE(
                AVG(end_to_end_seconds) FILTER (
                  WHERE embedding_succeeded AND end_to_end_seconds >= 0
                ),
                0
              )::numeric AS avg_end_to_end_seconds,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY end_to_end_seconds)
                  FILTER (WHERE embedding_succeeded AND end_to_end_seconds >= 0),
                0
              )::numeric AS p50_end_to_end_seconds,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY end_to_end_seconds)
                  FILTER (WHERE embedding_succeeded AND end_to_end_seconds >= 0),
                0
              )::numeric AS p95_end_to_end_seconds,
              COUNT(*) FILTER (
                WHERE embedding_succeeded AND end_to_end_seconds >= 0
              )::integer AS end_to_end_sample_size,
              MAX(upload_started_at) AS upload_data_through,
              MAX(last_task_event_at) AS processing_data_through
            FROM lifecycle
          ),
          stage_metrics AS (
            SELECT
              1::integer AS stage_order,
              'upload'::text AS stage_key,
              'Blob upload'::text AS stage_name,
              COUNT(*)::integer AS eligible_documents,
              COUNT(*) FILTER (WHERE upload_succeeded)::integer AS succeeded_documents,
              COUNT(*) FILTER (WHERE upload_failed)::integer AS failed_documents,
              COUNT(*) FILTER (
                WHERE NOT upload_succeeded AND NOT upload_failed
              )::integer AS pending_documents,
              COALESCE(
                100.0 * COUNT(*) FILTER (WHERE upload_succeeded)
                / NULLIF(COUNT(*), 0),
                0
              )::numeric AS success_rate,
              COALESCE(
                AVG(upload_seconds) FILTER (
                  WHERE upload_succeeded AND upload_seconds >= 0
                ),
                0
              )::numeric AS avg_seconds,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY upload_seconds)
                  FILTER (WHERE upload_succeeded AND upload_seconds >= 0),
                0
              )::numeric AS p50_seconds,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY upload_seconds)
                  FILTER (WHERE upload_succeeded AND upload_seconds >= 0),
                0
              )::numeric AS p95_seconds,
              'Upload attempt start to blob completion'::text AS timing_definition,
              false AS timing_is_estimate
            FROM lifecycle

            UNION ALL

            SELECT
              2,
              'handoff',
              'Processing handoff',
              COUNT(*) FILTER (WHERE upload_succeeded)::integer,
              COUNT(*) FILTER (
                WHERE upload_succeeded AND processing_id IS NOT NULL
              )::integer,
              0::integer,
              COUNT(*) FILTER (
                WHERE upload_succeeded AND processing_id IS NULL
              )::integer,
              COALESCE(
                100.0 * COUNT(*) FILTER (
                  WHERE upload_succeeded AND processing_id IS NOT NULL
                ) / NULLIF(COUNT(*) FILTER (WHERE upload_succeeded), 0),
                0
              )::numeric,
              COALESCE(
                AVG(handoff_seconds) FILTER (
                  WHERE upload_succeeded
                    AND processing_id IS NOT NULL
                    AND handoff_seconds >= 0
                ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY handoff_seconds)
                  FILTER (
                    WHERE upload_succeeded
                      AND processing_id IS NOT NULL
                      AND handoff_seconds >= 0
                  ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY handoff_seconds)
                  FILTER (
                    WHERE upload_succeeded
                      AND processing_id IS NOT NULL
                      AND handoff_seconds >= 0
                  ),
                0
              )::numeric,
              'Blob completion to processing job creation',
              false
            FROM lifecycle

            UNION ALL

            SELECT
              3,
              'parsing',
              'Parse / text extraction',
              COUNT(*) FILTER (WHERE processing_id IS NOT NULL)::integer,
              COUNT(*) FILTER (
                WHERE processing_id IS NOT NULL AND parse_succeeded
              )::integer,
              COUNT(*) FILTER (
                WHERE processing_id IS NOT NULL
                  AND parse_failed
                  AND NOT parse_succeeded
              )::integer,
              COUNT(*) FILTER (
                WHERE processing_id IS NOT NULL
                  AND NOT parse_succeeded
                  AND NOT parse_failed
              )::integer,
              COALESCE(
                100.0 * COUNT(*) FILTER (
                  WHERE processing_id IS NOT NULL AND parse_succeeded
                ) / NULLIF(COUNT(*) FILTER (WHERE processing_id IS NOT NULL), 0),
                0
              )::numeric,
              COALESCE(
                AVG(parse_seconds) FILTER (
                  WHERE parse_succeeded AND parse_seconds >= 0
                ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY parse_seconds)
                  FILTER (WHERE parse_succeeded AND parse_seconds >= 0),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY parse_seconds)
                  FILTER (WHERE parse_succeeded AND parse_seconds >= 0),
                0
              )::numeric,
              'Text-extraction task queued to completed',
              false
            FROM lifecycle

            UNION ALL

            SELECT
              4,
              'chunking',
              'Chunking / persistence',
              COUNT(*) FILTER (WHERE parse_succeeded)::integer,
              COUNT(*) FILTER (
                WHERE parse_succeeded AND chunk_succeeded
              )::integer,
              0::integer,
              COUNT(*) FILTER (
                WHERE parse_succeeded AND NOT chunk_succeeded
              )::integer,
              COALESCE(
                100.0 * COUNT(*) FILTER (
                  WHERE parse_succeeded AND chunk_succeeded
                ) / NULLIF(COUNT(*) FILTER (WHERE parse_succeeded), 0),
                0
              )::numeric,
              COALESCE(
                AVG(chunk_seconds) FILTER (
                  WHERE parse_succeeded AND chunk_succeeded AND chunk_seconds >= 0
                ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY chunk_seconds)
                  FILTER (
                    WHERE parse_succeeded AND chunk_succeeded AND chunk_seconds >= 0
                  ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY chunk_seconds)
                  FILTER (
                    WHERE parse_succeeded AND chunk_succeeded AND chunk_seconds >= 0
                  ),
                0
              )::numeric,
              'Parse completion to original embedding queued',
              true
            FROM lifecycle

            UNION ALL

            SELECT
              5,
              'embedding',
              'Embedding',
              COUNT(*) FILTER (WHERE parse_succeeded AND chunk_succeeded)::integer,
              COUNT(*) FILTER (
                WHERE parse_succeeded AND chunk_succeeded AND embedding_succeeded
              )::integer,
              COUNT(*) FILTER (
                WHERE parse_succeeded
                  AND chunk_succeeded
                  AND embedding_failed
                  AND NOT embedding_succeeded
              )::integer,
              COUNT(*) FILTER (
                WHERE parse_succeeded
                  AND chunk_succeeded
                  AND NOT embedding_succeeded
                  AND NOT embedding_failed
              )::integer,
              COALESCE(
                100.0 * COUNT(*) FILTER (
                  WHERE parse_succeeded AND chunk_succeeded AND embedding_succeeded
                ) / NULLIF(
                  COUNT(*) FILTER (WHERE parse_succeeded AND chunk_succeeded),
                  0
                ),
                0
              )::numeric,
              COALESCE(
                AVG(embedding_seconds) FILTER (
                  WHERE embedding_succeeded AND embedding_seconds >= 0
                ),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY embedding_seconds)
                  FILTER (WHERE embedding_succeeded AND embedding_seconds >= 0),
                0
              )::numeric,
              COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY embedding_seconds)
                  FILTER (WHERE embedding_succeeded AND embedding_seconds >= 0),
                0
              )::numeric,
              'Original embedding task queued to completed',
              false
            FROM lifecycle
          )
          SELECT
            JSONB_BUILD_OBJECT(
              'uploaded_documents', o.uploaded_documents,
              'ready_documents', o.ready_documents,
              'incomplete_documents', o.incomplete_documents,
              'end_to_end_success_rate', o.end_to_end_success_rate,
              'avg_end_to_end_seconds', o.avg_end_to_end_seconds,
              'p50_end_to_end_seconds', o.p50_end_to_end_seconds,
              'p95_end_to_end_seconds', o.p95_end_to_end_seconds
            ) AS summary,
            COALESCE(
              (
                SELECT JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'stage_order', s.stage_order,
                    'stage_key', s.stage_key,
                    'stage_name', s.stage_name,
                    'eligible_documents', s.eligible_documents,
                    'succeeded_documents', s.succeeded_documents,
                    'failed_documents', s.failed_documents,
                    'pending_documents', s.pending_documents,
                    'success_rate', s.success_rate,
                    'avg_seconds', s.avg_seconds,
                    'p50_seconds', s.p50_seconds,
                    'p95_seconds', s.p95_seconds,
                    'timing_definition', s.timing_definition,
                    'timing_is_estimate', s.timing_is_estimate
                  )
                  ORDER BY s.stage_order
                )
                FROM stage_metrics s
              ),
              '[]'::jsonb
            ) AS stages,
            JSONB_BUILD_OBJECT(
              'upload_data_through', o.upload_data_through,
              'processing_data_through', o.processing_data_through,
              'end_to_end_sample_size', o.end_to_end_sample_size,
              'chunk_timing_is_estimate', true
            ) AS telemetry
          FROM overall o
        `;

        const { rows, cached } = await queryWithCache<DocumentStageAnalysis>(
          cacheKey,
          300,
          sql,
          params
        );

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
        throw new Error('Failed to fetch document stage analysis');
      }
    }
  );

  // GET /api/v1/documents/funnel
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentFunnel[]> }>(
    '/funnel',
    async (request, reply) => {
      const { organization_id } = request.query;
      const cacheKey = `documents:funnel:${organization_id || 'all'}`;
      const params = organization_id ? [organization_id] : [];
      const orgFilter = organization_id ? 'WHERE organization_id = $1' : '';

      try {
        const sql = `
          WITH funnel AS (
            SELECT
              ${documentOutcomeSql()} AS status,
              COUNT(DISTINCT document_id)::integer as count
            FROM gold.fact_document_processing
            ${orgFilter}
            GROUP BY 1
          )
          SELECT status, count
          FROM funnel
          ORDER BY
            CASE status
              WHEN 'UPLOADED' THEN 1
              WHEN 'PROCESSING' THEN 2
              WHEN 'PROCESSED' THEN 3
              WHEN 'FAILED' THEN 4
              ELSE 5
            END
        `;

        const { rows, cached } = await queryWithCache<DocumentFunnel>(
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
        throw new Error('Failed to fetch document funnel');
      }
    }
  );

  // GET /api/v1/documents/daily
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DailyDocument[]> }>(
    '/daily',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:daily:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND organization_id = $3' : '';

      try {
        const sql = `
          SELECT
            DATE(document_created_at)::text as date,
            ${documentOutcomeSql()} AS status,
            COUNT(DISTINCT document_id)::integer as count
          FROM gold.fact_document_processing
          WHERE document_created_at >= $1::timestamp
            AND document_created_at < ($2::date + INTERVAL '1 day')
            ${orgFilter}
          GROUP BY DATE(document_created_at), 2
          ORDER BY date, status
        `;

        const { rows, cached } = await queryWithCache<DailyDocument>(
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
        throw new Error('Failed to fetch daily documents');
      }
    }
  );

  // GET /api/v1/documents/by-technique
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentByTechnique[]> }>(
    '/by-technique',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:by-technique:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND organization_id = $3' : '';

      try {
        const sql = `
          WITH scoped_docs AS (
            SELECT
              *,
              ${documentOutcomeSql()} AS outcome
            FROM gold.fact_document_processing
            WHERE document_created_at >= $1::timestamp
              AND document_created_at < ($2::date + INTERVAL '1 day')
              ${orgFilter}
          )
          SELECT
            COALESCE(parsing_technique, 'Unknown') as parsing_technique,
            COUNT(DISTINCT document_id)::integer as uploaded,
            COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'PROCESSED')::integer
              AS processed,
            COUNT(DISTINCT document_id) FILTER (WHERE outcome = 'FAILED')::integer
              AS failed,
            CASE 
              WHEN COUNT(DISTINCT document_id)
                FILTER (WHERE outcome IN ('PROCESSED', 'FAILED')) > 0
              THEN (
                COUNT(DISTINCT document_id)
                  FILTER (WHERE outcome = 'PROCESSED')::numeric
                / COUNT(DISTINCT document_id)
                  FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::numeric
                * 100
              )
              ELSE 0 
            END::numeric as success_rate,
            AVG(CASE
              WHEN outcome = 'PROCESSED' AND total_chunks IS NOT NULL
              THEN total_chunks
            END)::numeric as avg_chunks_per_doc,
            (
              SUM(CASE
                WHEN outcome = 'PROCESSED' AND total_chunks > 0
                THEN total_words ELSE 0
              END)::numeric
              / NULLIF(SUM(CASE
                WHEN outcome = 'PROCESSED' AND total_chunks > 0
                THEN total_chunks ELSE 0
              END), 0)
            )::numeric as avg_words_per_chunk
          FROM scoped_docs
          GROUP BY parsing_technique
          ORDER BY uploaded DESC
        `;

        const { rows, cached } = await queryWithCache<DocumentByTechnique>(
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
        throw new Error('Failed to fetch documents by technique');
      }
    }
  );

  // GET /api/v1/documents/by-type-daily
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentByTypeDaily[]> }>(
    '/by-type-daily',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:by-type-daily:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND fp.organization_id = $3' : '';

      try {
        const sql = `
          SELECT
            DATE(fp.document_created_at)::text as date,
            COALESCE(d.content_type_group, 'Unknown') as content_type_group,
            COUNT(DISTINCT fp.document_id)::integer as doc_count,
            COALESCE(SUM(fp.file_size_bytes), 0)::bigint as total_size_bytes,
            COALESCE(SUM(CASE WHEN fp.has_embeddings THEN fp.total_chunks ELSE 0 END), 0)::integer as total_embeddings,
            0::numeric as est_cost_usd
          FROM gold.fact_document_processing fp
          LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
          WHERE fp.document_created_at >= $1::timestamp
            AND fp.document_created_at < ($2::date + INTERVAL '1 day')
            ${orgFilter}
          GROUP BY DATE(fp.document_created_at), COALESCE(d.content_type_group, 'Unknown')
          ORDER BY date, content_type_group
        `;

        const { rows, cached } = await queryWithCache<DocumentByTypeDaily>(
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
        throw new Error('Failed to fetch documents by type daily');
      }
    }
  );

  // GET /api/v1/documents/top-uploaders
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<TopUploader[]> }>(
    '/top-uploaders',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:top-uploaders:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND fp.organization_id = $3' : '';

      try {
        const sql = `
          WITH scoped_docs AS (
            SELECT
              fp.*,
              ${documentOutcomeSql('fp')} AS outcome
            FROM gold.fact_document_processing fp
            WHERE fp.document_created_at >= $1::timestamp
              AND fp.document_created_at < ($2::date + INTERVAL '1 day')
              ${orgFilter}
          )
          SELECT
            COALESCE(u.email, 'Unknown') as email,
            COUNT(DISTINCT fp.document_id)::integer as total_documents,
            COUNT(DISTINCT fp.document_id)
              FILTER (WHERE fp.outcome = 'PROCESSED')::integer AS processed,
            COUNT(DISTINCT fp.document_id)
              FILTER (WHERE fp.outcome = 'FAILED')::integer AS failed,
            CASE
              WHEN COUNT(DISTINCT fp.document_id)
                FILTER (WHERE fp.outcome IN ('PROCESSED', 'FAILED')) > 0
              THEN (
                COUNT(DISTINCT fp.document_id)
                  FILTER (WHERE fp.outcome = 'PROCESSED')::numeric
                / COUNT(DISTINCT fp.document_id)
                  FILTER (WHERE fp.outcome IN ('PROCESSED', 'FAILED'))::numeric
                * 100
              )
              ELSE 0
            END::numeric as success_rate
          FROM scoped_docs fp
          LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
          LEFT JOIN gold.dim_users u ON d.owner_user_id = u.user_id
          GROUP BY u.email
          ORDER BY total_documents DESC
          LIMIT 15
        `;

        const { rows, cached } = await queryWithCache<TopUploader>(
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
        throw new Error('Failed to fetch top uploaders');
      }
    }
  );

  // GET /api/v1/documents/content-type-breakdown
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<ContentTypeBreakdown[]> }>(
    '/content-type-breakdown',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:content-type-breakdown:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND fp.organization_id = $3' : '';

      try {
        const sql = `
          WITH scoped_docs AS (
            SELECT
              fp.*,
              ${documentOutcomeSql('fp')} AS outcome
            FROM gold.fact_document_processing fp
            WHERE fp.document_created_at >= $1::timestamp
              AND fp.document_created_at < ($2::date + INTERVAL '1 day')
              ${orgFilter}
          )
          SELECT
            COALESCE(d.content_type_group, 'Other') as content_type_group,
            COUNT(DISTINCT fp.document_id)::integer as doc_count,
            COALESCE(SUM(fp.file_size_bytes), 0)::bigint as total_size_bytes,
            COUNT(DISTINCT fp.document_id)
              FILTER (WHERE fp.outcome = 'PROCESSED')::integer AS processed,
            COUNT(DISTINCT fp.document_id)
              FILTER (WHERE fp.outcome = 'FAILED')::integer AS failed,
            CASE
              WHEN COUNT(DISTINCT fp.document_id)
                FILTER (WHERE fp.outcome IN ('PROCESSED', 'FAILED')) > 0
              THEN (
                COUNT(DISTINCT fp.document_id)
                  FILTER (WHERE fp.outcome = 'PROCESSED')::numeric
                / COUNT(DISTINCT fp.document_id)
                  FILTER (WHERE fp.outcome IN ('PROCESSED', 'FAILED'))::numeric
                * 100
              )
              ELSE 0
            END::numeric as success_rate
          FROM scoped_docs fp
          LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
          GROUP BY COALESCE(d.content_type_group, 'Other')
          ORDER BY doc_count DESC
        `;

        const { rows, cached } = await queryWithCache<ContentTypeBreakdown>(
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
        throw new Error('Failed to fetch content type breakdown');
      }
    }
  );

  // GET /api/v1/documents/failure-correlations
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<FailureCorrelation[]> }>(
    '/failure-correlations',
    async (request, reply) => {
      const { from, to, organization_id } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:failure-correlations:${from}:${to}:${organization_id || 'all'}`;
      const params = organization_id ? [from, to, organization_id] : [from, to];
      const orgFilter = organization_id ? 'AND fp.organization_id = $3' : '';

      try {
        const sql = `
          WITH base AS (
            SELECT
              fp.document_id,
              fp.status,
              fp.active_processing_status,
              fp.file_size_bytes,
              fp.parsing_technique,
              ${documentOutcomeSql('fp')} AS outcome,
              COALESCE(d.content_type_group, 'Other') as content_type_group
            FROM gold.fact_document_processing fp
            LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
            WHERE fp.document_created_at >= $1::timestamp
              AND fp.document_created_at < ($2::date + INTERVAL '1 day')
              ${orgFilter}
          ),
          by_content_type AS (
            SELECT
              'content_type' as dimension,
              content_type_group as bucket,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::integer AS total,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome = 'FAILED')::integer AS failed,
              CASE
                WHEN COUNT(DISTINCT document_id)
                  FILTER (WHERE outcome IN ('PROCESSED', 'FAILED')) > 0
                THEN (
                  COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome = 'FAILED')::numeric
                  / COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::numeric * 100
                )
                ELSE 0
              END::numeric as failure_rate
            FROM base
            GROUP BY content_type_group
          ),
          by_size AS (
            SELECT
              'file_size' as dimension,
              CASE
                WHEN file_size_bytes < 102400 THEN '0-100 KB'
                WHEN file_size_bytes < 1048576 THEN '100 KB-1 MB'
                WHEN file_size_bytes < 10485760 THEN '1-10 MB'
                ELSE '10 MB+'
              END as bucket,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::integer AS total,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome = 'FAILED')::integer AS failed,
              CASE
                WHEN COUNT(DISTINCT document_id)
                  FILTER (WHERE outcome IN ('PROCESSED', 'FAILED')) > 0
                THEN (
                  COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome = 'FAILED')::numeric
                  / COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::numeric * 100
                )
                ELSE 0
              END::numeric as failure_rate
            FROM base
            GROUP BY CASE
              WHEN file_size_bytes < 102400 THEN '0-100 KB'
              WHEN file_size_bytes < 1048576 THEN '100 KB-1 MB'
              WHEN file_size_bytes < 10485760 THEN '1-10 MB'
              ELSE '10 MB+'
            END
          ),
          by_technique AS (
            SELECT
              'parsing_technique' as dimension,
              COALESCE(parsing_technique, 'Unknown') as bucket,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::integer AS total,
              COUNT(DISTINCT document_id)
                FILTER (WHERE outcome = 'FAILED')::integer AS failed,
              CASE
                WHEN COUNT(DISTINCT document_id)
                  FILTER (WHERE outcome IN ('PROCESSED', 'FAILED')) > 0
                THEN (
                  COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome = 'FAILED')::numeric
                  / COUNT(DISTINCT document_id)
                    FILTER (WHERE outcome IN ('PROCESSED', 'FAILED'))::numeric * 100
                )
                ELSE 0
              END::numeric as failure_rate
            FROM base
            GROUP BY parsing_technique
          )
          SELECT * FROM by_content_type
          UNION ALL
          SELECT * FROM by_size
          UNION ALL
          SELECT * FROM by_technique
          ORDER BY dimension, failure_rate DESC
        `;

        const { rows, cached } = await queryWithCache<FailureCorrelation>(
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
        throw new Error('Failed to fetch failure correlations');
      }
    }
  );

  // GET /api/v1/documents/list
  fastify.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      status?: string;
      organization_id?: string;
    };
    Reply: DocumentListResponse;
  }>('/list', async (request, reply) => {
    const page = parseInt(request.query.page || '1');
    const pageSize = parseInt(request.query.pageSize || '50');
    const status = request.query.status;
    const organizationId = request.query.organization_id;

    const cacheKey = `documents:list:${page}:${pageSize}:${status || 'all'}:${organizationId || 'all'}`;

    try {
      const offset = (page - 1) * pageSize;
      const statusPredicate =
        status === 'PROCESSED' || status === 'FAILED' || status === 'PENDING'
          ? `(${documentOutcomeSql()}) = '${status}'`
          : '';
      const countConditions = [
        statusPredicate,
        organizationId ? 'organization_id = $1' : '',
      ].filter(Boolean);
      const countWhere = countConditions.length > 0
        ? `WHERE ${countConditions.join(' AND ')}`
        : '';
      const listStatusPredicate =
        status === 'PROCESSED' || status === 'FAILED' || status === 'PENDING'
          ? `(${documentOutcomeSql('fp')}) = '${status}'`
          : '';
      const listConditions = [
        listStatusPredicate,
        organizationId ? 'fp.organization_id = $3' : '',
      ].filter(Boolean);
      const listWhere = listConditions.length > 0
        ? `WHERE ${listConditions.join(' AND ')}`
        : '';

      const countSql = `
        SELECT COUNT(DISTINCT document_id)::integer as total
        FROM gold.fact_document_processing
        ${countWhere}
      `;

      const listSql = `
        SELECT DISTINCT ON (fp.document_id)
          fp.document_id,
          d.file_name,
          d.content_type_group,
          fp.parsing_technique,
          ${documentOutcomeSql('fp')} AS status,
          fp.file_size_bytes,
          fp.total_chunks,
          fp.total_words,
          fp.has_embeddings,
          u.email as owner_email,
          fp.document_created_at::text
        FROM gold.fact_document_processing fp
        LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
        LEFT JOIN gold.dim_users u ON d.owner_user_id = u.user_id
        ${listWhere}
        ORDER BY fp.document_id, fp.document_created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const countParams: string[] = organizationId ? [organizationId] : [];
      const listParams: (string | number)[] = [pageSize, offset];
      if (organizationId) {
        listParams.push(organizationId);
      }

      const countResult = await queryWithCache<{ total: number }>(
        cacheKey + ':count',
        cacheTTL,
        countSql,
        countParams
      );

      const listResult = await queryWithCache<DocumentListItem>(
        cacheKey,
        cacheTTL,
        listSql,
        listParams
      );

      return {
        data: listResult.rows,
        pagination: {
          page,
          pageSize,
          total: countResult.rows[0]?.total || 0,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      reply.code(500);
      throw new Error('Failed to fetch document list');
    }
  });
}
