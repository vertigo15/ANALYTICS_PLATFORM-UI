export interface KpiDefinition {
  name: string;
  formula: string;
  source_table: string;
  description: string;
  caveats?: string;
}

export const KPI_DEFINITIONS: Record<string, KpiDefinition> = {
  // Cost & Tokens Dashboard KPIs
  est_cost_usd: {
    name: 'Estimated Cost (USD)',
    formula: '(input_tokens / 1000 × input_cost_per_1k) + (output_tokens / 1000 × output_cost_per_1k)',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Estimated USD cost based on token counts and model pricing rates from bronze.model_cost_rates.',
    caveats: 'Estimated only. Actual billing may differ. NULL if model not in cost rates table.',
  },
  total_tokens: {
    name: 'Total Tokens',
    formula: 'SUM(input_tokens + output_tokens + reasoning_tokens)',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Sum of all input, output, and reasoning tokens consumed across all requests in the period.',
    caveats: 'Reasoning tokens may be 0 for models that do not support extended thinking.',
  },
  cost_per_1k_tokens: {
    name: 'Cost per 1K Tokens',
    formula: 'total_cost_usd / (total_tokens / 1000)',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Average cost per 1000 tokens, calculated by dividing total cost by token volume.',
    caveats: 'Varies significantly by model. Higher for output-heavy usage patterns.',
  },
  avg_cost_per_user: {
    name: 'Average Cost per User',
    formula: 'SUM(est_cost_usd) / COUNT(DISTINCT user_id)',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Selected-period cost divided by all distinct users with at least one cost-mart row in that period.',
  },
  cost_per_active_user_day: {
    name: 'Cost per Active User-Day',
    formula: 'SUM(est_cost_usd) / COUNT(DISTINCT (user_id, date_day))',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Selected-period cost divided by the exact number of distinct active user-date pairs.',
    caveats: 'This is not normalized to a hardcoded 30-day month.',
  },
  
  // Agent Performance Dashboard KPIs
  satisfaction_rate: {
    name: 'Satisfaction Rate',
    formula: 'positive_reactions / (positive_reactions + negative_reactions) × 100',
    source_table: 'gold.mart_agent_summary',
    description: 'Ratio of positive message reactions to total reactions, expressed as a percentage.',
    caveats: 'Only messages where users explicitly reacted are counted. Unreacted messages are excluded.',
  },
  active_agents: {
    name: 'Active Agents',
    formula: 'COUNT(DISTINCT agent_id) over message rows in the selected period',
    source_table: 'gold.fact_messages',
    description: 'Number of distinct agents with at least one message in the selected period.',
    caveats: 'Agents with no message rows are not active.',
  },
  avg_messages_per_conv: {
    name: 'Average Messages per Conversation',
    formula: 'SUM(total_messages) / SUM(total_conversations)',
    source_table: 'gold.mart_agent_performance_daily',
    description: 'Average number of messages (user + assistant) per conversation across all agents.',
    caveats: 'Includes both user and assistant messages. Single-message conversations count as 1.',
  },
  avg_messages_per_agent: {
    name: 'Average Messages per Active Agent',
    formula: 'COUNT(fact_messages rows) / COUNT(DISTINCT agent_id)',
    source_table: 'gold.fact_messages',
    description: 'Average message count per distinct agent with messages in the selected period.',
  },
  avg_agent_response_time: {
    name: 'Average Agent Response Time',
    formula: 'AVG(response_latency_seconds) over non-negative measured fact_messages rows',
    source_table: 'gold.fact_messages',
    description: 'Average recorded response latency across measured agent messages.',
  },
  p95_agent_response_time: {
    name: 'P95 Agent Response Time',
    formula: 'PERCENTILE_CONT(0.95) over non-negative response_latency_seconds values',
    source_table: 'gold.fact_messages',
    description: 'Raw recorded response-latency threshold below which 95% of measured responses fall.',
  },
  
  // User Activity Dashboard KPIs
  dau: {
    name: 'Daily Active Users (DAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 for a given date',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message on the selected to date.',
    caveats: 'Deleted users are excluded. Only counts users who sent messages — viewing without sending does not count.',
  },
  wau: {
    name: 'Weekly Active Users (WAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 in the last 7 days',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message in the rolling 7-day window ending on the selected to date.',
    caveats: 'Independent of the selected range start. A user active on multiple days is counted once.',
  },
  mau: {
    name: 'Monthly Active Users (MAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 in the last 30 days',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message in the rolling 30-day window ending on the selected to date.',
    caveats: 'Independent of the selected range start. A user active on multiple days is counted once.',
  },
  new_users: {
    name: 'New Users',
    formula: 'COUNT(DISTINCT user_key) WHERE account_created_at within period',
    source_table: 'gold.dim_users',
    description: 'Number of users whose account_created_at timestamp falls within the selected date range.',
    caveats: 'Based on account creation date, not first activity date. May include inactive users.',
  },
  
  // Document & RAG Health Dashboard KPIs
  success_rate: {
    name: 'Success Rate',
    formula: "success / (success + failure) × 100, where success is active_processing_status IN ('COMPLETED','READY') and failure is status = 'FAILED' OR active_processing_status = 'FAILED'",
    source_table: 'gold.fact_document_processing',
    description: 'Percentage of terminal document-processing outcomes that succeeded.',
    caveats: 'Pending and in-progress documents are excluded from the denominator. Date ranges use a half-open timestamp end.',
  },
  avg_chunks_per_doc: {
    name: 'Average Chunks per Document',
    formula: "AVG(total_chunks) WHERE active_processing_status IN ('COMPLETED','READY')",
    source_table: 'gold.fact_document_processing',
    description: 'Average number of chunks produced per successfully processed document.',
    caveats: 'NULL for documents that failed processing. Varies significantly by document length and technique.',
  },
  embedding_coverage: {
    name: 'Embedding Coverage',
    formula: "successful documents with has_embeddings = true / successful documents, where success is active_processing_status IN ('COMPLETED','READY')",
    source_table: 'gold.fact_document_processing',
    description: '0–1 ratio of successful documents that have embeddings generated for vector search.',
    caveats: 'The frontend multiplies this ratio by 100 for display. Do not scale it again in the API.',
  },
  avg_words_per_chunk: {
    name: 'Average Words per Chunk',
    formula: "SUM(total_words) / SUM(total_chunks) WHERE active_processing_status IN ('COMPLETED','READY')",
    source_table: 'gold.fact_document_processing',
    description: 'Chunk-weighted average word count across chunks from successful documents.',
  },
  
  // Platform Operations Dashboard KPIs
  doc_failure_rate: {
    name: 'Document Failure Rate',
    formula: "canonical failures / terminal outcomes over 24 hours; failure is status = 'FAILED' OR active_processing_status = 'FAILED'",
    source_table: 'gold.fact_document_processing',
    description: 'Weighted 24-hour document failure ratio anchored to the latest available operational hour.',
    caveats: 'Uses the fact outcome when available and falls back to weighted hourly mart counts.',
  },
  messages_last_hour: {
    name: 'Messages Last Hour',
    formula: 'new_messages from the latest available mart_operational_hourly bucket',
    source_table: 'gold.mart_operational_hourly',
    description: 'Message count in the latest available hourly operational bucket.',
    caveats: 'Check as_of_hour and is_stale; the latest bucket may lag wall-clock time.',
  },
  cost_last_hour: {
    name: 'Cost Last Hour',
    formula: 'total_cost_usd from the latest available mart_operational_hourly bucket',
    source_table: 'gold.mart_operational_hourly',
    description: 'Total estimated cost in USD for all LLM requests in the last 60 minutes.',
    caveats: 'Real-time operational metric. Based on estimates, not actual billing.',
  },
  active_users_last_hour: {
    name: 'Active Users Last Hour',
    formula: 'active_users from the latest available mart_operational_hourly bucket',
    source_table: 'gold.mart_operational_hourly',
    description: 'Number of active users recorded in the latest available hourly operational bucket.',
    caveats: 'Check as_of_hour and is_stale before treating this as wall-clock current.',
  },
};

