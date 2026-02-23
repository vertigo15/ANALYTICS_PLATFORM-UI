import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { chatCompletion } from '../ai/client';
import { validateSQL, injectLimitAndFilters } from '../ai/sqlValidator';
import { searchKpiDefinition, KpiDefinition } from '../ai/kpiDefinitions';
import { buildPrompt, PromptContext } from '../ai/prompts';
import { query } from '../db';

interface ChatRequest {
  message: string;
  page: 'cost' | 'agents' | 'users' | 'documents' | 'operations';
  context: PromptContext;
  history: { role: 'user' | 'assistant'; content: string }[];
}

interface ChatResponse {
  type: 'text' | 'sql_result' | 'kpi_explanation' | 'error';
  content: string;
  sql?: string;
  data?: Record<string, any>[];
  columns?: string[];
  narrative?: string;
  kpiDefinition?: KpiDefinition;
  suggestions?: string[];
}

// Rate limiting map: IP -> {count, resetTime}
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

export default async function aiRoutes(fastify: FastifyInstance) {
  // POST /api/v1/ai/chat
  fastify.post<{ Body: ChatRequest; Reply: ChatResponse }>(
    '/chat',
    async (request: FastifyRequest<{ Body: ChatRequest }>, reply: FastifyReply) => {
      const clientIp = request.ip;

      // Rate limiting
      if (!checkRateLimit(clientIp)) {
        reply.code(429);
        return {
          type: 'error' as const,
          content: 'Rate limit exceeded. Please try again in a minute.',
        };
      }

      const { message, page, context, history = [] } = request.body;

      if (!message || !page) {
        reply.code(400);
        return {
          type: 'error' as const,
          content: 'Missing required fields: message and page',
        };
      }

      try {
        // Step 1: Classify the question
        const classificationPrompt = [
          {
            role: 'system' as const,
            content:
              'You are a question classifier. Classify the following question into exactly one category: A) Asking HOW a KPI/metric is calculated or what it means B) Asking for specific DATA values requiring a database query C) General conversation. Reply with only the letter A, B, or C.',
          },
          {
            role: 'user' as const,
            content: message,
          },
        ];

        const classification = await chatCompletion(classificationPrompt, {
          temperature: 0.1,
          max_completion_tokens: 10,
        });

        const classType = classification.trim().toUpperCase();

        // Build system prompt
        const systemPrompt = buildPrompt(page, context);

        // Step 2A: KPI Explanation
        if (classType === 'A') {
          const kpiDef = searchKpiDefinition(message);

          if (kpiDef) {
            // Generate follow-up suggestions
            const suggestionPrompt = [
              {
                role: 'system' as const,
                content:
                  'Generate 3 short follow-up questions (max 10 words each) a user might ask after learning about this KPI. Return as JSON array: ["question1", "question2", "question3"]',
              },
              {
                role: 'user' as const,
                content: `User asked about: ${kpiDef.name}`,
              },
            ];

            const suggestionsResponse = await chatCompletion(suggestionPrompt, {
              temperature: 0.8,
              max_completion_tokens: 200,
              response_format: { type: 'json_object' },
            });

            let suggestions: string[] = [];
            try {
              const parsed = JSON.parse(suggestionsResponse);
              suggestions = parsed.suggestions || parsed.questions || [];
            } catch {
              suggestions = [];
            }

            return {
              type: 'kpi_explanation' as const,
              content: `${kpiDef.name}: ${kpiDef.description}`,
              kpiDefinition: kpiDef,
              suggestions: suggestions.slice(0, 3),
            };
          } else {
            // Use LLM to explain from context
            const explainMessages = [
              { role: 'system' as const, content: systemPrompt },
              ...history
                .slice(-10)
                .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
              { role: 'user' as const, content: message },
            ];

            const explanation = await chatCompletion(explainMessages, { temperature: 0.7 });

            return {
              type: 'text' as const,
              content: explanation,
              suggestions: [],
            };
          }
        }

        // Step 2B: Text to SQL
        if (classType === 'B') {
          const sqlMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...history
              .slice(-10)
              .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            {
              role: 'user' as const,
              content: `${message}\n\nGenerate SQL to answer this question. Return ONLY valid JSON with this structure: { "sql": "SELECT ..." }`,
            },
          ];

          const sqlResponse = await chatCompletion(sqlMessages, {
            temperature: 0.3,
            max_completion_tokens: 1000,
            response_format: { type: 'json_object' },
          });

          let generatedSQL: string;
          try {
            const parsed = JSON.parse(sqlResponse);
            generatedSQL = parsed.sql || '';
          } catch (err) {
            return {
              type: 'error' as const,
              content: 'Failed to generate valid SQL. Please rephrase your question.',
            };
          }

          if (!generatedSQL) {
            return {
              type: 'error' as const,
              content: 'No SQL was generated. Please rephrase your question.',
            };
          }

          // Validate SQL
          const validation = validateSQL(generatedSQL);
          if (!validation.valid) {
            fastify.log.warn({ sql: generatedSQL, reason: validation.reason }, 'SQL validation failed');
            return {
              type: 'error' as const,
              content: `SQL validation failed: ${validation.reason}. Please try a different question.`,
            };
          }

          // Inject LIMIT
          const finalSQL = injectLimitAndFilters(generatedSQL);

          // Execute SQL
          let result: any;
          try {
            result = await query(finalSQL, []); // 10 second timeout handled by db.ts
          } catch (err: any) {
            fastify.log.error({ sql: finalSQL, error: err.message }, 'SQL execution failed');
            return {
              type: 'error' as const,
              content: `Query execution failed: ${err.message}. Please try rephrasing your question.`,
            };
          }

          if (!result.rows || result.rows.length === 0) {
            return {
              type: 'sql_result' as const,
              content: 'No results found for your query.',
              sql: finalSQL,
              data: [],
              columns: [],
              narrative: 'The query returned no results. Try adjusting the date range or filters.',
              suggestions: [],
            };
          }

          // Generate narrative
          const narrativeMessages = [
            {
              role: 'system' as const,
              content: `You are a data analyst. Summarize the SQL query result in 2-3 sentences that directly answer the user's question. Be specific and use numbers from the data.`,
            },
            {
              role: 'user' as const,
              content: `User asked: "${message}"\n\nSQL executed: ${finalSQL}\n\nResult (first 5 rows): ${JSON.stringify(
                result.rows.slice(0, 5)
              )}\n\nTotal rows: ${result.rows.length}\n\nWrite a plain English answer:`,
            },
          ];

          const narrative = await chatCompletion(narrativeMessages, {
            temperature: 0.7,
            max_completion_tokens: 300,
          });

          // Generate suggestions
          const suggestionMessages = [
            {
              role: 'system' as const,
              content:
                'Generate 3 short follow-up questions (max 10 words each) based on this data query. Return as JSON array: ["question1", "question2", "question3"]',
            },
            {
              role: 'user' as const,
              content: `Previous question: ${message}\nResult: ${result.rows.length} rows returned`,
            },
          ];

          const suggestionsResponse = await chatCompletion(suggestionMessages, {
            temperature: 0.8,
            max_completion_tokens: 200,
            response_format: { type: 'json_object' },
          });

          let suggestions: string[] = [];
          try {
            const parsed = JSON.parse(suggestionsResponse);
            suggestions = parsed.suggestions || parsed.questions || [];
          } catch {
            suggestions = [];
          }

          const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

          return {
            type: 'sql_result' as const,
            content: narrative.trim(),
            sql: finalSQL,
            data: result.rows,
            columns,
            narrative: narrative.trim(),
            suggestions: suggestions.slice(0, 3),
          };
        }

        // Step 2C: General conversation
        const chatMessages = [
          { role: 'system' as const, content: systemPrompt },
          ...history
            .slice(-10)
            .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
          { role: 'user' as const, content: message },
        ];

        const response = await chatCompletion(chatMessages, { temperature: 0.7 });

        // If the LLM returned a JSON string, handle it (robust fallback)
        try {
          const maybeJson = JSON.parse(response);
          // If it's a plain text response wrapped in JSON, extract the content
          if (maybeJson && typeof maybeJson === 'object' && maybeJson.type === 'text' && maybeJson.content) {
            // Fall through to text handling below with extracted content
            const extractedContent = String(maybeJson.content).trim();
            const suggestionMessages2 = [
              {
                role: 'system' as const,
                content:
                  'Generate 3 short relevant questions (max 10 words each) the user might ask next. Return as JSON array: ["question1", "question2", "question3"]',
              },
              {
                role: 'user' as const,
                content: `Conversation context: ${message}`,
              },
            ];

            const suggestionsResponse2 = await chatCompletion(suggestionMessages2, {
              temperature: 0.8,
              max_completion_tokens: 200,
              response_format: { type: 'json_object' },
            });

            let suggestions2: string[] = [];
            try {
              const parsed2 = JSON.parse(suggestionsResponse2);
              suggestions2 = parsed2.suggestions || parsed2.questions || [];
            } catch {
              suggestions2 = [];
            }

            return {
              type: 'text' as const,
              content: extractedContent,
              suggestions: suggestions2.slice(0, 3),
            };
          }
          if (maybeJson && typeof maybeJson === 'object' && maybeJson.sql) {
            const generatedSQL = String(maybeJson.sql || '');
            if (generatedSQL) {
              // Validate
              const validation = validateSQL(generatedSQL);
              if (!validation.valid) {
                return {
                  type: 'error' as const,
                  content: `SQL validation failed: ${validation.reason}. Please try a different question.`,
                };
              }

              const finalSQL = injectLimitAndFilters(generatedSQL);
              let result: any;
              try {
                result = await query(finalSQL, []);
              } catch (err: any) {
                fastify.log.error({ sql: finalSQL, error: err.message }, 'SQL execution failed');
                return {
                  type: 'error' as const,
                  content: `Query execution failed: ${err.message}. Please try rephrasing your question.`,
                };
              }

              const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

              // Short narrative
              const narrativeMessages = [
                {
                  role: 'system' as const,
                  content: `You are a data analyst. Summarize the SQL query result in 2-3 sentences that directly answer the user's question. Be specific and use numbers from the data.`,
                },
                {
                  role: 'user' as const,
                  content: `User asked: "${message}"\n\nSQL executed: ${finalSQL}\n\nResult (first 5 rows): ${JSON.stringify(
                    result.rows.slice(0, 5)
                  )}\n\nTotal rows: ${result.rows.length}\n\nWrite a plain English answer:`,
                },
              ];

              const narrative = await chatCompletion(narrativeMessages, { temperature: 0.7, max_completion_tokens: 300 });

              return {
                type: 'sql_result' as const,
                content: narrative.trim(),
                sql: finalSQL,
                data: result.rows,
                columns,
                narrative: narrative.trim(),
                suggestions: [],
              };
            }
          }
        } catch {
          // Not JSON; continue as normal text flow
        }

        // Generate suggestions
        const suggestionMessages = [
          {
            role: 'system' as const,
            content:
              'Generate 3 short relevant questions (max 10 words each) the user might ask next. Return as JSON array: ["question1", "question2", "question3"]',
          },
          {
            role: 'user' as const,
            content: `Conversation context: ${message}`,
          },
        ];

        const suggestionsResponse = await chatCompletion(suggestionMessages, {
          temperature: 0.8,
          max_completion_tokens: 200,
          response_format: { type: 'json_object' },
        });

        let suggestions: string[] = [];
        try {
          const parsed = JSON.parse(suggestionsResponse);
          suggestions = parsed.suggestions || parsed.questions || [];
        } catch {
          suggestions = [];
        }

        return {
          type: 'text' as const,
          content: response.trim(),
          suggestions: suggestions.slice(0, 3),
        };
      } catch (error: any) {
        fastify.log.error({ error: error.message, stack: error.stack }, 'AI chat error');
        reply.code(500);
        return {
          type: 'error' as const,
          content: 'An error occurred while processing your request. Please try again.',
        };
      }
    }
  );

  // GET /api/v1/ai/suggestions/:page - Get default suggestions for a page
  fastify.get<{ Params: { page: string } }>(
    '/suggestions/:page',
    async (request: FastifyRequest<{ Params: { page: string } }>) => {
      const { page } = request.params;

      const defaultSuggestions: Record<string, string[]> = {
        cost: [
          'Which model cost the most this month?',
          'Show me top 5 users by token usage',
          'How is cost per 1K tokens calculated?',
          'What was the total cost yesterday?',
        ],
        agents: [
          'Which agents have the highest satisfaction rate?',
          'Show agent usage trends over time',
          'How is satisfaction rate calculated?',
          'List agents with most conversations',
        ],
        users: [
          'How many active users do we have?',
          'Show user activity by day of week',
          'What is the definition of DAU?',
          'Who are the top 10 most active users?',
        ],
        documents: [
          'What is the document success rate?',
          'Show failed documents from last week',
          'How many documents have embeddings?',
          'Which parsing technique works best?',
        ],
        operations: [
          'How many messages in the last hour?',
          'Show hourly cost trends today',
          'What is the document failure rate?',
          'List recent operational issues',
        ],
      };

      return {
        suggestions: defaultSuggestions[page] || [],
      };
    }
  );
}
