# Jeen Analytics Dashboard — Master Context
> This file is referenced by every phase prompt.
> It is the single source of truth for the entire project.
> Never deviate from what is defined here.

---

## Project Overview

A production analytics dashboard for the Jeen platform.
Built as a **monorepo** containing two packages:
- `api/` — Fastify (Node.js + TypeScript) REST API
- `web/` — Next.js 14 (App Router, TypeScript, Tailwind CSS) frontend

Both run in Docker. All secrets in a single root `.env` file.

---

## Monorepo Structure

```
jeen-dashboard/
├── .env                      ← all secrets, never commit
├── .env.example              ← safe template
├── .gitignore
├── docker-compose.yml        ← runs both api + web
│
├── api/                      ← Fastify analytics API
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          ← server entry point
│       ├── db.ts             ← postgres connection pool (bi_readonly)
│       ├── cache.ts          ← in-memory cache (node-cache)
│       ├── routes/
│       │   ├── freshness.ts
│       │   ├── cost.ts
│       │   ├── agents.ts
│       │   ├── users.ts
│       │   ├── documents.ts
│       │   ├── operations.ts
│       │   └── ai.ts         ← AI chat + text-to-SQL endpoint
│       ├── ai/
│       │   ├── client.ts     ← Azure OpenAI client
│       │   ├── prompts.ts    ← system prompts + schema context per page
│       │   ├── sqlValidator.ts ← validates generated SQL before execution
│       │   └── kpiDefinitions.ts ← static KPI formula definitions
│       └── types/
│           └── index.ts      ← shared API types
│
└── web/                      ← Next.js dashboard
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── next.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx           ← root layout: sidebar + top bar
        │   ├── page.tsx             ← redirects to /dashboard/cost
        │   └── dashboard/
        │       ├── layout.tsx       ← dashboard shell: nav + filter bar + AI sidebar
        │       ├── cost/page.tsx
        │       ├── agents/page.tsx
        │       ├── users/page.tsx
        │       ├── documents/page.tsx
        │       └── operations/page.tsx
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx          ← left nav
        │   │   ├── TopBar.tsx           ← page title + global filters
        │   │   ├── FilterBar.tsx        ← date range + org + agent dropdowns
        │   │   └── FreshnessBar.tsx     ← "data last updated" indicator
        │   ├── charts/
        │   │   ├── useEChart.ts         ← shared ECharts init/resize/cleanup hook
        │   │   ├── LineChart.tsx
        │   │   ├── BarChart.tsx
        │   │   ├── StackedBarChart.tsx
        │   │   ├── AreaChart.tsx
        │   │   ├── DonutChart.tsx
        │   │   ├── HeatmapChart.tsx
        │   │   ├── FunnelChart.tsx
        │   │   └── BoxPlotChart.tsx
        │   ├── dashboard/
        │   │   ├── KpiCard.tsx          ← metric + delta + trend arrow
        │   │   ├── KpiRow.tsx           ← 4-card row layout
        │   │   ├── DataTable.tsx        ← sortable, paginated, exportable
        │   │   ├── SlideOver.tsx        ← drill-down panel (right slide)
        │   │   ├── StatusBadge.tsx      ← green/amber/red pill
        │   │   └── ChartCard.tsx        ← chart wrapper with title + loading state
        │   └── ai/
        │       ├── AISidebar.tsx        ← main sidebar container
        │       ├── ChatMessage.tsx      ← individual message bubble
        │       ├── SqlResult.tsx        ← SQL + table + narrative block
        │       ├── KpiExplanation.tsx   ← formula card
        │       └── SuggestedQuestions.tsx
        ├── lib/
        │   ├── api.ts           ← all typed fetch functions → api service
        │   ├── formatters.ts    ← $, K/M, %, dates
        │   └── constants.ts     ← page names, color palette, filter defaults
        └── store/
            └── filters.ts       ← Zustand store: global filter state
```

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Frontend framework | Next.js 14 (App Router) |
| Frontend language | TypeScript |
| Styling | Tailwind CSS |
| Charts | ECharts (echarts + echarts-for-react) |
| Global state | Zustand (filter state only) |
| API framework | Fastify 4 |
| API language | TypeScript |
| DB client | postgres (node-postgres / pg) |
| In-memory cache | node-cache |
| AI | Azure OpenAI (gpt model — key/endpoint from .env) |
| Container | Docker + docker-compose |

---

## Environment Variables

All in root `.env`:

```
# Analytics DB (read-only access — bi_readonly role)
ANALYTICS_DB_HOST=jeen-dev-db.postgres.database.azure.com
ANALYTICS_DB_PORT=5432
ANALYTICS_DB_NAME=analytics_db
ANALYTICS_DB_USER=bi_readonly
ANALYTICS_DB_PASSWORD=your_bi_readonly_password
ANALYTICS_DB_SSLMODE=require

# API config
API_PORT=3001
API_HOST=0.0.0.0
CACHE_TTL_SECONDS=3300

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## API Conventions

All endpoints:
- `GET` only — no writes ever
- Base path: `/api/v1/`
- Always accept: `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Optionally accept: `?organization_id=xxx&agent_id=yyy`
- Always return: `{ data: [...], meta: { from, to, generated_at, cached: bool } }`
- Always run as `bi_readonly` role — gold schema only
- Cache TTL: 55 minutes (just under hourly dbt refresh)
- Query timeout: 10 seconds hard limit

