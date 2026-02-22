# Phase 1 — Monorepo Scaffold, Docker & API Skeleton

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
This is Phase 1 of building the Jeen Analytics Dashboard.
Start from a completely empty directory called `jeen-dashboard/`.

---

## Goal
By the end of this phase:
- Monorepo exists with `api/` and `web/` packages
- Both run in Docker via a single `docker-compose.yml`
- API has one working endpoint: `GET /api/v1/health` and `GET /api/v1/freshness`
- Next.js app starts and shows a placeholder page
- Root `.env` drives all configuration — nothing hardcoded

---

## What to Build

### 1. Root level
Create these files at the repo root:
- `.env` (from the template in `00_MASTER_CONTEXT.md` — use placeholder values)
- `.env.example` (same structure, all values replaced with descriptions)
- `.gitignore` (node_modules, .env, dist, .next, coverage)
- `docker-compose.yml` (see spec below)

### 2. `api/` — Fastify TypeScript service

**Package setup:**
- Fastify 4, `@fastify/cors`, `pg`, `node-cache`, `dotenv`
- TypeScript with strict mode
- `tsx` for development, `tsc` for build

**`api/src/index.ts`** — server entry point:
- Reads `API_PORT` and `API_HOST` from env
- Registers CORS (allow all origins for POC)
- Registers all route files
- Starts listening

**`api/src/db.ts`** — postgres connection pool:
- Creates a `pg.Pool` using `ANALYTICS_DB_*` env vars
- SSL required (`sslmode: require`)
- Exports a `query(sql, params)` helper that enforces 10 second timeout
- Exports a `queryWithCache(key, ttl, sql, params)` helper that checks node-cache first

**`api/src/routes/freshness.ts`** — GET /api/v1/freshness:
- Queries `control.watermarks` for `source_table`, `last_run_at`, `last_watermark`
- Groups results by page (use the page→table mapping from `00_MASTER_CONTEXT.md`)
- For each page, computes `is_stale: boolean` (true if any table's `last_run_at` > 24h ago)
- Returns:
```json
{
  "data": {
    "cost":       { "last_updated": "2026-02-21T14:05:00Z", "is_stale": false, "tables": [...] },
    "agents":     { "last_updated": "2026-02-21T14:05:00Z", "is_stale": false, "tables": [...] },
    "users":      { "last_updated": "2026-02-21T14:05:00Z", "is_stale": false, "tables": [...] },
    "documents":  { "last_updated": "2026-02-21T14:05:00Z", "is_stale": false, "tables": [...] },
    "operations": { "last_updated": "2026-02-21T14:05:00Z", "is_stale": false, "tables": [...] }
  },
  "meta": { "generated_at": "...", "cached": false }
}
```
- Cache TTL: 5 minutes

**`api/src/routes/health.ts`** — GET /api/v1/health:
- Runs `SELECT 1` against the DB to confirm connectivity
- Returns `{ status: "ok", db: "connected", timestamp: "..." }`

### 3. `web/` — Next.js 14 app

**Setup:**
- Next.js 14 with App Router
- TypeScript strict
- Tailwind CSS
- `echarts` + `echarts-for-react`
- `zustand`
- `axios` (for API calls)

**`web/src/app/layout.tsx`** — root layout:
- Sets `<html lang="en">`
- Imports global Tailwind styles
- Wraps children with a Zustand provider wrapper

**`web/src/app/page.tsx`** — root redirect:
- Immediately redirects to `/dashboard/cost`

**`web/src/app/dashboard/layout.tsx`** — dashboard shell:
- Renders `<Sidebar />` on the left (fixed, dark)
- Renders `<TopBar />` at the top
- Renders `<AISidebar />` on the right (hidden by default)
- Renders `{children}` in the main content area
- Main content area has correct margin to account for sidebar and AI panel widths

**`web/src/app/dashboard/cost/page.tsx`** — placeholder:
- Just renders `<h1>Cost & Tokens</h1>` for now
- Will be filled in Phase 3

**`web/src/components/layout/Sidebar.tsx`**:
- Dark background (`#1E293B`)
- Jeen logo placeholder at top
- 5 nav items with icons (use lucide-react): Cost & Tokens, Agent Performance, User Activity, Document Health, Platform Operations
- Active state highlighted in primary blue
- "Last updated" text at bottom (hardcoded "–" for now, wired in Phase 2)

**`web/src/components/layout/TopBar.tsx`**:
- Page title on left (passed as prop or read from route)
- AI chat toggle button on right (chat bubble icon from lucide-react)
- Placeholder for filter bar (empty div for now)

**`web/src/components/ai/AISidebar.tsx`**:
- Placeholder component — renders a 380px right panel with "AI Assistant coming in Phase 6" text
- Controlled by a `isOpen` boolean from Zustand store
- Slides in/out with CSS transition

**`web/src/store/filters.ts`** — Zustand store:
```typescript
interface FiltersState {
  from: string        // ISO date string
  to: string          // ISO date string
  organizationId: string | null
  agentId: string | null
  isAISidebarOpen: boolean
  setDateRange: (from: string, to: string) => void
  setOrganizationId: (id: string | null) => void
  setAgentId: (id: string | null) => void
  toggleAISidebar: () => void
}
```
Default date range: last 30 days

**`web/src/lib/api.ts`**:
- Base URL from `NEXT_PUBLIC_API_URL` env var
- Single `apiFetch<T>(path, params)` helper using axios
- Typed function `getFreshness(): Promise<FreshnessResponse>`
- All functions return typed responses matching the API output

**`web/src/lib/formatters.ts`**:
- `formatCost(usd: number): string` → "$1,234.56"
- `formatTokens(n: number): string` → "1.2M" or "456K"
- `formatPercent(n: number): string` → "74.3%"
- `formatDate(iso: string): string` → "Feb 21, 2026"
- `formatDateShort(iso: string): string` → "Feb 21"
- `formatRelativeTime(iso: string): string` → "47 minutes ago"

### 4. `docker-compose.yml`

Two services:
- `api` — builds from `./api`, port `3001:3001`, env_file `.env`, depends on nothing (DB is external Azure)
- `web` — builds from `./web`, port `3000:3000`, env_file `.env`, depends on `api`

Both use `restart: unless-stopped`.

### 5. Dockerfiles

**`api/Dockerfile`**:
- `node:20-alpine` base
- Install deps, build TypeScript, run compiled output
- Expose 3001

**`web/Dockerfile`**:
- `node:20-alpine` base
- Build Next.js production build
- Expose 3000
- Use Next.js standalone output (`output: 'standalone'` in next.config.ts)

---

## Done When

- [ ] `docker-compose up --build` starts both services without errors
- [ ] `curl http://localhost:3001/api/v1/health` returns `{ "status": "ok", "db": "connected" }`
- [ ] `curl http://localhost:3001/api/v1/freshness` returns freshness data for all 5 pages
- [ ] `http://localhost:3000` redirects to `http://localhost:3000/dashboard/cost`
- [ ] Dashboard page shows sidebar with 5 nav items and top bar
- [ ] AI sidebar toggle button exists in top bar — clicking it opens/closes the right panel
- [ ] No TypeScript errors (`tsc --noEmit` passes in both `api/` and `web/`)
- [ ] `.env` is in `.gitignore` and not committed
