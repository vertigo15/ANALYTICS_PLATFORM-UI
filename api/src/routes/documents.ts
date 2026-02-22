import { FastifyInstance } from 'fastify';
import { queryWithCache } from '../db';
import { ApiResponse, QueryParams } from '../types';

interface DocumentKPIs {
  total_documents: number;
  success_rate: number;
  avg_chunks_per_doc: number;
  currently_failing: number;
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

interface DocumentListResponse {
  data: DocumentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export default async function documentsRoutes(fastify: FastifyInstance) {
  const cacheTTL = 3300; // 55 minutes

  // GET /api/v1/documents/kpis
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentKPIs> }>(
    '/kpis',
    async (request, reply) => {
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:kpis:${from}:${to}`;

      try {
        const sql = `
          WITH period_docs AS (
            SELECT
              COUNT(DISTINCT document_id) as total_docs,
              COUNT(DISTINCT CASE WHEN status = 'PROCESSED' THEN document_id END) as processed_docs,
              AVG(CASE WHEN status = 'PROCESSED' AND total_chunks IS NOT NULL THEN total_chunks END) as avg_chunks
            FROM gold.fact_document_processing
            WHERE document_created_at >= $1 AND document_created_at <= $2
          ),
          currently_failing AS (
            SELECT COUNT(DISTINCT document_id) as failing_count
            FROM gold.fact_document_processing
            WHERE status = 'FAILED'
              AND document_created_at >= $1 AND document_created_at <= $2
          )
          SELECT
            COALESCE(pd.total_docs, 0)::integer as total_documents,
            CASE 
              WHEN pd.total_docs > 0 THEN (pd.processed_docs::numeric / pd.total_docs::numeric * 100)
              ELSE 0 
            END::numeric as success_rate,
            COALESCE(pd.avg_chunks, 0)::numeric as avg_chunks_per_doc,
            COALESCE(cf.failing_count, 0)::integer as currently_failing
          FROM period_docs pd
          CROSS JOIN currently_failing cf
        `;

        const { rows, cached } = await queryWithCache<DocumentKPIs>(
          cacheKey,
          cacheTTL,
          sql,
          [from, to]
        );

        if (rows.length === 0) {
          return {
            data: {
              total_documents: 0,
              success_rate: 0,
              avg_chunks_per_doc: 0,
              currently_failing: 0,
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

  // GET /api/v1/documents/funnel
  fastify.get<{ Reply: ApiResponse<DocumentFunnel[]> }>(
    '/funnel',
    async (_request, reply) => {
      const cacheKey = 'documents:funnel';

      try {
        const sql = `
          SELECT
            status,
            COUNT(DISTINCT document_id)::integer as count
          FROM gold.fact_document_processing
          GROUP BY status
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
          []
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
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:daily:${from}:${to}`;

      try {
        const sql = `
          SELECT
            DATE(document_created_at)::text as date,
            status,
            COUNT(DISTINCT document_id)::integer as count
          FROM gold.fact_document_processing
          WHERE document_created_at >= $1 AND document_created_at <= $2
          GROUP BY DATE(document_created_at), status
          ORDER BY date, status
        `;

        const { rows, cached } = await queryWithCache<DailyDocument>(
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
        throw new Error('Failed to fetch daily documents');
      }
    }
  );

  // GET /api/v1/documents/by-technique
  fastify.get<{ Querystring: QueryParams; Reply: ApiResponse<DocumentByTechnique[]> }>(
    '/by-technique',
    async (request, reply) => {
      const { from, to } = request.query;

      if (!from || !to) {
        reply.code(400);
        throw new Error('from and to query parameters are required');
      }

      const cacheKey = `documents:by-technique:${from}:${to}`;

      try {
        const sql = `
          SELECT
            COALESCE(parsing_technique, 'Unknown') as parsing_technique,
            COUNT(DISTINCT document_id)::integer as uploaded,
            COUNT(DISTINCT CASE WHEN status = 'PROCESSED' THEN document_id END)::integer as processed,
            COUNT(DISTINCT CASE WHEN status = 'FAILED' THEN document_id END)::integer as failed,
            CASE 
              WHEN COUNT(DISTINCT document_id) > 0 
              THEN (COUNT(DISTINCT CASE WHEN status = 'PROCESSED' THEN document_id END)::numeric / COUNT(DISTINCT document_id)::numeric * 100)
              ELSE 0 
            END::numeric as success_rate,
            AVG(CASE WHEN status = 'PROCESSED' AND total_chunks IS NOT NULL THEN total_chunks END)::numeric as avg_chunks_per_doc,
            AVG(CASE WHEN status = 'PROCESSED' AND total_words IS NOT NULL THEN total_words / NULLIF(total_chunks, 0) END)::numeric as avg_words_per_chunk
          FROM gold.fact_document_processing
          WHERE document_created_at >= $1 AND document_created_at <= $2
          GROUP BY parsing_technique
          ORDER BY uploaded DESC
        `;

        const { rows, cached } = await queryWithCache<DocumentByTechnique>(
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
        throw new Error('Failed to fetch documents by technique');
      }
    }
  );

  // GET /api/v1/documents/list
  fastify.get<{
    Querystring: { page?: string; pageSize?: string; status?: string };
    Reply: DocumentListResponse;
  }>('/list', async (request, reply) => {
    const page = parseInt(request.query.page || '1');
    const pageSize = parseInt(request.query.pageSize || '50');
    const status = request.query.status;

    const cacheKey = `documents:list:${page}:${pageSize}:${status || 'all'}`;

    try {
      const offset = (page - 1) * pageSize;
      
      const countSql = status
        ? `
            SELECT COUNT(DISTINCT document_id)::integer as total
            FROM gold.fact_document_processing
            WHERE status = $1
          `
        : `
            SELECT COUNT(DISTINCT document_id)::integer as total
            FROM gold.fact_document_processing
          `;

      const listSql = status
        ? `
            SELECT DISTINCT ON (fp.document_id)
              fp.document_id,
              d.file_name,
              d.content_type_group,
              fp.parsing_technique,
              fp.status,
              fp.file_size_bytes,
              fp.total_chunks,
              fp.total_words,
              fp.has_embeddings,
              u.email as owner_email,
              fp.document_created_at::text
            FROM gold.fact_document_processing fp
            LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
            LEFT JOIN gold.dim_users u ON d.owner_user_id = u.user_id
            WHERE fp.status = $1
            ORDER BY fp.document_id, fp.document_created_at DESC
            LIMIT $2 OFFSET $3
          `
        : `
            SELECT DISTINCT ON (fp.document_id)
              fp.document_id,
              d.file_name,
              d.content_type_group,
              fp.parsing_technique,
              fp.status,
              fp.file_size_bytes,
              fp.total_chunks,
              fp.total_words,
              fp.has_embeddings,
              u.email as owner_email,
              fp.document_created_at::text
            FROM gold.fact_document_processing fp
            LEFT JOIN gold.dim_documents d ON fp.document_id = d.document_id
            LEFT JOIN gold.dim_users u ON d.owner_user_id = u.user_id
            ORDER BY fp.document_id, fp.document_created_at DESC
            LIMIT $1 OFFSET $2
          `;

      const countParams = status ? [status] : [];
      const listParams = status ? [status, pageSize, offset] : [pageSize, offset];

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
