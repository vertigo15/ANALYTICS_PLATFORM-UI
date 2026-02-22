# Jeen Analytics Dashboard

Production analytics dashboard for the Jeen platform. Built as a monorepo with a Fastify API and Next.js frontend, both running in Docker.

## Project Structure

```
jeen-dashboard/
├── .env                      # All secrets (not committed)
├── .env.example              # Template for environment variables
├── .gitignore
├── docker-compose.yml        # Runs both api + web
├── README.md
│
├── api/                      # Fastify analytics API
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # Server entry point
│       ├── db.ts             # PostgreSQL connection pool
│       ├── routes/
│       │   ├── health.ts     # GET /api/v1/health
│       │   └── freshness.ts  # GET /api/v1/freshness
│       └── types/
│           └── index.ts      # Shared API types
│
└── web/                      # Next.js 14 dashboard
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx           # Root layout
        │   ├── page.tsx             # Redirects to /dashboard/cost
        │   └── dashboard/
        │       ├── layout.tsx       # Dashboard shell
        │       └── cost/page.tsx    # Cost page placeholder
        ├── components/
        │   ├── layout/
        │   │   ├── Sidebar.tsx      # Left navigation
        │   │   └── TopBar.tsx       # Top bar with AI toggle
        │   └── ai/
        │       └── AISidebar.tsx    # AI assistant placeholder
        ├── lib/
        │   ├── api.ts               # Typed API client
        │   ├── formatters.ts        # Number/date formatters
        │   └── constants.ts         # App constants
        └── store/
            └── filters.ts           # Zustand global state
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, ECharts, Zustand
- **Backend**: Fastify 4, TypeScript, PostgreSQL (pg), node-cache
- **Container**: Docker + docker-compose
- **AI**: Azure OpenAI (for Phase 6)

## Setup

1. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Start services with Docker**:
   ```bash
   docker-compose up --build
   ```

3. **Access the dashboard**:
   - Web: http://localhost:3000
   - API: http://localhost:3001

## Development

### API (Fastify)
```bash
cd api
npm install
npm run dev        # Development with hot reload
npm run build      # Build TypeScript
npm run typecheck  # Type checking
```

### Web (Next.js)
```bash
cd web
npm install
npm run dev        # Development server
npm run build      # Production build
npm run typecheck  # Type checking
```

## API Endpoints

### GET /api/v1/health
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-02-21T11:00:00.000Z"
}
```

### GET /api/v1/freshness
Data freshness status for all dashboard pages.

**Response**:
```json
{
  "data": {
    "cost": {
      "last_updated": "2026-02-21T14:05:00Z",
      "is_stale": false,
      "tables": [...]
    },
    "agents": { ... },
    "users": { ... },
    "documents": { ... },
    "operations": { ... }
  },
  "meta": {
    "generated_at": "2026-02-21T14:10:00Z",
    "cached": false
  }
}
```

## Phase 1 Status ✅

- [x] Monorepo structure created
- [x] Docker setup with docker-compose
- [x] API with health and freshness endpoints
- [x] Next.js app with dashboard layout
- [x] Sidebar navigation with 5 pages
- [x] AI assistant toggle (placeholder)
- [x] TypeScript strict mode (no errors)
- [x] .env configuration
- [x] .gitignore configured

## Next Steps

- **Phase 2**: Filter bar and freshness integration
- **Phase 3**: Cost & Tokens page implementation
- **Phase 4**: Agent Performance page
- **Phase 5**: Users, Documents, Operations pages
- **Phase 6**: AI chat sidebar with text-to-SQL

## Rules

- API is read-only (SELECT only, bi_readonly role)
- All secrets in .env (never hardcoded)
- TypeScript strict mode (no `any` types)
- Query timeout: 10 seconds
- Cache TTL: 55 minutes (freshness: 5 minutes)
- Gold schema only (no bronze/silver access)
