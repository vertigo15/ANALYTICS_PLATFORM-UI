# Phase 7 — Polish, Error States, Loading Skeletons & Production Docker

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phases 1–6 are complete. All features work.
This phase makes the POC production-ready in appearance and reliability.

---

## Goal
Every page handles loading, errors, and empty states gracefully.
The app looks finished. Docker is production-ready.
No raw error messages ever reach the user.

---

## 1. Loading Skeletons

Every data-dependent component must show a skeleton while loading.
Use Tailwind's `animate-pulse` class on grey placeholder shapes.

### KpiCard skeleton
When `isLoading` is true:
- Title: grey bar 60% width, height 12px
- Value: grey bar 80% width, height 28px
- Delta: grey bar 40% width, height 12px

### ChartCard skeleton
When `isLoading` is true:
- Title: grey bar 40% width
- Chart area: solid grey rectangle, full width, chart height

### DataTable skeleton
When `isLoading` is true:
- Header row: renders normally (column names visible)
- 8 skeleton rows: each cell is a grey bar of random width (50–90%)

### AISidebar message skeleton
While waiting for API response:
- Shows a typing indicator: 3 animated grey dots (CSS keyframe animation)
- Sits in an assistant message bubble position

---

## 2. Error States

### API error handling (`api/src/index.ts`)
Add a global Fastify error handler:
- Log the full error server-side
- Return a clean JSON error: `{ error: 'Something went wrong', code: 'INTERNAL_ERROR', requestId: uuid }`
- Never expose stack traces or SQL to the client
- 404 handler: `{ error: 'Not found', code: 'NOT_FOUND' }`
- Timeout handler (when DB query > 10s): `{ error: 'Query timed out', code: 'TIMEOUT' }`

### Frontend error boundary
Create `web/src/components/ErrorBoundary.tsx`:
- Catches render errors in chart components
- Shows a simple card: "This chart couldn't load. Try refreshing."
- Wrap every `<ChartCard />` in `<ErrorBoundary />`

### SWR error handling
When any SWR call fails:
- Show an inline error state inside the ChartCard instead of the chart
- Error card: red border, warning icon, "Failed to load data · Retry" (retry button calls `mutate()`)
- KpiCards show "—" as value with a small error indicator

### Network offline state
Add a `useOnlineStatus` hook that watches `navigator.onLine`.
When offline: show a banner at the top of the page — "You are offline. Data may be stale."
Banner auto-dismisses when connection returns.

---

## 3. Empty States

### No data for period
When an API returns empty arrays:
- ChartCard shows: small grey icon + "No data for this period"
- DataTable shows: full-width row with "No results found"
- KpiCards show: "0" or "—" depending on the metric type

### First run (no data at all)
If the pipeline hasn't run yet (all watermarks are null):
- Freshness bar shows: "Pipeline hasn't run yet — no data available"
- All KpiCards show "—"
- Charts show empty state

---

## 4. Responsive Layout

The dashboard must work on laptop screens (1280px+) and degrade gracefully at 1024px.
Mobile is not required.

At 1024px:
- Two-column chart rows collapse to single column
- DataTable allows horizontal scroll
- AI sidebar overlays content (doesn't push) on screens < 1280px

Use Tailwind's `lg:` breakpoint prefix throughout.
Test at 1280px and 1440px widths.

---

## 5. Performance

### Image optimisation
Not applicable — no images in this project.

### ECharts bundle size
Import ECharts components individually rather than the full bundle:
```typescript
// Instead of: import * as echarts from 'echarts'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
```
Update `useEChart.ts` and all chart components to use tree-shaken imports.

### API connection pooling
In `api/src/db.ts`, configure pool with:
- `max: 10` connections
- `idleTimeoutMillis: 30000`
- `connectionTimeoutMillis: 5000`

Add a graceful shutdown handler that calls `pool.end()` on SIGTERM.

---

## 6. Production Docker

### `api/Dockerfile` — production optimised
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### `web/Dockerfile` — production optimised
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### `docker-compose.yml` — add healthchecks
```yaml
api:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s

web:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 15s
  depends_on:
    api:
      condition: service_healthy
```

---

## 7. Final README

Create `README.md` at repo root covering:

### Quick Start
```bash
git clone <repo>
cd jeen-dashboard
cp .env.example .env
# fill in .env values
docker compose up --build
# open http://localhost:3000
```

### Environment Variables
Table of all variables with descriptions and example values.

### Development (without Docker)
```bash
# API
cd api && npm install && npm run dev   # runs on :3001

# Web
cd web && npm install && npm run dev   # runs on :3000
```

### Project Structure
Brief description of each folder.

### Adding a New Dashboard Page
Step-by-step: create API route → add to `routes/` → create page in `app/dashboard/` → add nav item to Sidebar → add freshness mapping.

### AI Chat — How It Works
Brief explanation of context injection, SQL validation, and the two-call pattern.

---

## Done When

- [ ] All charts show loading skeletons (not blank) while data loads
- [ ] All SWR errors show inline retry cards
- [ ] Empty period returns "No data" state, not broken charts
- [ ] `ErrorBoundary` catches render errors and shows fallback
- [ ] Offline banner appears when network is disconnected (test by disabling network in DevTools)
- [ ] Responsive layout tested at 1024px and 1440px — no overflow issues
- [ ] ECharts uses tree-shaken imports — verify bundle size is smaller
- [ ] `docker compose up --build` produces production builds (check `NODE_ENV=production`)
- [ ] Healthchecks pass — `docker compose ps` shows all services as "healthy"
- [ ] `docker compose up` (without `--build`) starts immediately on second run
- [ ] README covers quick start, env vars, and local dev
- [ ] `tsc --noEmit` passes in both `api/` and `web/` with zero errors
- [ ] No `console.error` visible in browser console on a normal page load