export function searchKpiDefinition(query: string): KpiDefinition | null {
  const lowerQuery = query.toLowerCase();
  
  // Search by key first
  for (const [key, def] of Object.entries(KPI_DEFINITIONS)) {
    if (lowerQuery.includes(key.toLowerCase().replace(/_/g, ' '))) {
      return def;
    }
  }
  
  // Search by name
  for (const def of Object.values(KPI_DEFINITIONS)) {
    if (lowerQuery.includes(def.name.toLowerCase())) {
      return def;
    }
  }
  
  // Search for keywords
  const keywords: Record<string, string> = {
    'satisfaction': 'satisfaction_rate',
    'cost': 'est_cost_usd',
    'tokens': 'total_tokens',
    'dau': 'dau',
    'wau': 'wau',
    'mau': 'mau',
    'active users': 'dau',
    'agents': 'active_agents',
    'messages per conversation': 'avg_messages_per_conv',
    'success': 'success_rate',
    'chunks': 'avg_chunks_per_doc',
    'embeddings': 'embedding_coverage',
    'failure': 'doc_failure_rate',
  };
  
  for (const [keyword, key] of Object.entries(keywords)) {
    if (lowerQuery.includes(keyword)) {
      return KPI_DEFINITIONS[key] || null;
    }
  }
  
  return null;
}
