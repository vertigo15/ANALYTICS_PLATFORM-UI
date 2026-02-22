# Phase 6 — AI Analytics Assistant (Chat Sidebar)

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phases 1–5 are complete. All 5 dashboards are working.
This phase wires up the AI chat sidebar end-to-end.

---

## Goal
A fully functional AI sidebar on every dashboard page that:
- Knows which page the user is on and what filters are active
- Knows the current KPI values visible on screen
- Answers KPI definition questions from a static knowledge base (no SQL)
- Answers data questions by generating + validating + executing SQL on gold schema
- Shows SQL, result table, and plain-English narrative for data questions
- Suggests 4 relevant questions per page

---

## API — `api/src/ai/`

### `api/src/ai/client.ts`
Azure OpenAI client using the `openai` npm package configured for Azure:
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
})

export { client }
```

Export a `chatCompletion(messages, options)` helper that calls `client.chat.completions.create`.

### `api/src/ai/kpiDefinitions.ts`
Static TypeScript object — one entry per KPI across all pages.
Format:
```typescript
export const KPI_DEFINITIONS: Record<string, KpiDefinition> = {
  'satisfaction_rate': {
    name: 'Satisfaction Rate',
    formula: 'positive_reactions / (positive_reactions + negative_reactions)',
    source_table: 'gold.mart_agent_summary',
    description: 'Ratio of positive message reactions to total reactions. NULL if no reactions recorded.',
    caveats: 'Only messages where users explicitly reacted are counted. Unreacted messages are excluded.'
  },
  'est_cost_usd': {
    name: 'Estimated Cost (USD)',
    formula: '(input_tokens / 1000 × input_cost_per_1k) + (output_tokens / 1000 × output_cost_per_1k)',
    source_table: 'gold.mart_llm_cost_by_user_model_day',
    description: 'Estimated USD cost based on token counts and model pricing rates from bronze.model_cost_rates.',
    caveats: 'Estimated only. Actual billing may differ. NULL if model not in cost rates table.'
  },
  'dau': {
    name: 'Daily Active Users (DAU)',
    formula: 'COUNT(DISTINCT user_key) WHERE messages_sent > 0 for a given date',
    source_table: 'gold.fact_user_activity_daily',
    description: 'Number of distinct users who sent at least one message on a given day.',
    caveats: 'Deleted users are excluded. Only counts users who sent messages — viewing without sending does not count.'
  },
  // ... add all KPIs from 00_MASTER_CONTEXT.md
}
```

Add definitions for: `total_tokens`, `cost_per_1k_tokens`, `active_agents`, `avg_messages_per_conv`, `wau`, `mau`, `success_rate`, `avg_chunks_per_doc`, `embedding_coverage`, `doc_failure_rate`.

### `api/src/ai/prompts.ts`
Builds the system prompt for each page. The system prompt contains:
1. Role definition: "You are an analytics assistant for the Jeen platform. You answer questions about analytics data."
2. Current page context (passed in at request time)
3. Active filter context (passed in at request time)
4. Current KPI values (passed in at request time)
5. Schema context for the current page only (curated table + column descriptions, NOT full DDL)
6. Rules: only generate SELECT SQL, only use the listed tables, always apply the date filter, return JSON with a `type` field

Export one function per page: `buildCostPrompt(context)`, `buildAgentsPrompt(context)`, etc.

Schema context per page should be a concise description like:
```
Available tables for this page:
- gold.mart_llm_cost_by_user_model_day: columns date_day(date), user_id(uuid), user_email(text), model(text), provider(text), est_cost_usd(numeric), total_tokens(bigint), total_requests(bigint), total_input_tokens(bigint), total_output_tokens(bigint)
- gold.mart_llm_cost_hourly: columns date_hour(timestamptz), model(text), provider(text), est_cost_usd(numeric), total_tokens(bigint), unique_users(bigint)
- gold.dim_users: columns user_id(uuid), email(text), full_name(text), organization_id(uuid), is_deleted(boolean)
```

### `api/src/ai/sqlValidator.ts`
Validates AI-generated SQL before execution. Returns `{ valid: boolean, reason?: string }`.

Checks (in order):
1. Must be a single statement
2. Must start with SELECT (case-insensitive, trimmed)
3. Must not contain: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE, EXECUTE, COPY (case-insensitive word boundaries)
4. Must not contain: `--` or `/*` (SQL comments — prevent comment-based injection)
5. Must not contain semicolons (except optionally at the very end)
6. Must not reference schemas other than `gold` (reject any `bronze.`, `silver.`, `control.`, `public.` references)
7. Must not contain subqueries that reference disallowed schemas
8. Statement length must be < 5000 characters

If any check fails, return `{ valid: false, reason: 'human-readable explanation' }`.

### `api/src/routes/ai.ts` — `POST /api/v1/ai/chat`

Request body:
```typescript
interface ChatRequest {
  message: string
  page: 'cost' | 'agents' | 'users' | 'documents' | 'operations'
  context: {
    filters: { from: string, to: string, organizationId?: string, agentId?: string }
    kpiValues: Record<string, string>  // e.g. { "Total Cost": "$1,234.56" }
  }
  history: { role: 'user' | 'assistant', content: string }[]  // last 10 messages max
}
```

Response:
```typescript
interface ChatResponse {
  type: 'text' | 'sql_result' | 'kpi_explanation' | 'error'
  content: string           // plain text answer or error message
  sql?: string              // generated SQL (for sql_result type)
  data?: Record<string, any>[]  // query result rows (for sql_result type)
  columns?: string[]        // column names for the result table
  narrative?: string        // plain English summary of the result
  kpiDefinition?: KpiDefinition  // for kpi_explanation type
  suggestions?: string[]    // 3 follow-up question suggestions
}
```

**Handler logic:**

Step 1 — Classify the question:
Send message to Azure OpenAI with a simple classification prompt:
"Is this question asking about: (A) how a KPI is calculated, (B) specific data values requiring a database query, or (C) general conversation? Reply with just A, B, or C."

Step 2A — KPI explanation:
If A: search `kpiDefinitions.ts` for matching KPI by keyword matching on the message.
If found, return type `kpi_explanation` with the definition. No SQL, no DB call.
If not found, ask the LLM to answer from context.

Step 2B — Text to SQL:
If B:
- Build system prompt using `prompts.ts` for the current page
- Call Azure OpenAI asking it to generate SQL only, return as JSON: `{ "sql": "SELECT ..." }`
- Parse the SQL from the response
- Run through `sqlValidator.ts` — if invalid, return type `error` with reason
- Execute with `db.query()` — hard 10 second timeout, LIMIT 500 injected automatically
- Send result back to Azure OpenAI: "Here is the SQL result: [data]. Write a 2-3 sentence plain English summary answering the user's question: [original question]"
- Return type `sql_result` with sql, data, columns, narrative

Step 2C — General conversation:
If C: answer directly using the page context + KPI values as context. Return type `text`.

Step 3 — Always append 3 follow-up suggestions:
After determining the response, ask the LLM to suggest 3 short follow-up questions.
Append as `suggestions` array.

**Rate limiting:** max 20 requests per minute per IP (use a simple in-memory Map — no Redis needed for POC).

---

## Frontend — AI Sidebar

### `web/src/components/ai/AISidebar.tsx`
Replace the Phase 1 placeholder with the full implementation.

The sidebar is a fixed right panel, 380px wide.
Controlled by `isAISidebarOpen` from Zustand store.
CSS transition: `transform translateX(0)` when open, `translateX(100%)` when closed.
When open, the main content area gets `margin-right: 380px` (via CSS class applied to dashboard layout).

**Structure top to bottom:**

Header:
- "Analytics Assistant" title
- Context pill showing current page + active date range
- Clear history button (trash icon, top right corner)
- Active filter tags (small grey pills): shows "Jan 1 – Feb 20" and any org/agent filters

Collapsible context strip:
- Chevron button: "What I know about your current view"
- Expanded: shows page name, filters, and KPI values injected into the AI
- Collapsed by default

Chat message area (scrollable, flex-grow):
- Renders `<ChatMessage />` for each message in history
- Auto-scrolls to bottom on new message
- Empty state: shows 4 `<SuggestedQuestions />` chips centred in the area

Input area (fixed bottom):
- Multi-line textarea (auto-grows up to 4 lines)
- Send button (primary blue, arrow icon)
- Enter sends, Shift+Enter = new line
- Disabled + spinner while waiting for API response
- Small disclaimer text: "Read-only · Gold schema only"

### `web/src/components/ai/ChatMessage.tsx`
Two variants based on `role`:

**User message:** right-aligned, primary blue background, white text, rounded-tl-xl corners.

**Assistant message:** left-aligned, white card with border, dark text.
Renders different content based on response type:
- `text`: markdown rendered with `react-markdown`
- `kpi_explanation`: renders `<KpiExplanation />` card
- `sql_result`: renders `<SqlResult />` component
- `error`: amber border card with warning icon + message

Always shows timestamp in small grey text below.

### `web/src/components/ai/SqlResult.tsx`
Receives: `sql`, `data`, `columns`, `narrative`.

Renders:
- Narrative paragraph at top (plain English answer)
- "View SQL" collapsible section — click to expand, shows SQL in a dark code block with syntax highlighting (use `react-syntax-highlighter` with a light theme)
- Result table: clean table component showing `columns` as headers and `data` rows
- Row count in small grey text: "Showing 12 rows"
- If data is empty: "No results found" message

### `web/src/components/ai/KpiExplanation.tsx`
Receives a `KpiDefinition` object.

Renders a structured card:
- KPI name in bold
- Formula in a monospace code block (light grey background)
- "Source:" label + table name as a badge
- Description paragraph
- Caveats in a small italic note (if present)

### `web/src/components/ai/SuggestedQuestions.tsx`
Receives: `suggestions: string[]` (4 items).

Renders 4 horizontal chips (full width, wrapping).
Each chip: grey border, rounded, hover state turns blue.
Clicking a chip fires it as a message immediately (calls the same send handler as the textarea).

When suggestions appear after an AI response, they render below the last assistant message as follow-up chips.

### Context injection in the frontend
When the user sends a message, `AISidebar.tsx` collects:
- `page`: current route name
- `filters`: from Zustand store
- `kpiValues`: passed as a prop from the dashboard page (each page passes its current KPI values down)

This means each dashboard page must pass its live KPI values to the layout, which passes them to `AISidebar`. Use a Zustand slice for this:
```typescript
setKpiValues: (values: Record<string, string>) => void
kpiValues: Record<string, string>
```
Each page calls `setKpiValues({ 'Total Cost': '$1,234.56', ... })` in a `useEffect` when KPI data loads.

---

## Done When

- [ ] `POST /api/v1/ai/chat` returns correct response types for all 3 question types
- [ ] KPI definition questions return a `kpi_explanation` response (no SQL executed)
- [ ] Data questions generate valid SQL, execute it, and return `sql_result`
- [ ] SQL validator correctly rejects INSERT/UPDATE/bronze schema references
- [ ] Invalid SQL returns `error` response type with human-readable reason
- [ ] Sidebar opens and closes with smooth CSS transition
- [ ] Main content area correctly shifts when sidebar opens
- [ ] Chat history renders correctly (user right, assistant left)
- [ ] `SqlResult` component shows narrative + collapsible SQL + result table
- [ ] `KpiExplanation` card renders formula + source + caveats
- [ ] Suggested questions chips appear and fire on click
- [ ] Context strip shows correct page + filter + KPI values
- [ ] Rate limit (20 req/min) returns 429 on excess requests
- [ ] No TypeScript errors
