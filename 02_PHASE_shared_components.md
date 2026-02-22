# Phase 2 — Shared Components, Filter Bar & Freshness Indicator

## Context
Read `00_MASTER_CONTEXT.md` fully before writing any code.
Phase 1 is complete. The monorepo runs in Docker, the API health endpoint works,
and the Next.js shell is in place.

---

## Goal
By the end of this phase every dashboard page has:
- A working global filter bar (date range + org + agent dropdowns)
- A freshness indicator showing real data from the API
- All shared chart and dashboard components built and ready to use
- The KpiCard and DataTable components fully functional with mock data

---

## What to Build

### 1. `web/src/components/layout/FilterBar.tsx`

A horizontal bar that sits inside the TopBar.
Contains:

**Date range picker:**
- Preset buttons: "7D" · "30D" · "90D" · "Custom"
- Custom mode shows two date inputs (from / to)
- Active preset is highlighted with primary blue
- On change: updates Zustand `from` and `to`
- Default: last 30 days

**Organisation dropdown:**
- Populated from `GET /api/v1/users/organisations` (add this endpoint to the API — simple `SELECT DISTINCT organization_id FROM gold.dim_users ORDER BY 1`)
- First option: "All Organisations"
- On change: updates Zustand `organizationId`

**Agent dropdown:**
- Populated from `GET /api/v1/agents/list` (add this endpoint — `SELECT agent_id, name FROM gold.dim_agents WHERE is_deleted = false ORDER BY name`)
- First option: "All Agents"
- On change: updates Zustand `agentId`

All three are controlled components wired to Zustand store.
On any change, all charts on the current page automatically re-fetch (React Query or SWR handles this via query key dependencies on filter values).

### 2. `web/src/components/layout/FreshnessBar.tsx`

Sits directly below the TopBar, above the KPI row. Full width. Subtle grey background.

**Normal state:**
- Clock icon (lucide-react) + "Data last updated: Today at 14:05"
- Small grey text colour, unobtrusive

**Stale state (is_stale = true for current page):**
- Warning triangle icon (amber) + "⚠️ Data may be outdated — last updated 26 hours ago"
- Amber text, slightly more prominent

**Hover interaction:**
- Hovering the bar opens a small Tailwind popover
- Popover shows a mini table: one row per source table for current page
- Columns: Table Name · Last Updated · Status (✅ or ⚠️)

**Wiring:**
- Calls `getFreshness()` from `lib/api.ts`
- Reads the correct page key from the current route
- Re-fetches every 5 minutes (use SWR with `refreshInterval: 300000`)

### 3. `web/src/components/dashboard/KpiCard.tsx`

Props:
```typescript
interface KpiCardProps {
  title: string
  value: string          // pre-formatted string e.g. "$1,234.56"
  previousValue?: string // pre-formatted, shown below as "vs $1,100.00"
  delta?: number         // percentage change e.g. 12.3 or -5.1
  deltaDirection?: 'up-good' | 'up-bad' | 'neutral'
  // up-good: positive delta = green arrow up
  // up-bad: positive delta = red arrow up (cost going up is bad)
  subtitle?: string      // e.g. "vs last period"
  isLoading?: boolean
}
```

Renders:
- White card, rounded-xl, shadow-sm, padding
- Title in small grey text at top
- Large value in bold dark text
- Delta arrow + percentage below (green/red based on direction)
- Previous value in small grey text
- Skeleton loading state when `isLoading` is true

### 4. `web/src/components/dashboard/KpiRow.tsx`

Takes an array of KpiCardProps and renders them in a responsive 4-column grid.
On mobile collapses to 2 columns.

### 5. `web/src/components/charts/useEChart.ts`

A React hook that:
- Takes a ref to a container div
- Initialises an ECharts instance on mount
- Sets up a ResizeObserver to call `chart.resize()` when the container size changes
- Calls `chart.setOption(options)` whenever `options` changes
- Disposes the chart instance on unmount
- Returns the chart instance (for advanced use cases like click event binding)

```typescript
function useEChart(
  ref: React.RefObject<HTMLDivElement>,
  options: EChartsOption,
  dependencies?: any[]
): echarts.ECharts | null
```

### 6. Chart components

Build all 8 chart components. Each one:
- Accepts `options: EChartsOption` as its primary prop
- Accepts `height?: string` (default `'300px'`)
- Accepts `isLoading?: boolean` (shows skeleton when true)
- Uses `useEChart` hook internally
- Has a container div with the specified height

Components to build:
- `LineChart.tsx`
- `BarChart.tsx`
- `StackedBarChart.tsx`
- `AreaChart.tsx`
- `DonutChart.tsx`
- `HeatmapChart.tsx`
- `FunnelChart.tsx`
- `BoxPlotChart.tsx`

### 7. `web/src/components/dashboard/ChartCard.tsx`

Wraps any chart component with:
- White card container, rounded-xl, shadow-sm
- Title in the top left
- Optional subtitle in small grey text
- Optional "Export" icon button top right (no-op in POC, just the icon)
- Loading state: shows pulsing skeleton for the chart area
- Empty state: centred text "No data for this period" with a small icon
- Children: the chart component

### 8. `web/src/components/dashboard/DataTable.tsx`

Generic sortable, paginated table component.

Props:
```typescript
interface DataTableProps<T> {
  columns: {
    key: keyof T
    header: string
    render?: (value: any, row: T) => React.ReactNode
    sortable?: boolean
    width?: string
  }[]
  data: T[]
  pageSize?: number        // default 25
  searchable?: boolean     // shows search input above table
  searchKeys?: (keyof T)[] // which columns to search
  exportFilename?: string  // if set, shows export CSV button
  isLoading?: boolean
  onRowClick?: (row: T) => void
}
```

Features:
- Click column header to sort (ascending/descending toggle)
- Search input filters rows client-side
- Pagination controls at bottom
- Export CSV button generates and downloads a CSV of all data (not just current page)
- Loading state shows skeleton rows
- Row click triggers `onRowClick` callback

### 9. `web/src/components/dashboard/SlideOver.tsx`

A right-side slide-over panel for drill-downs.

Props:
```typescript
interface SlideOverProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  width?: string  // default '480px'
}
```

Renders:
- Dark overlay behind the panel
- White panel slides in from right with CSS transition
- Title + subtitle at top with X close button
- Scrollable children area
- Clicking overlay closes the panel

### 10. `web/src/components/dashboard/StatusBadge.tsx`

Props:
```typescript
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending'
  label: string
}
```

Renders a small coloured pill:
- success → green bg, green text
- warning → amber bg, amber text
- error → red bg, red text
- info → blue bg, blue text
- pending → grey bg, grey text

### 11. Install SWR for data fetching

Add `swr` to `web/package.json`.
Create `web/src/lib/fetcher.ts` — a simple SWR fetcher that uses axios and handles errors.
All API calls in pages will use `useSWR(key, fetcher)` with query params as part of the key.

---

## Done When

- [ ] Filter bar renders in TopBar with working date presets
- [ ] Changing date preset updates Zustand store (verify in React DevTools or console)
- [ ] Freshness bar shows real data from `GET /api/v1/freshness`
- [ ] Freshness bar hover shows popover with per-table breakdown
- [ ] `KpiCard` renders correctly with and without delta, with loading skeleton
- [ ] `useEChart` hook initialises and resizes correctly (test by resizing the browser window)
- [ ] All 8 chart components render with sample ECharts options passed as props
- [ ] `DataTable` sorts, searches, paginates, and exports CSV with mock data
- [ ] `SlideOver` slides in and out smoothly
- [ ] No TypeScript errors
