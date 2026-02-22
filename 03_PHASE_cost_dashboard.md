# Phase 3 — Cost & Tokens Dashboard

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phases 1 and 2 are complete. All shared components exist.
This phase builds the first complete dashboard page end-to-end.

---

## Goal
The Cost & Tokens dashboard is fully functional:
API endpoints return real data, charts render correctly,
table is sortable/searchable, user drill-down works.
This page proves every pattern used in Phases 4–7.

---

## API — `api/src/routes/cost.ts`

Build these 4 endpoints. All accept `?from&to&organization_id&agent_id`.
All use `queryWithCache` from `db.ts`. Cache TTL: 55 minutes.

### `GET /api/v1/cost/daily`
Query `mart_llm_cost_by_user_model_day`.
Group by `date_day` and `model`.
Return daily totals per model — array of `{ date, model, est_cost_usd, total_tokens, total_requests }`.
This feeds the multi-series line chart.

### `GET /api/v1/cost/by-model`
Query `mart_llm_cost_by_user_model_day`.
Group by `model` and `provider`.
Return `{ model, provider, est_cost_usd, total_tokens, total_requests, pct_of_total }`.
Sort by `est_cost_usd` descending.
This feeds the donut chart and token distribution bar.

### `GET /api/v1/cost/top-users`
Query `mart_llm_cost_by_user_model_day`.
Group by `user_id`, `user_email`.
Return top 20 users by `est_cost_usd` — `{ user_id, user_email, est_cost_usd, total_tokens, total_requests, top_model }`.
`top_model` = the model they used most (subquery).

### `GET /api/v1/cost/summary`
Query `mart_llm_cost_by_user_model_day` for the period.
Return period totals + previous period totals for delta calculation:
```json
{
  "current": { "est_cost_usd": 1234.56, "total_tokens": 45000000, "total_requests": 12000 },
  "previous": { "est_cost_usd": 1100.00, "total_tokens": 40000000, "total_requests": 10500 },
  "most_expensive_model": "gpt-4o",
  "cost_per_1k_tokens": 0.027
}
```
Previous period = same duration immediately before `from`.

---

## Frontend — `web/src/app/dashboard/cost/page.tsx`

Replace the placeholder with the full page.

### Data fetching
Use SWR for all 4 endpoints. Pass `{ from, to, organizationId, agentId }` from Zustand store as query params. When filters change, SWR automatically re-fetches (filters are part of the SWR key).

### KPI Row
4 KpiCards:
- **Total Cost** — `formatCost(summary.current.est_cost_usd)` · delta vs previous · `deltaDirection: 'up-bad'`
- **Total Tokens** — `formatTokens(summary.current.total_tokens)` · delta vs previous · `deltaDirection: 'up-bad'`
- **Cost per 1K Tokens** — `formatCost(summary.cost_per_1k_tokens * 1000)` · delta · `deltaDirection: 'up-bad'`
- **Most Expensive Model** — model name as value, no delta, subtitle: total cost for that model

### Chart 1 — Daily Cost Trend (full width, height: 350px)
ECharts multi-series line chart.
X axis: dates from the period.
Y axis: USD cost (formatted with `$` prefix on axis labels).
One series per model — each a different colour from the chart palette.
Smooth lines. Area fill with 15% opacity.
Legend above the chart.
Tooltip: shows all model values for the hovered date + total.
Build the ECharts `option` object in the page, pass it to `<LineChart />`.

### Chart Row 2 — two ChartCards side by side

**Left — Cost by Model (DonutChart, height: 280px)**
Centre label: total cost for period.
One segment per model, using chart palette colours.
Tooltip: model name, cost, % of total.
Clicking a segment sets a local `selectedModel` state which filters the table below.

**Right — Token Distribution (BarChart horizontal, height: 280px)**
Y axis: model names.
3 series: Input Tokens (blue) · Output Tokens (purple) · Reasoning Tokens (grey).
Stacked horizontal bars.
X axis labels abbreviated (K/M).
Shows which models generate most reasoning tokens (useful for cost insight).

### Chart 3 — Top 10 Users by Cost (full width, height: 280px)
Horizontal BarChart.
Y axis: user_email (truncate long emails to 30 chars).
X axis: USD cost.
Bars coloured by top model (use model-to-colour mapping).
Clicking a bar opens the User Cost Detail SlideOver.

### Table — Cost Breakdown
DataTable with columns:
- Date (sortable)
- User Email (searchable)
- Model
- Provider
- Requests (sortable)
- Input Tokens (formatted, sortable)
- Output Tokens (formatted, sortable)
- Est. Cost (formatted, sortable, bold)

Data source: `GET /api/v1/cost/daily` grouped by user — reuse the top-users data shaped differently, or add a `/cost/detail` endpoint that returns row-level data from `mart_llm_cost_by_user_model_day`.
If `selectedModel` is set (from donut click), filter table rows to that model.
Export filename: `cost-breakdown-{from}-{to}.csv`

### User Cost Detail — SlideOver
Triggered by clicking a user bar in chart 3 or a table row.
Content:
- User email + organisation_id at top
- 3 small KPI cards: Total Cost · Total Tokens · Total Requests (for this user, this period)
- Small DonutChart: cost by model for this user (height: 200px)
- Small LineChart: daily cost for this user (height: 180px)
- Mini table: last 10 rows from `mart_llm_cost_by_user_model_day` for this user

Add endpoint `GET /api/v1/cost/user/:userId?from&to` to the API for this slide-over data.

---

## Done When

- [ ] All 4 API endpoints return correct data (test with curl)
- [ ] KPI cards show real numbers with correct delta arrows
- [ ] Daily Cost Trend line chart renders with one line per model
- [ ] Cost by Model donut chart renders and clicking a segment filters the table
- [ ] Token Distribution horizontal stacked bar renders
- [ ] Top 10 Users bar chart renders and clicking opens the slide-over
- [ ] Slide-over shows user-specific data
- [ ] Table is sortable by every column
- [ ] Table search filters by user email
- [ ] Export CSV downloads correct data
- [ ] Changing the date range filter re-fetches all charts
- [ ] Freshness bar shows correct last-updated for cost page tables
- [ ] No TypeScript errors
