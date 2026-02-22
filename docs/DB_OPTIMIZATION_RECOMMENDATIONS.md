# Database Optimization Recommendations for Cost & Tokens Dashboard

## Current Implementation Analysis

The current frontend implementation calculates several metrics on-the-fly from API responses, which works but has performance limitations. This document outlines recommended database schema changes and new materialized views to improve performance and scalability.

---

## 1. Provider/Vendor Aggregation Table

### Current Limitation
The "Vendor Cost Trend Over Time" chart currently:
- Fetches all daily records by model from `mart_llm_cost_by_user_model_day`
- Fetches all model records from `mart_llm_cost_by_user_model_day` (aggregated)
- Joins them in the frontend by looking up provider for each model
- Groups and sums costs by provider in JavaScript

**Problem**: This requires loading potentially thousands of records, joining in memory, and processing on the client side.

### Recommended Solution: Create Provider Aggregation Table

```sql
-- New materialized view: mart_llm_cost_by_provider_day
CREATE MATERIALIZED VIEW gold.mart_llm_cost_by_provider_day AS
SELECT 
    date_day,
    provider,
    organization_id,
    agent_id,
    SUM(est_cost_usd) as est_cost_usd,
    SUM(total_tokens) as total_tokens,
    SUM(input_tokens) as input_tokens,
    SUM(output_tokens) as output_tokens,
    SUM(reasoning_tokens) as reasoning_tokens,
    SUM(total_requests) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT model) as models_used
FROM gold.mart_llm_cost_by_user_model_day
GROUP BY date_day, provider, organization_id, agent_id;

-- Add indexes for common query patterns
CREATE INDEX idx_provider_day_date ON gold.mart_llm_cost_by_provider_day(date_day);
CREATE INDEX idx_provider_day_provider ON gold.mart_llm_cost_by_provider_day(provider);
CREATE INDEX idx_provider_day_org ON gold.mart_llm_cost_by_provider_day(organization_id);

-- Refresh schedule (daily or after fact table updates)
CREATE INDEX idx_provider_day_composite ON gold.mart_llm_cost_by_provider_day(date_day, provider);
```

### New API Endpoint
```typescript
// GET /api/v1/cost/by-provider-daily
interface ProviderDailyCost {
  date: string;
  provider: string;
  est_cost_usd: number;
  total_tokens: number;
  total_requests: number;
  unique_users: number;
  models_used: number;
}
```

### Benefits
- **10-100x faster queries**: Pre-aggregated data instead of joining thousands of records
- **Reduced API payload**: ~95% smaller response (30-50 records vs 1000+ records)
- **Better scalability**: Query performance remains constant as data grows
- **Accurate provider attribution**: Prevents frontend mapping errors

---

## 2. Cost Efficiency Metrics Table

### Current Limitation
The dashboard calculates these metrics on-the-fly:
- Cost per request (total cost / total requests)
- Cost per 1M tokens (already in summary, but could be per model)
- Cost per user-day (approximated using division by 30)

**Problem**: 
- Inaccurate "cost per user-day" (uses approximation)
- Cannot show efficiency trends over time
- Cannot rank models by efficiency

### Recommended Solution: Create Cost Efficiency Mart

