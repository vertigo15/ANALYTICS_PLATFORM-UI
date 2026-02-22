# How to Use These Files with Warp

## What You Have

```
00_MASTER_CONTEXT.md      ← The bible. Full stack, schema, API, design system.
01_PHASE_scaffold.md      ← Phase 1: monorepo + Docker + API skeleton + Next.js shell
02_PHASE_shared_components.md ← Phase 2: filter bar, freshness, charts, table, slide-over
03_PHASE_cost_dashboard.md    ← Phase 3: Cost & Tokens page (full, end-to-end)
04_PHASE_agents_dashboard.md  ← Phase 4: Agent Performance page
05_PHASE_remaining_dashboards.md ← Phase 5: Users + Documents + Operations pages
06_PHASE_ai_chat.md           ← Phase 6: AI sidebar (Azure OpenAI + text-to-SQL)
07_PHASE_polish.md            ← Phase 7: skeletons, errors, empty states, production Docker
```

---

## The Rule

**Every Warp session starts with two file pastes:**
1. `00_MASTER_CONTEXT.md` — always, every session
2. The phase file for what you are building today

Nothing else. Claude will have full context to work without guessing.

---

## Session Startup Template

Copy and paste this at the start of every Warp session:

```
I am building the Jeen Analytics Dashboard — a monorepo with a Fastify API
and a Next.js frontend, both running in Docker. TypeScript + Tailwind CSS.

Here is the full project context:

[PASTE CONTENTS OF 00_MASTER_CONTEXT.md HERE]

---

Here is what I need to build in this session:

[PASTE CONTENTS OF THE CURRENT PHASE FILE HERE]

---

Rules:
- Do not deviate from the file structure defined in 00_MASTER_CONTEXT.md
- Do not use any tables, columns or schemas not listed in 00_MASTER_CONTEXT.md
- Do not hardcode credentials — always read from process.env
- TypeScript strict mode — no any types
- Write complete, working code — no placeholders or TODOs
- When done, confirm by listing which Done When checkboxes are complete
```

---

## Phase Order

Do these in order. Do not skip ahead.
Each phase depends on the one before it.

| Phase | File | Estimated Sessions |
|-------|------|--------------------|
| 1 | `01_PHASE_scaffold.md` | 1 session |
| 2 | `02_PHASE_shared_components.md` | 1–2 sessions |
| 3 | `03_PHASE_cost_dashboard.md` | 1–2 sessions |
| 4 | `04_PHASE_agents_dashboard.md` | 1 session |
| 5 | `05_PHASE_remaining_dashboards.md` | 2 sessions |
| 6 | `06_PHASE_ai_chat.md` | 1–2 sessions |
| 7 | `07_PHASE_polish.md` | 1 session |

---

## When Claude Goes Off Track

If Claude starts inventing table names, column names, or file paths:

```
Stop. Refer back to 00_MASTER_CONTEXT.md.
Use only the table names, column names, and file paths defined there.
Do not invent anything not listed in that file.
```

If Claude starts a phase before completing the previous one:

```
We are still on Phase [N]. Do not start Phase [N+1].
Complete the Done When checklist for Phase [N] first.
```

If Claude writes JavaScript instead of TypeScript:

```
This project uses TypeScript strict mode throughout.
Convert this to TypeScript with proper types. No any types.
```

---

## Verifying Each Phase

After each phase, run through the "Done When" checklist in the phase file.
Use these commands to verify:

```bash
# Check TypeScript compiles
cd api && npx tsc --noEmit
cd web && npx tsc --noEmit

# Start everything
docker compose up --build

# Test API health
curl http://localhost:3001/api/v1/health

# Test freshness endpoint
curl http://localhost:3001/api/v1/freshness

# Open the app
open http://localhost:3000
```

Do not move to the next phase until all checkboxes pass.

---

## If You Need to Resume Mid-Phase

If a session ends before the phase is complete, start the next session with:

```
I am resuming Phase [N] of the Jeen Analytics Dashboard.

[PASTE 00_MASTER_CONTEXT.md]

[PASTE PHASE FILE]

I have already completed:
- [list what is done]

I still need to complete:
- [list what remains from the Done When checklist]

Continue from where we left off.
```

---

## The Analytics DB Connection

The dashboard API connects to the analytics database as `bi_readonly`.
The `bi_readonly` role can only read from `gold.*`.
It cannot see bronze, silver, or control schemas.
All credentials come from the `.env` file.

The analytics database was set up separately using `analytics_db_ddl.sql`
and the `jeen-analytics` pipeline repo.
The dashboard repo does not manage the database — it only reads from it.
