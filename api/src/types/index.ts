export interface ApiResponse<T> {
  data: T;
  meta: {
    from?: string;
    to?: string;
    generated_at: string;
    cached: boolean;
  };
}

export interface QueryParams {
  from?: string;
  to?: string;
  organization_id?: string;
  agent_id?: string;
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
  env: string;
  db_host: string;
  timestamp: string;
}
