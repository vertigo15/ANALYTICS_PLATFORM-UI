# Phase 5 — User Activity, Document Health & Platform Operations

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phases 1–4 complete. All patterns established.
This phase builds the remaining 3 dashboard pages in one pass —
they follow the exact same patterns as Phases 3 and 4.

---

## Goal
Three fully functional dashboard pages:
- User Activity (`/dashboard/users`)
- Document & RAG Health (`/dashboard/documents`)
- Platform Operations (`/dashboard/operations`)

---

## PAGE 1 — User Activity

### API endpoints (`api/src/routes/users.ts`)

**`GET /api/v1/users/kpis`**
Returns DAU (today), WAU (this week), MAU (this month), new users in period.
Include previous period values for delta.
Query `fact_user_activity_daily` joined with `dim_date`.
DAU = distinct users with activity on the most recent date in the period.
WAU = distinct users active in last 7 days.
MAU = distinct users active in last 30 days.
New users = `dim_users.account_created_at` within the date range.

**`GET /api/v1/users/activity-daily`**
Returns day-by-day active user counts.
`{ date, dau, messages_sent, total_tokens, est_cost_usd }` per day.
Also includes 7-day rolling average for DAU.
Query: `fact_user_activity_daily` grouped by `date_key`.

**`GET /api/v1/users/activity-heatmap`**
Returns activity counts by (hour_of_day × day_of_week).
Query: `fact_messages` joined with `dim_date` — group by `EXTRACT(ISODOW FROM message_created_at)` and `EXTRACT(HOUR FROM message_created_at)`.
Return as flat array: `{ day_of_week: 1-7, hour: 0-23, message_count }`.

**`GET /api/v1/users/summary`**
Returns all users from `mart_user_summary`.
Include: email, org, conversations, messages, tokens, cost, last_active_at, account_created_at, favourite_agent, favourite_model.

**`GET /api/v1/users/:userId`**
User detail for slide-over.
Returns user profile + period stats + last 10 conversations.

### Frontend (`web/src/app/dashboard/users/page.tsx`)

**KPI Row:** DAU · WAU · MAU · New Users (all `up-good`)

**Chart Row 1 — full width (height: 320px)**
DAU Trend LineChart.
Two series: DAU (solid primary blue) + 7-day MA (dashed, lighter blue).
Weekend days shown with subtle grey background band (use `markArea` in ECharts).
Tooltip: DAU + MA value for hovered date.

**Chart Row 2 — two side by side (height: 320px)**

Left — Activity Heatmap (HeatmapChart):
X axis: day labels Mon–Sun.
Y axis: hour labels 0–23 (bottom to top).
Cell colour: white (0) → primary blue (peak).
Tooltip: "Monday 14:00 — 234 messages".

Right — Messages Distribution (BarChart vertical):
X axis: buckets ["1–5", "6–20", "21–50", "51–100", "100+"].
Y axis: user count in each bucket.
Derived client-side from `users/summary` data.
Shows power-user distribution.

**Table:** User activity. Columns: Email · Org · Conversations · Messages · Agents Used · Tokens · Cost · Last Active · Days Since Signup.
Row click → User Detail slide-over.

**User Detail SlideOver:**
Email + org + signup date.
4 mini KPIs: Conversations · Messages · Total Cost · Favourite Agent.
Daily activity bar chart (height: 180px) — messages per day for this user.
Small DonutChart — cost breakdown by model.
Last 10 conversations mini table.

---

## PAGE 2 — Document & RAG Health

### API endpoints (`api/src/routes/documents.ts`)

**`GET /api/v1/documents/kpis`**
Total documents uploaded in period.
Overall success rate (processed / uploaded).
Average chunks per processed document.
Count of documents currently in FAILED or PROCESSING state (not date-range scoped — current state).

**`GET /api/v1/documents/funnel`**
Counts by status: PENDING_UPLOAD, UPLOADED, PROCESSING, PROCESSED, FAILED.
From `fact_document_processing` — not date-scoped, current snapshot.