### Endpoint Map

| Route | Gold Table | Page |
|-------|-----------|------|
| `GET /api/v1/freshness` | `control.watermarks` | All pages |
| `GET /api/v1/cost/daily` | `mart_llm_cost_by_user_model_day` | Cost |
| `GET /api/v1/cost/hourly` | `mart_llm_cost_hourly` | Cost |
| `GET /api/v1/cost/by-model` | `mart_llm_cost_by_user_model_day` | Cost |
| `GET /api/v1/cost/top-users` | `mart_llm_cost_by_user_model_day` | Cost |
| `GET /api/v1/agents/performance` | `mart_agent_performance_daily` | Agents |
| `GET /api/v1/agents/summary` | `mart_agent_summary` | Agents |
| `GET /api/v1/users/activity` | `fact_user_activity_daily` + `dim_date` | Users |
| `GET /api/v1/users/summary` | `mart_user_summary` | Users |
| `GET /api/v1/documents/health` | `mart_document_rag_health` | Documents |
| `GET /api/v1/documents/processing` | `fact_document_processing` | Documents |
| `GET /api/v1/operations/hourly` | `mart_operational_hourly` | Operations |
| `POST /api/v1/ai/chat` | gold schema (read-only) | AI sidebar |

---

## Gold Schema — Quick Reference

### Dimension Tables
- `gold.dim_date` — date_key (YYYYMMDD int), date_actual, day_of_week, week_of_year, month_actual, year_actual, is_weekend
- `gold.dim_users` — user_key, user_id (UUID), email, full_name, organization_id, is_owner, account_created_at, is_deleted
- `gold.dim_agents` — agent_key, agent_id (UUID), name, type, owner_user_id, owner_email, is_public, model, is_deleted
- `gold.dim_models` — model_key, model_name, provider, display_name, context_window, input_cost_per_1k_tokens, output_cost_per_1k_tokens
- `gold.dim_documents` — document_key, document_id (UUID), file_name, content_type_group, file_size_bytes, parsing_technique, owner_user_id

### Fact Tables
- `gold.fact_model_transactions` — transaction_id, date_key, user_key, agent_key, model_key, provider, model, input_tokens, output_tokens, total_tokens, reasoning_tokens, est_cost_usd, transacted_at, date_hour
- `gold.fact_messages` — message_id, date_key, user_key, agent_key, conversation_id, role, has_tool_calls, iteration_count, reaction_type, message_created_at, date_hour
- `gold.fact_document_processing` — document_id, date_key, document_key, user_key, status, file_size_bytes, parsing_technique, total_chunks, total_words, has_embeddings, document_created_at
- `gold.fact_user_activity_daily` — user_activity_key, date_key, user_key, conversations_started, messages_sent, assistant_messages, documents_uploaded, agents_used, total_tokens, est_cost_usd

### Mart Tables
- `gold.mart_llm_cost_by_user_model_day` — date_day, user_id, user_email, provider, model, agent_id, agent_name, total_requests, total_input_tokens, total_output_tokens, total_tokens, total_reasoning_tokens, est_cost_usd, stream_pct
- `gold.mart_llm_cost_hourly` — date_hour, provider, model, total_requests, total_input_tokens, total_output_tokens, total_tokens, est_cost_usd, unique_users, unique_agents
- `gold.mart_agent_performance_daily` — date_day, agent_id, agent_name, agent_type, owner_user_id, unique_users, total_conversations, total_messages, avg_messages_per_conv, total_input_tokens, total_output_tokens, est_cost_usd, tool_calls_count, reactions_positive, reactions_negative
- `gold.mart_agent_summary` — agent_id, agent_name, agent_type, owner_email, created_at, last_interacted_at, total_unique_users, total_conversations, total_messages, total_tokens, total_est_cost_usd, total_positive_reactions, total_negative_reactions, satisfaction_rate, is_deleted
- `gold.mart_user_summary` — user_id, email, full_name, organization_id, is_owner, account_created_at, last_active_at, total_conversations, total_messages_sent, total_documents_uploaded, total_tokens_consumed, total_est_cost_usd, favourite_agent_name, favourite_model, is_deleted
- `gold.mart_document_rag_health` — date_day, parsing_technique, uploaded, processed, failed, success_rate, avg_chunks_per_doc, avg_words_per_chunk, docs_with_embeddings, embedding_coverage
- `gold.mart_operational_hourly` — date_hour, new_conversations, new_messages, user_messages, assistant_messages, messages_with_tool_calls, total_tokens, total_cost_usd, new_documents, failed_documents, doc_failure_rate, new_users, active_users, unique_agents_used, avg_iteration_count
- `gold.mart_sharing_activity_daily` — date_day, feature_type, access_role, shares_granted, shares_revoked, active_shares, unique_granters, unique_recipients

