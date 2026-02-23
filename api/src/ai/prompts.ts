import { KPI_DEFINITIONS } from './kpiDefinitions';

export interface PromptContext {
  filters: {
    from: string;
    to: string;
    organizationId?: string;
    agentId?: string;
  };
  kpiValues: Record<string, string>;
}

const ROLE_DEFINITION = `You are an analytics assistant for the Jeen platform. You answer questions about analytics data with precision and clarity. You have access to a PostgreSQL database with a 'gold' schema containing analytics tables.`;

const RULES = `
Rules:
- Only generate SELECT SQL queries
- Only use tables from the 'gold' schema
- Always apply the active date filter (from/to) in WHERE clauses
- Return responses in JSON format with a 'type' field
- Be concise and accurate
- When generating SQL, ensure it's syntactically correct PostgreSQL
`;

function buildSchemaContext(page: string): string {
  const schemas: Record<string, string> = {
    cost: `
Available tables:
- gold.mart_llm_cost_by_user_model_day: columns date_day(date), user_id(uuid), user_email(text), model(text), provider(text), est_cost_usd(numeric), total_tokens(bigint), total_requests(bigint), total_input_tokens(bigint), total_output_tokens(bigint), total_reasoning_tokens(bigint), agent_id(uuid), agent_name(text)
- gold.mart_llm_cost_hourly: columns date_hour(timestamptz), model(text), provider(text), est_cost_usd(numeric), total_tokens(bigint), unique_users(bigint), unique_agents(bigint)
- gold.dim_users: columns user_id(uuid), email(text), full_name(text), organization_id(uuid), is_deleted(boolean)
- gold.fact_model_transactions: columns transaction_id(uuid), date_key(int), user_key(int), agent_key(int), model_key(int), provider(text), model(text), input_tokens(bigint), output_tokens(bigint), total_tokens(bigint), reasoning_tokens(bigint), est_cost_usd(numeric), transacted_at(timestamptz)
`,
    agents: `
Available tables:
- gold.mart_agent_performance_daily: columns date_day(date), agent_id(uuid), agent_name(text), agent_type(text), owner_user_id(uuid), unique_users(int), total_conversations(int), total_messages(int), avg_messages_per_conv(numeric), total_input_tokens(bigint), total_output_tokens(bigint), est_cost_usd(numeric), tool_calls_count(int), reactions_positive(int), reactions_negative(int)
- gold.mart_agent_summary: columns agent_id(uuid), agent_name(text), agent_type(text), owner_email(text), created_at(timestamptz), last_interacted_at(timestamptz), total_unique_users(int), total_conversations(int), total_messages(int), total_tokens(bigint), total_est_cost_usd(numeric), total_positive_reactions(int), total_negative_reactions(int), satisfaction_rate(numeric), is_deleted(boolean)
- gold.dim_agents: columns agent_key(int), agent_id(uuid), name(text), type(text), owner_user_id(uuid), is_deleted(boolean)
`,
    users: `
Available tables:
- gold.fact_user_activity_daily: columns user_activity_key(int), date_key(int), user_key(int), conversations_started(int), messages_sent(int), assistant_messages(int), documents_uploaded(int), agents_used(int), total_tokens(bigint), est_cost_usd(numeric)
- gold.mart_user_summary: columns user_id(uuid), email(text), full_name(text), organization_id(uuid), is_owner(boolean), account_created_at(timestamptz), last_active_at(timestamptz), total_conversations(int), total_messages_sent(int), total_documents_uploaded(int), total_tokens_consumed(bigint), total_est_cost_usd(numeric), favourite_agent_name(text), favourite_model(text), is_deleted(boolean)
- gold.dim_users: columns user_key(int), user_id(uuid), email(text), full_name(text), organization_id(uuid), is_owner(boolean), account_created_at(timestamptz), is_deleted(boolean)
- gold.dim_date: columns date_key(int), date_actual(date), day_of_week(text), week_of_year(int), month_actual(int), year_actual(int), is_weekend(boolean)
`,
    documents: `
Available tables:
- gold.fact_document_processing: columns document_id(uuid), date_key(int), document_key(int), user_key(int), status(text), file_size_bytes(bigint), parsing_technique(text), total_chunks(int), total_words(int), has_embeddings(boolean), document_created_at(timestamptz)
- gold.mart_document_rag_health: columns date_day(date), parsing_technique(text), uploaded(int), processed(int), failed(int), success_rate(numeric), avg_chunks_per_doc(numeric), avg_words_per_chunk(numeric), docs_with_embeddings(int), embedding_coverage(numeric)
- gold.dim_documents: columns document_key(int), document_id(uuid), file_name(text), content_type_group(text), file_size_bytes(bigint), parsing_technique(text), owner_user_id(uuid)
`,
    operations: `
Available tables:
- gold.mart_operational_hourly: columns date_hour(timestamptz), new_conversations(int), new_messages(int), user_messages(int), assistant_messages(int), messages_with_tool_calls(int), total_tokens(bigint), total_cost_usd(numeric), new_documents(int), failed_documents(int), doc_failure_rate(numeric), new_users(int), active_users(int), unique_agents_used(int), avg_iteration_count(numeric)
- gold.fact_messages: columns message_id(uuid), date_key(int), user_key(int), agent_key(int), conversation_id(uuid), role(text), has_tool_calls(boolean), iteration_count(int), reaction_type(text), message_created_at(timestamptz), date_hour(timestamptz)
`,
  };

  return schemas[page] || '';
}