```sql
-- New materialized view: mart_llm_cost_efficiency
CREATE MATERIALIZED VIEW gold.mart_llm_cost_efficiency AS
SELECT 
    model,
    provider,
    date_day,
    
    -- Cost Efficiency Metrics
    CASE 
        WHEN SUM(total_requests) > 0 
        THEN SUM(est_cost_usd) / SUM(total_requests)
        ELSE 0 
    END as cost_per_request,
    
    CASE 
        WHEN SUM(total_tokens) > 0 
        THEN (SUM(est_cost_usd) / SUM(total_tokens)) * 1000000
        ELSE 0 
    END as cost_per_1m_tokens,
    
    CASE 
        WHEN SUM(input_tokens) > 0 
        THEN SUM(est_cost_usd) / (SUM(input_tokens) / 1000000.0)
        ELSE 0 
    END as cost_per_1m_input_tokens,
    
    CASE 
        WHEN SUM(output_tokens) > 0 
        THEN SUM(est_cost_usd) / (SUM(output_tokens) / 1000000.0)
        ELSE 0 
    END as cost_per_1m_output_tokens,
    
    -- Volume Metrics
    SUM(est_cost_usd) as total_cost,
    SUM(total_tokens) as total_tokens,
    SUM(total_requests) as total_requests,
    COUNT(DISTINCT user_id) as unique_users,
    
    -- Efficiency Ranking (percentile within day)
    PERCENT_RANK() OVER (
        PARTITION BY date_day 
        ORDER BY (SUM(est_cost_usd) / NULLIF(SUM(total_tokens), 0))
    ) as efficiency_percentile
    
FROM gold.mart_llm_cost_by_user_model_day
GROUP BY model, provider, date_day;

-- Indexes
CREATE INDEX idx_efficiency_model ON gold.mart_llm_cost_efficiency(model);
CREATE INDEX idx_efficiency_date ON gold.mart_llm_cost_efficiency(date_day);
CREATE INDEX idx_efficiency_provider ON gold.mart_llm_cost_efficiency(provider);
```

### New API Endpoint
```typescript
// GET /api/v1/cost/efficiency-ranking
interface ModelEfficiency {
  model: string;
  provider: string;
  cost_per_request: number;
  cost_per_1m_tokens: number;
  cost_per_1m_input_tokens: number;
  cost_per_1m_output_tokens: number;
  total_cost: number;
  total_requests: number;
  efficiency_percentile: number; // 0-1, lower is more efficient
  rank: number;
}
```

### Benefits
- **Accurate efficiency metrics**: Based on actual data, not approximations
- **Historical tracking**: Can show efficiency trends over time
- **Model comparison**: Easy to identify which models are most cost-effective
- **Optimization insights**: Identify models that are expensive per token but cheap per request (or vice versa)

---

## 3. User Activity Daily Summary

### Current Limitation
The "Cost per User-Day" metric currently:
- Divides total cost by number of top users (only shows top 20)
- Approximates with `/30` for daily average
- Cannot account for actual active days vs inactive days

**Problem**: Inaccurate metric - doesn't reflect actual user activity patterns.

### Recommended Solution: Create User Activity Summary

```sql
-- New materialized view: mart_user_daily_summary
CREATE MATERIALIZED VIEW gold.mart_user_daily_summary AS
SELECT 
    date_day,
    user_id,
    user_email,
    organization_id,
    
    -- Cost and Usage
    SUM(est_cost_usd) as daily_cost,
    SUM(total_tokens) as daily_tokens,
    SUM(total_requests) as daily_requests,
    
    -- Model Diversity
    COUNT(DISTINCT model) as models_used,
    COUNT(DISTINCT agent_id) as agents_used,
    
    -- Activity Flags
    CASE WHEN SUM(total_requests) > 0 THEN 1 ELSE 0 END as is_active_day
    
FROM gold.mart_llm_cost_by_user_model_day
GROUP BY date_day, user_id, user_email, organization_id;

-- Indexes
CREATE INDEX idx_user_daily_date ON gold.mart_user_daily_summary(date_day);
CREATE INDEX idx_user_daily_user ON gold.mart_user_daily_summary(user_id);
CREATE INDEX idx_user_daily_org ON gold.mart_user_daily_summary(organization_id);
```

### Updated Summary Query
```sql
-- Accurate cost per user-day calculation
SELECT 
    SUM(daily_cost) / NULLIF(COUNT(*), 0) as avg_cost_per_user_day,
    COUNT(DISTINCT user_id) as total_users,
    SUM(is_active_day) as total_active_days,
    SUM(daily_cost) / NULLIF(SUM(is_active_day), 0) as avg_cost_per_active_day
FROM gold.mart_user_daily_summary
WHERE date_day >= $1 AND date_day <= $2;
```