---

## Visual Design System

| Token | Value |
|-------|-------|
| Background | `#F8F9FA` (off-white page), `#FFFFFF` (cards) |
| Sidebar bg | `#1E293B` (dark slate) |
| Sidebar text | `#94A3B8` inactive, `#FFFFFF` active |
| Primary | `#2563EB` (blue) |
| Success | `#16A34A` (green) |
| Warning | `#D97706` (amber) |
| Danger | `#DC2626` (red) |
| Text primary | `#111827` |
| Text secondary | `#6B7280` |
| Border | `#E5E7EB` |
| Chart palette | `['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#9333EA','#65A30D']` |
| Border radius | `rounded-xl` for cards, `rounded-lg` for inputs |
| Shadow | `shadow-sm` on cards |

---

## Dashboard Pages — KPIs and Charts Summary

### Cost & Tokens (`/dashboard/cost`)
KPIs: Total Cost · Total Tokens · Cost per 1K Tokens · Most Expensive Model
Charts: Daily Cost Trend (multi-line) · Cost by Model (donut) · Token Distribution (stacked horiz bar) · Top 10 Users by Cost (horiz bar)
Table: Daily cost breakdown — Date · User · Model · Requests · Input Tokens · Output Tokens · Cost
Drill: User Cost Detail slide-over

### Agent Performance (`/dashboard/agents`)
KPIs: Active Agents · Total Conversations · Avg Satisfaction Rate · Most Used Agent
Charts: Agent Usage Ranking (horiz bar) · Satisfaction Rate by Agent (horiz bar) · Agent Activity Over Time (multi-line) · Cost per Agent (vert bar) · Reactions Over Time (stacked area)
Table: Agent leaderboard — Name · Type · Owner · Conversations · Users · Msgs/Conv · Tokens · Cost · Satisfaction
Drill: Agent Detail slide-over

### User Activity (`/dashboard/users`)
KPIs: DAU · WAU · MAU · New Users
Charts: DAU Trend (line + 7-day MA) · Activity Heatmap (hour × day) · User Cohort Retention (heatmap) · Messages Distribution (histogram)
Table: User activity — Email · Org · Conversations · Messages · Agents · Tokens · Cost · Last Active
Drill: User Detail slide-over

### Document & RAG Health (`/dashboard/documents`)
KPIs: Total Documents · Success Rate · Avg Chunks/Doc · Currently Failing
Charts: Processing Funnel · Daily Processing Volume (stacked bar) · Success Rate by Technique (horiz bar) · Chunk Quality (box plot) · Embedding Coverage (donut)
Table: Document list — File · Type · Technique · Status · Size · Chunks · Words · Embeddings · Uploaded By · Date
Drill: Failed document expandable row

### Platform Operations (`/dashboard/operations`)
KPIs: Messages Last Hour · Cost Last Hour · Doc Failure Rate · Active Users Last Hour
Special: Status bar (5 health indicators) — top of page
Charts: Hourly Message Volume (area line + anomaly band) · Hourly Cost (line) · Document Processing Rate (dual-axis) · Agent Traffic (stacked area)
Table: Platform events — Time · Type · Description · Severity (auto-refreshes every 5 min)

---

## AI Chat Sidebar

**Placement:** fixed right sidebar, 380px wide, slides in/out, persists across page navigation
**Trigger:** chat icon button in top bar
**LLM:** Azure OpenAI (config from .env)

**Context injected per message:**
- Current page name
- Active filters (date range, org, agent)
- Current KPI values visible on screen
- Schema context for current page only (curated, not full DDL)
- KPI formula definitions for current page

**Response types:**
- Plain text — conversational + KPI explanations
- SQL + table + narrative — text-to-SQL answers
- KPI explanation card — formula + source table + caveats
- Error card — friendly failure + suggested rephrases

**SQL safety rules (enforced by validator before execution):**
- SELECT only — no INSERT/UPDATE/DELETE/DDL
- gold schema tables only — no bronze/silver/control
- Active filters always injected as WHERE clauses
- Hard query timeout: 10 seconds
- Row limit: 500 rows
- Runs as bi_readonly role

**Suggested questions:** 4 chips per page, change on navigation

**Freshness indicator:** per-page, queries `control.watermarks`, shows last updated time, turns amber warning if > 24 hours stale

---

## Rules — Never Break These

1. API never writes to the database — SELECT only, always `bi_readonly` role
2. Never hardcode credentials — always read from environment variables
3. Never query bronze or silver from the API — gold schema only
4. ECharts always initialised via `useEChart` hook — never raw in components
5. All API responses include `meta.generated_at` and `meta.cached` boolean
6. All monetary values formatted with `formatters.ts` — never inline
7. All chart components accept `options` as prop — option-building logic lives in pages
8. SQL generated by AI always passes through `sqlValidator.ts` before execution
9. Surrogate keys (user_key, agent_key etc.) never exposed to the frontend — use natural keys (user_id, agent_id)
10. TypeScript strict mode — no `any` types