**`GET /api/v1/documents/daily`**
Daily volume by status: `{ date, status, count }`.
Feeds stacked bar chart.

**`GET /api/v1/documents/by-technique`**
Success rate per parsing technique.
`{ parsing_technique, uploaded, processed, failed, success_rate, avg_chunks_per_doc, avg_words_per_chunk }`.
From `mart_document_rag_health` aggregated over the period.

**`GET /api/v1/documents/list`**
Full document list from `fact_document_processing` joined with `dim_documents` and `dim_users`.
Return: file_name, content_type_group, parsing_technique, status, file_size_bytes, total_chunks, total_words, has_embeddings, owner email, document_created_at.
Paginated server-side: accept `?page&pageSize&status` filter.

### Frontend (`web/src/app/dashboard/documents/page.tsx`)

**KPI Row:** Total Documents · Success Rate · Avg Chunks/Doc · Currently Failing (red highlight if > 0)

**Processing Step Bar — full width**
Horizontal step bar (ProcessingStepBar component, pure CSS/Tailwind).
Steps left to right: Uploaded → Processing → Processed, with Failed separated by divider.
Each step shows count and % of total. Colour-coded: blue/amber/green/red.
Fetches from `/documents/funnel`.

**Chart Row 1 — full width**
Documents by Time (StackedBarChart by content type).
Measure toggle: Count · Size · Embeddings · Cost.

**Chart Row 2 — two side by side (height: 280px)**

Left — Content Type Breakdown (DonutChart):
PDF vs Image vs Other. Tooltip shows count + success rate per type.
Fetches from `/documents/content-type-breakdown`.

Right — Document Size by Type (DonutChart):
Total storage consumed per content type. Labels show formatted size.

**Chart Row 3 — two side by side (height: 320px)**

Left — Top Uploaders (BarChart horizontal):
Y axis: user email (truncated). X axis: document count.
Bar colour: green ≥90%, amber 70–89%, red <70% success rate.
Right label shows exact success %. Tooltip shows full email + failed count.
Fetches from `/documents/top-uploaders`.

Right — Failure Correlations (BarChart horizontal):
Failure rate by 3 dimensions: content_type, file_size bucket, parsing_technique.
Colour: red ≥20%, amber 10–19%, green <10%. Right label shows doc count.
Fetches from `/documents/failure-correlations`.

**Chart Row 4 — two side by side (height: 280px)**

Left — Daily Processing Volume (StackedBarChart):
X axis: dates. One bar per day.
Segments: Processed (green) · Failed (red) · Pending/Processing (grey).

Right — Success Rate by Technique (BarChart horizontal):
Y axis: technique names.
X axis: success rate %.
Colour: green ≥ 90%, amber 70–89%, red < 70%.

**Chart Row 5 — two side by side (height: 280px)**

Left — Chunk Size Distribution (BarChart):
Avg words per chunk by technique.

Right — Embedding Coverage (DonutChart):
Two segments: With Embeddings (blue) · Without Embeddings (grey).
Centre: coverage percentage. If < 100%, ring is amber.

**Table:** Document list. Columns: File Name · Type · Technique · Status (badge) · Size · Chunks · Words · Embeddings (✅/❌) · Owner · Uploaded.
Filter tabs above table: All · Processed · Failed · Pending.
Failed rows show an expandable row on click:
Expanded content: error indicator placeholder + "Retry" button (no-op in POC).

---

## PAGE 3 — Platform Operations

### API endpoints (`api/src/routes/operations.ts`)

**`GET /api/v1/operations/kpis`**
Last-hour values (not date-range scoped — always last 60 minutes):
Messages last hour, cost last hour, doc failure rate last 24h, active users last hour.
From `mart_operational_hourly` — query last 1 or 24 rows.

