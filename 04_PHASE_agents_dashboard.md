# Phase 4 — Agent Performance Dashboard

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phases 1–3 are complete. All patterns are established from the Cost page.
Follow the exact same API + SWR + ECharts pattern from Phase 3.

---

## Goal
The Agent Performance dashboard is fully functional with all charts,
the agent leaderboard table, and the agent detail slide-over.

---

## API — `api/src/routes/agents.ts`

### `GET /api/v1/agents/summary`
Query `mart_agent_summary`.
Return all agents sorted by `total_conversations` descending.
Include: `agent_id`, `agent_name`, `agent_type`, `owner_email`, `total_unique_users`, `total_conversations`, `total_messages`, `total_tokens`, `total_est_cost_usd`, `satisfaction_rate`, `total_positive_reactions`, `total_negative_reactions`, `last_interacted_at`, `is_deleted`.

### `GET /api/v1/agents/performance`
Query `mart_agent_performance_daily`.
Accept `?from&to&agent_id`.
Return daily rows: `{ date_day, agent_id, agent_name, unique_users, total_conversations, total_messages, avg_messages_per_conv, est_cost_usd, reactions_positive, reactions_negative }`.
This feeds both the activity-over-time chart and the reactions chart.

### `GET /api/v1/agents/kpis`
Return period-level KPI summary:
- `active_agents`: count of distinct agents with > 0 conversations in period
- `total_conversations`: sum
- `avg_satisfaction_rate`: weighted average across all agents
- `most_used_agent`: `{ agent_id, agent_name, total_conversations }`
Include previous period values for delta.

### `GET /api/v1/agents/:agentId`
For the slide-over detail. Returns full agent profile + period stats.
Joins `mart_agent_summary` with `mart_agent_performance_daily` for the period.
Also returns last 20 conversations: query `gold.fact_messages` grouped by `conversation_id` for this agent — `{ conversation_id, message_count, user_key, date }`.

---

## Frontend — `web/src/app/dashboard/agents/page.tsx`

### KPI Row
- **Active Agents** — count · delta · `deltaDirection: 'up-good'`
- **Total Conversations** — formatted number · delta · `deltaDirection: 'up-good'`
- **Avg Satisfaction Rate** — `formatPercent(rate)` · delta · `deltaDirection: 'up-good'`
- **Most Used Agent** — agent name as value · conversations as subtitle · no delta

### Local state
`selectedAgentId: string | null` — set by clicking agent rows in charts or table.
When set, the Activity Over Time and Reactions charts filter to that agent only, and other agents grey out.

### Chart Row 1 — two ChartCards side by side (height: 320px each)

**Left — Agent Usage Ranking (BarChart horizontal)**
Y axis: agent names (top 15 by conversations, sorted descending).
X axis: total conversations.
Bars coloured with primary blue, selected agent highlighted, others at 40% opacity when one is selected.
Clicking a bar sets `selectedAgentId`.

**Right — Satisfaction Rate by Agent (BarChart horizontal)**
Same agents on Y axis as left chart (keep them in sync).
X axis: satisfaction rate 0–100%.
Colour: green if ≥ 80%, amber if 60–79%, red if < 60%.
A vertical reference line at the platform average satisfaction rate.
Tooltip: positive reactions count, negative reactions count, total reactions.

### Chart Row 2 — full width (height: 320px)

**Agent Activity Over Time (LineChart multi-series)**
X axis: dates in period.
Y axis: conversation count.
One series per agent — top 5 agents only by default.
If `selectedAgentId` is set, show that agent's line prominently, grey out others.
Legend with toggle (clicking legend item shows/hides that series).
Tooltip: all agent values for hovered date.

### Chart Row 3 — two ChartCards side by side (height: 280px each)

**Left — Cost per Agent (BarChart vertical)**
X axis: agent names (same top 15).
Y axis: USD cost.
Bars coloured by cost threshold (green low, amber medium, red high — thresholds based on distribution).
Tooltip: cost, conversations, cost-per-conversation derived metric.

**Right — Reactions Over Time (AreaChart stacked)**
X axis: dates.
Two stacked area series: Positive (green, 60% opacity) and Negative (red, 60% opacity).
If `selectedAgentId` is set, filter to that agent only.
Shows reaction volume trend and ratio over time.

### Table — Agent Leaderboard (full width)
DataTable columns:
- Agent Name (searchable, clickable → opens slide-over)
- Type (badge: simple/cortex/workflow/system)
- Owner Email
- Conversations (sortable)
- Unique Users (sortable)
- Avg Msgs/Conv (sortable, 1 decimal)
- Total Tokens (formatted, sortable)
- Total Cost (formatted, bold, sortable)
- Satisfaction Rate — renders as inline progress bar + percentage text
- Last Active (relative time)

Export filename: `agent-performance-{from}-{to}.csv`

### Agent Detail — SlideOver (width: 520px)
Triggered by clicking table row or bar chart.
Content:
- Agent name (large) + type badge + owner email
- 4 mini KPIs: Conversations · Unique Users · Total Cost · Satisfaction Rate (with colour)
- Dual-axis LineChart (height: 200px): conversations (left Y, blue bars) + cost (right Y, orange line) per day
- Small AreaChart (height: 160px): satisfaction trend (positive / negative reactions over time)
- "Last 20 conversations" mini table: Date · User · Messages · Cost

---

## Done When

- [ ] All 4 API endpoints return correct data
- [ ] KPI cards show real values with deltas
- [ ] Clicking an agent bar in Usage Ranking highlights that agent across all charts
- [ ] Satisfaction rate bars are correctly coloured green/amber/red
- [ ] Activity Over Time shows top 5 agents with legend toggles
- [ ] Cost per Agent bar chart renders
- [ ] Reactions Over Time stacked area renders
- [ ] Leaderboard table satisfaction column shows inline progress bar
- [ ] Clicking a table row opens the agent slide-over with real data
- [ ] Export CSV works
- [ ] Filter bar changes re-fetch all data
- [ ] No TypeScript errors
