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
    formula: 'COUNT(DISTINCT agent_id) WHERE total_conversations > 0',
    source_table: 'gold.mart_agent_summary',
    description: 'Number of distinct agents that had at least one conversation in the period.',
    caveats: 'Deleted agents are excluded. Agents with zero conversations are not counted as active.',
  },
  avg_messages_per_conv: {
    name: 'Average Messages per Conversation',
    formula: 'SUM(total_messages) / SUM(total_conversations)',
    source_table: 'gold.mart_agent_performance_daily',
    description: 'Average number of messages (user + assistant) per conversation across all agents.',
    caveats: 'Includes both user and assistant messages. Single-message conversations count as 1.',
  },
  
  // User Activity Dashboard KPIs
  dau: {
    name: 'Daily Active Users (DAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 for a given date',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message on a given day.',
    caveats: 'Deleted users are excluded. Only counts users who sent messages — viewing without sending does not count.',
  },
  wau: {
    name: 'Weekly Active Users (WAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 in the last 7 days',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message in the past 7 days.',
    caveats: 'Rolling 7-day window. A user active on multiple days in the week is counted once.',
  },
  mau: {
    name: 'Monthly Active Users (MAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 in the last 30 days',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message in the past 30 days.',
    caveats: 'Rolling 30-day window. A user active on multiple days in the month is counted once.',
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
    formula: 'COUNT(DISTINCT document_id WHERE status = PROCESSED) / COUNT(DISTINCT document_id) × 100',
    source_table: 'gold.fact_document_processing',
    description: 'Percentage of uploaded documents that successfully reached PROCESSED status.',
    caveats: 'Does not include pending documents. Failed documents reduce the rate.',
  },
  avg_chunks_per_doc: {
    name: 'Average Chunks per Document',
    formula: 'AVG(total_chunks) WHERE status = PROCESSED',
    source_table: 'gold.fact_document_processing',
    description: 'Average number of chunks produced per successfully processed document.',
    caveats: 'NULL for documents that failed processing. Varies significantly by document length and technique.',
  },
  embedding_coverage: {
    name: 'Embedding Coverage',
    formula: 'COUNT(DISTINCT document_id WHERE has_embeddings = true) / COUNT(DISTINCT document_id) × 100',
    source_table: 'gold.fact_document_processing',
    description: 'Percentage of documents that have embeddings generated for vector search.',
    caveats: 'A document may be processed but not yet have embeddings if the embedding pipeline is delayed.',
  },
  
  // Platform Operations Dashboard KPIs
  doc_failure_rate: {
    name: 'Document Failure Rate',
    formula: 'failed_documents / (new_documents + failed_documents) × 100',
    source_table: 'gold.mart_operational_hourly',
    description: 'Percentage of document processing attempts that failed in the measured period.',
    caveats: 'Measured over 24-hour rolling window. Spikes may indicate infrastructure issues.',
  },
  messages_last_hour: {
    name: 'Messages Last Hour',
    formula: 'SUM(new_messages) WHERE date_hour >= NOW() - INTERVAL 1 hour',
    source_table: 'gold.mart_operational_hourly',
    description: 'Total number of new messages created in the last 60 minutes.',
    caveats: 'Real-time operational metric. May lag by a few minutes due to aggregation delay.',
  },
  cost_last_hour: {
    name: 'Cost Last Hour',
    formula: 'SUM(total_cost_usd) WHERE date_hour >= NOW() - INTERVAL 1 hour',
    source_table: 'gold.mart_operational_hourly',
    description: 'Total estimated cost in USD for all LLM requests in the last 60 minutes.',
    caveats: 'Real-time operational metric. Based on estimates, not actual billing.',
  },
  active_users_last_hour: {
    name: 'Active Users Last Hour',
    formula: 'SUM(active_users) WHERE date_hour >= NOW() - INTERVAL 1 hour',
    source_table: 'gold.mart_operational_hourly',
    description: 'Number of distinct users who sent messages in the last 60 minutes.',
    caveats: 'Real-time operational metric. Users active across multiple hours are counted per hour.',
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