**`GET /api/v1/operations/status`**
Returns 5 health indicators. Each has `{ label, status: 'ok'|'warning'|'error', description }`.
Computed server-side based on thresholds:
- API Volume: ok if last-hour messages within ± 2 std dev of 7-day average
- Cost Rate: ok if last-hour cost < 2× hourly average
- Document Processing: ok if failure rate < 10%, warning if 10–20%, error if > 20%
- Active Users: ok if > 0 in last hour
- Error Rate: derived from doc failure rate

**`GET /api/v1/operations/hourly`**
Last 24 hours or 48 hours of `mart_operational_hourly`.
Returns: `{ date_hour, new_messages, user_messages, assistant_messages, total_tokens, total_cost_usd, new_documents, failed_documents, doc_failure_rate, active_users, unique_agents_used }`.
Also includes 7-day average per hour (for anomaly band).

**`GET /api/v1/operations/events`**
Computed platform events — generated server-side from mart data, not stored events.
Logic: scan last 48h of `mart_operational_hourly` and generate event rows when:
- doc_failure_rate > 0.20 → warning event
- total_cost_usd > (7-day avg × 2) → warning event
- active_users = 0 for 2+ consecutive hours → warning event
Return: `{ timestamp, event_type, description, severity: 'info'|'warning'|'error' }`.

### Frontend (`web/src/app/dashboard/operations/page.tsx`)

**Note:** This page defaults to "Last 24 Hours" not "Last 30 Days". Override the global filter default locally.

**Status Bar (above KPI row, full width):**
Horizontal bar with subtle background.
5 StatusBadge components in a row — one per health signal.
Each shows a coloured dot + label + one-line description.
Auto-refreshes every 5 minutes.

**KPI Row:** Messages Last Hour · Cost Last Hour · Doc Failure Rate (24h) · Active Users Last Hour

**Chart Row 1 — full width (height: 320px)**
Hourly Message Volume (AreaChart).
Two series: User Messages (solid blue) + Assistant Messages (dashed purple).
Anomaly band: subtle grey fill showing ± 1 std dev of 7-day average for each hour.
Points outside the band highlighted with a different colour dot.
X axis: hourly labels.

**Chart Row 2 — two side by side (height: 260px)**

Left — Hourly Cost (LineChart):
X axis: hours. Y axis: USD.
Simple clean line. Tooltip shows cost + requests.

Right — Document Processing Rate (dual-axis):
Left Y axis: new documents per hour (grey bars).
Right Y axis: failure rate % (red line).
ECharts `yAxis` array with two entries.

**Chart Row 3 — full width (height: 280px)**
Agent Traffic Stacked Area (AreaChart).
Top 5 agents by traffic in last 24h.
One stacked area per agent.
X axis: hours.
Shows which agents are driving traffic at each hour.

**Table — Platform Events (auto-refreshes every 5 min)**
DataTable with: Time · Event Type · Description · Severity.
Row background: white (info) · amber-50 (warning) · red-50 (error).
No export (events are computed, not persistent data).
No pagination — show all events, max 50.

---

## Done When

### User Activity
- [ ] DAU/WAU/MAU KPIs show real numbers
- [ ] DAU trend line with 7-day MA renders
- [ ] Heatmap shows correct colour intensity by hour/day
- [ ] Messages distribution histogram renders
- [ ] User table loads and drill-down slide-over works

### Document Health
- [ ] Funnel chart renders with correct stage counts
- [ ] Daily stacked bar renders with green/red/grey segments
- [ ] Success rate by technique bar chart colour-coded correctly
- [ ] Embedding coverage donut renders
- [ ] Document table filter tabs (All/Processed/Failed/Pending) work
- [ ] Failed row expand shows placeholder

### Platform Operations
- [ ] Status bar shows 5 health indicators with correct colours
- [ ] Hourly message volume area chart renders with anomaly band
- [ ] Dual-axis document processing chart renders
- [ ] Agent traffic stacked area renders
- [ ] Events table auto-refreshes every 5 minutes
- [ ] All pages: no TypeScript errors
