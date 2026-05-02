import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ApiResponse<T> {
  data: T;
  meta: {
    from?: string;
    to?: string;
    generated_at: string;
    cached: boolean;
  };
}

export interface FreshnessTable {
  source_table: string;
  last_run_at: string;
  last_watermark: string | null;
}

export interface PageFreshness {
  last_updated: string;
  is_stale: boolean;
  tables: FreshnessTable[];
}

export interface FreshnessData {
  cost: PageFreshness;
  agents: PageFreshness;
  users: PageFreshness;
  documents: PageFreshness;
  operations: PageFreshness;
}

export interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

export interface Organisation {
  organization_id: string;
  organization_name: string;
}

export interface Agent {
  agent_id: string;
  agent_name: string;
}

// Cost-related interfaces
export interface DailyCost {
  date: string;
  model: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
}

export interface ModelCost {
  model: string;
  provider: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
  pct_of_total: number;
}

export interface TopUser {
  user_id: string;
  user_email: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
  top_model: string;
}

export interface PeriodSummary {
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
}

export interface CostSummary {
  current: PeriodSummary;
  previous: PeriodSummary;
  most_expensive_model: string;
  cost_per_1k_tokens: number;
}

export interface UserCostDetail {
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

export interface CostDetailRow extends Record<string, unknown> {
  date: string;
  user_email: string;
  agent_name: string;
  model: string;
  provider: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  est_cost_usd: number;
}

export interface TokensByModel {
  model: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

// Agent-related interfaces
export interface AgentSummary extends Record<string, unknown> {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  owner_email: string;
  total_unique_users: number;
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  total_est_cost_usd: number;
  satisfaction_rate: number;
  total_positive_reactions: number;
  total_negative_reactions: number;
  last_interacted_at: string;
  is_deleted: boolean;
}

export interface AgentPerformance {
  date_day: string;
  agent_id: string;
  agent_name: string;
  unique_users: number;
  total_conversations: number;
  total_messages: number;
  avg_messages_per_conv: number;
  total_tokens: number;
  est_cost_usd: number;
  reactions_positive: number;
  reactions_negative: number;
}


export interface AgentLatencyKPIs {
  avg_latency_sec: number;
  p95_latency_sec: number;
  avg_ttft_ms: number | null;
  avg_tokens_per_sec: number | null;
  agents_with_latency: number;
}

export interface SharingKPIs {
  active_agent_shares: number;
  active_source_shares: number;
  active_skill_shares: number;
  total_active_shares: number;
  total_granted: number;
  total_revoked: number;
  unique_sharers: number;
  unique_recipients: number;
}

export interface SharingTrend {
  date_day: string;
  feature_type: string;
  granted: number;
  revoked: number;
  active: number;
}

export interface SharingData {
  kpis: SharingKPIs;
  trend: SharingTrend[];
}

export interface AgentKPIs {
  active_agents: number;
  total_agent_cost: number;
  total_tokens: number;
  avg_unique_users_per_day: number;
  avg_messages_per_agent: number;
}

export interface AgentDetail extends AgentSummary {
  daily_performance: AgentPerformance[];
  recent_conversations: {
    conversation_id: string;
    message_count: number;
    user_email: string;
    date: string;
    est_cost_usd: number;
  }[];
}

// User Activity interfaces
export interface UserKPIs {
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

export interface DailyActivity {
  date_day: string;
  dau: number;
  messages_sent: number;
  total_tokens: number;
  est_cost_usd: number;
  dau_7d_ma: number;
}

export interface ActivityHeatmap {
  day_of_week: number;
  hour: number;
  message_count: number;
  distinct_users: number;
}

export interface UserSummary extends Record<string, unknown> {
  user_id: string;
  email: string;
  org: string | null;
  conversations: number;
  messages: number;
  tokens: number;
  cost: number;
  last_active_at: string | null;
  account_created_at: string;
  favourite_agent: string | null;
  favourite_model: string | null;
  is_deleted: boolean;
}

export interface UserDetail {
  user_id: string;
  email: string;
  org: string | null;
  account_created_at: string;
  last_active_at: string | null;
  total_conversations: number;
  total_messages: number;
  total_tokens: number;
  total_est_cost_usd: number;
  unique_agents_used: number;
  daily_activity: {
    date_day: string;
    messages_sent: number;
    total_tokens: number;
    est_cost_usd: number;
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

// Document & RAG Health interfaces
export interface DocumentKPIs {
  total_documents: number;
  success_rate: number;
  avg_chunks_per_doc: number;
  currently_failing: number;
  avg_words_per_chunk: number;
  docs_with_embeddings: number;
  embedding_coverage: number;
}

export interface DocumentFunnel {
  status: string;
  count: number;
}

export interface DailyDocument {
  date: string;
  status: string;
  count: number;
}

export interface DocumentByTechnique {
  parsing_technique: string;
  uploaded: number;
  processed: number;
  failed: number;
  success_rate: number;
  avg_chunks_per_doc: number;
  avg_words_per_chunk: number;
}

export interface DocumentByTypeDaily {
  date: string;
  content_type_group: string;
  doc_count: number;
  total_size_bytes: number;
  total_embeddings: number;
  est_cost_usd: number;
}

export interface DocumentListItem extends Record<string, unknown> {
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

export interface DocumentListResponse {
  data: DocumentListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface TopUploader {
  email: string;
  total_documents: number;
  processed: number;
  failed: number;
  success_rate: number;
}

export interface ContentTypeBreakdown {
  content_type_group: string;
  doc_count: number;
  total_size_bytes: number;
  processed: number;
  failed: number;
  success_rate: number;
}

export interface FailureCorrelation {
  dimension: string;
  bucket: string;
  total: number;
  failed: number;
  failure_rate: number;
}

// Platform Operations interfaces
export interface TriggerKPIs {
  total_triggers: number;
  successful_triggers: number;
  failed_triggers: number;
  success_rate: number;
  avg_duration_sec: number;
  distinct_triggers: number;
  distinct_target_types: number;
}

export interface OperationsKPIs {
  messages_last_hour: number;
  cost_last_hour: number;
  doc_failure_rate_24h: number;
  active_users_last_hour: number;
}

export interface HealthIndicator {
  label: string;
  status: 'ok' | 'warning' | 'error';
  description: string;
}

export interface HourlyOperations {
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
  avg_messages_7d: number;
  stddev_messages_7d: number;
  avg_user_messages_7d: number;
  stddev_user_messages_7d: number;
  avg_assistant_messages_7d: number;
}

export interface PlatformEvent extends Record<string, unknown> {
  timestamp: string;
  event_type: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
}

// Agent Analytics interfaces
export interface AnalyticsKPIs {
  total_conversations: number;
  avg_response_time_sec: number;
  avg_turns_per_conversation: number;
  tool_call_rate: number;
}

export interface ConversationSummary extends Record<string, unknown> {
  conversation_id: string;
  title: string | null;
  date: string;
  user_email: string;
  turns: number;
  duration_sec: number;
  outcome: string;
  has_tool_calls: boolean;
  likes: number;
  dislikes: number;
}

export interface ConversationListResponse {
  rows: ConversationSummary[];
  total: number;
}

export interface OutcomeBreakdown {
  outcome: string;
  count: number;
  percentage: number;
}

export interface ResponseTimeTrend {
  date_day: string;
  avg_response_time_sec: number;
}

export interface DepthOverTime {
  date_day: string;
  avg_turns: number;
  total_conversations: number;
}

export interface ConversationMessage {
  message_id: string;
  role: string;
  content?: string;
  agent_id?: string | null;
  agent_name?: string | null;
  has_tool_calls: boolean;
  finish_reason: string | null;
  reaction_type: string | null;
  timestamp: string;
  latency_ms: number | null;
  tool_calls?: string | null;
  user_email?: string | null;
}

export interface AgentHandoff {
  agent_id: string;
  agent_name: string;
  order_index: number;
  start_time: string;
  end_time: string;
  latency_ms: number;
  status: string;
  message_count: number;
}

export interface ConversationDetail {
  conversation_id: string;
  date: string;
  duration_sec: number;
  turns: number;
  user_email: string | null;
  outcome: string;
  has_tool_calls: boolean;
  positive_reactions: number;
  negative_reactions: number;
  agents_involved: string[];
  handoffs: AgentHandoff[];
  messages: ConversationMessage[];
}

export async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const response = await apiClient.get<T>(path, { params });
  return response.data;
}

export async function getFreshness(): Promise<ApiResponse<FreshnessData>> {
  return apiFetch<ApiResponse<FreshnessData>>('/freshness');
}

export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}

export async function getOrganisations(): Promise<ApiResponse<Organisation[]>> {
  return apiFetch<ApiResponse<Organisation[]>>('/users/organisations');
}

export async function getAgentsList(): Promise<ApiResponse<Agent[]>> {
  return apiFetch<ApiResponse<Agent[]>>('/agents/list');
}
