# Jeen Analytics Dashboard — environment switcher
# Usage: make dev | make stg | make prod

.PHONY: dev stg prod down restart logs ps build-dev build-stg build-prod

# ── Start environments ────────────────────────────────────────────────────────
dev:
	@echo "Starting DEV environment..."
	docker compose --env-file .env.dev up --build -d
	@echo "Dashboard: http://localhost:3000  (dev DB)"

stg:
	@echo "Starting STAGING environment..."
	docker compose --env-file .env.stg up --build -d
	@echo "Dashboard: http://localhost:3000  (stg DB)"

prod:
	@echo "Starting PRODUCTION environment..."
	docker compose --env-file .env.prod up --build -d
	@echo "Dashboard: http://localhost:3000  (prod DB)"

# ── Restart without rebuild (faster, same env) ───────────────────────────────
restart-dev:
	docker compose --env-file .env.dev up -d

restart-stg:
	docker compose --env-file .env.stg up -d

restart-prod:
	docker compose --env-file .env.prod up -d

# ── Build only (no start) ─────────────────────────────────────────────────────
build-dev:
	docker compose --env-file .env.dev build

build-stg:
	docker compose --env-file .env.stg build

build-prod:
	docker compose --env-file .env.prod build

# ── Utilities ─────────────────────────────────────────────────────────────────
down:
	docker compose down

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

ps:
	docker compose ps

health:
	@curl -sf http://localhost:3001/api/v1/health | python3 -m json.tool