### Benefits
- **Accurate user-day metrics**: Based on actual activity, not approximations
- **Activity insights**: Can identify inactive users or sporadic usage patterns
- **Better cost allocation**: Distinguish between cost per calendar day vs cost per active day
- **User behavior analysis**: Track model diversity and usage patterns per user

---

## 4. Provider Summary Table

### Current Limitation
The "Total Costs by Vendor" donut chart:
- Aggregates all models from `by-model` endpoint in frontend
- Groups by provider in JavaScript
- No historical comparison

### Recommended Solution: Create Provider Summary Mart

```sql
-- New materialized view: mart_llm_cost_by_provider_summary
CREATE MATERIALIZED VIEW gold.mart_llm_cost_by_provider_summary AS
WITH period_data AS (
    SELECT 
        provider,
        organization_id,
        agent_id,
        SUM(est_cost_usd) as est_cost_usd,
        SUM(total_tokens) as total_tokens,
        SUM(total_requests) as total_requests,
        COUNT(DISTINCT model) as models_used,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(date_day) as first_usage_date,
        MAX(date_day) as last_usage_date
    FROM gold.mart_llm_cost_by_user_model_day
    WHERE date_day >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY provider, organization_id, agent_id
)
SELECT 
    provider,
    organization_id,
    agent_id,
    est_cost_usd,
    total_tokens,
    total_requests,
    models_used,
    unique_users,
    first_usage_date,
    last_usage_date,
    
    -- Percentage calculation
    (est_cost_usd / SUM(est_cost_usd) OVER (PARTITION BY organization_id, agent_id)) * 100 as pct_of_total,
    
    -- Cost per user
    est_cost_usd / NULLIF(unique_users, 0) as cost_per_user
    
FROM period_data;

-- Indexes
CREATE INDEX idx_provider_summary_provider ON gold.mart_llm_cost_by_provider_summary(provider);
CREATE INDEX idx_provider_summary_org ON gold.mart_llm_cost_by_provider_summary(organization_id);
```

### Benefits
- **Pre-calculated percentages**: No frontend aggregation needed
- **Provider-level insights**: Easy to see which providers are most used
- **Better performance**: Single query instead of aggregating thousands of records

---

## 5. Model Zero-Cost Detection

### Current Limitation
The frontend checks for models with `est_cost_usd === 0` by iterating through all models.

**Problem**: 
- Not indexed, slow for large datasets
- Cannot track when a model had zero cost historically
- No alerting mechanism

### Recommended Solution: Add Zero-Cost Tracking

```sql
-- Add computed column to existing mart or create alert view
CREATE MATERIALIZED VIEW gold.mart_llm_models_with_issues AS
SELECT 
    model,
    provider,
    date_day,
    SUM(total_requests) as requests,
    SUM(total_tokens) as tokens,
    SUM(est_cost_usd) as cost,
    
    -- Issue flags
    CASE 
        WHEN SUM(total_requests) > 0 AND SUM(est_cost_usd) = 0 
        THEN TRUE 
        ELSE FALSE 
    END as has_zero_cost_issue,
    
    CASE 
        WHEN SUM(total_tokens) = 0 AND SUM(total_requests) > 0 
        THEN TRUE 
        ELSE FALSE 
    END as has_missing_token_issue
    
FROM gold.mart_llm_cost_by_user_model_day
GROUP BY model, provider, date_day
HAVING SUM(est_cost_usd) = 0 OR SUM(total_tokens) = 0;

-- Index for fast lookups
CREATE INDEX idx_model_issues_flags ON gold.mart_llm_models_with_issues(has_zero_cost_issue, has_missing_token_issue);
```

### New API Endpoint
```typescript
// GET /api/v1/cost/model-issues
interface ModelIssue {
  model: string;
  provider: string;
  date_day: string;
  requests: number;
  tokens: number;
  cost: number;
  has_zero_cost_issue: boolean;
  has_missing_token_issue: boolean;
}
```