function getPageKpis(page: string): string[] {
  const pageKpis: Record<string, string[]> = {
    cost: ['est_cost_usd', 'total_tokens', 'cost_per_1k_tokens'],
    agents: ['satisfaction_rate', 'active_agents', 'avg_messages_per_conv'],
    users: ['dau', 'wau', 'mau', 'new_users'],
    documents: ['success_rate', 'avg_chunks_per_doc', 'embedding_coverage'],
    operations: ['messages_last_hour', 'cost_last_hour', 'doc_failure_rate', 'active_users_last_hour'],
  };

  return pageKpis[page] || [];
}

export function buildPrompt(page: string, context: PromptContext): string {
  const { filters, kpiValues = {} } = context;
  
  const kpiKeys = getPageKpis(page);
  const kpiContext = kpiKeys
    .map((key) => {
      const def = KPI_DEFINITIONS[key];
      if (!def) return '';
      return `- ${def.name}: ${def.description}`;
    })
    .filter(Boolean)
    .join('\n');

  const schemaContext = buildSchemaContext(page);

  const filterContext = `
Active Filters:
- Date Range: ${filters.from} to ${filters.to}
${filters.organizationId ? `- Organization ID: ${filters.organizationId}` : ''}
${filters.agentId ? `- Agent ID: ${filters.agentId}` : ''}
`;

  const kpiValuesContext = kpiValues && Object.keys(kpiValues).length > 0
    ? `\nCurrent KPI Values on Screen:\n${Object.entries(kpiValues)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')}`
    : '';

  return `${ROLE_DEFINITION}

${RULES}

Current Page: ${page.charAt(0).toUpperCase() + page.slice(1)} Dashboard

${filterContext}
${kpiValuesContext}

${schemaContext}

KPIs for this page:
${kpiContext}

When answering questions:
1. If the user asks HOW a KPI is calculated, explain the formula without running SQL
2. If the user asks for specific DATA values, generate and return SQL
3. Always apply the active date filter (${filters.from} to ${filters.to}) in your SQL WHERE clauses
4. For data questions, return JSON: { "type": "sql", "sql": "SELECT ..." }
5. For KPI explanations, return JSON: { "type": "kpi_explanation" }
6. For general conversation, reply in plain text (do NOT wrap in JSON)
`;
}