### Benefits
- **Proactive detection**: Identify data quality issues automatically
- **Historical tracking**: See when issues started occurring
- **Better alerting**: Can trigger notifications for cost tracking failures

---

## Implementation Priority

### Phase 1 (High Impact, Low Effort)
1. **Provider Aggregation Table** - Biggest performance improvement for vendor trend chart
2. **Provider Summary Table** - Simplifies vendor donut chart

### Phase 2 (High Impact, Medium Effort)
3. **User Activity Daily Summary** - Enables accurate per-user-day metrics
4. **Cost Efficiency Metrics Table** - Provides valuable optimization insights

### Phase 3 (Medium Impact, Low Effort)
5. **Model Zero-Cost Detection** - Improves data quality monitoring

---

## Performance Impact Estimates

| Change | Current Query Time | Estimated New Query Time | Data Reduction |
|--------|-------------------|-------------------------|----------------|
| Provider Daily Aggregation | 500-2000ms | 50-100ms | 95% |
| Provider Summary | 200-500ms | 20-50ms | 90% |
| User Daily Summary | 1000-3000ms | 100-200ms | 85% |
| Cost Efficiency Rankings | N/A (frontend calc) | 50-100ms | N/A |
| Zero-Cost Detection | 200-500ms | 10-20ms | 99% |

**Total estimated improvement**: 5-10x faster dashboard load times

---

## Migration Strategy

### Step 1: Create Materialized Views
```sql
-- Run creation scripts in order
-- Estimated time: 5-10 minutes
```

### Step 2: Create Refresh Jobs
```sql
-- Schedule daily refresh at off-peak hours
-- OR set up trigger-based refresh after fact table updates
```

### Step 3: Update API Endpoints
- Add new endpoints for pre-aggregated data
- Keep existing endpoints for backward compatibility
- Gradually migrate frontend to use new endpoints

### Step 4: Monitor & Optimize
- Track query performance before/after
- Adjust indexes based on actual query patterns
- Consider partitioning for very large datasets (>100M rows)

---

## Refresh Strategy

### Option A: Scheduled Refresh (Recommended for daily data)
```sql
-- Refresh all cost-related marts once per day
CREATE OR REPLACE FUNCTION refresh_cost_marts()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY gold.mart_llm_cost_by_provider_day;
    REFRESH MATERIALIZED VIEW CONCURRENTLY gold.mart_llm_cost_efficiency;
    REFRESH MATERIALIZED VIEW CONCURRENTLY gold.mart_user_daily_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY gold.mart_llm_cost_by_provider_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY gold.mart_llm_models_with_issues;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily at 2 AM
-- (Use pg_cron or external scheduler)
```

### Option B: Incremental Refresh (For real-time requirements)
```sql
-- Only refresh data for new/updated dates
-- More complex but enables near real-time updates
```

---

## Alternative: Computed Columns in Existing Tables

If creating new materialized views is not feasible, consider adding computed columns to existing marts:

```sql
-- Add efficiency metrics to existing mart_llm_cost_by_user_model_day
ALTER TABLE gold.mart_llm_cost_by_user_model_day
ADD COLUMN cost_per_request DECIMAL(12,6) GENERATED ALWAYS AS (
    CASE 
        WHEN total_requests > 0 
        THEN est_cost_usd / total_requests 
        ELSE 0 
    END
) STORED;

-- Similar for cost_per_1m_tokens, etc.
```

**Trade-off**: Storage space vs query performance. Generated columns are slower to compute at insert time but faster to query.

---

## Summary

The recommended database changes will:
1. **Improve performance** by 5-10x for most queries
2. **Reduce API payload sizes** by 85-95%
3. **Enable new features** like efficiency rankings and accurate user-day metrics
4. **Improve data quality** through better monitoring
5. **Scale better** as data volume grows

All changes are backward compatible and can be implemented incrementally without disrupting existing functionality.
