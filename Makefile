# Jeen Analytics Dashboard — environment switcher
# First time or after code changes: make dev / stg / prod  (builds + starts)
# Switching env only:               make switch-dev/stg/prod (restarts API, no rebuild)

.PHONY: dev stg prod switch-dev switch-stg switch-prod \
        down logs logs-api logs-web ps health

# ── First run / after code changes (build + start) ───────────────────────────
dev:
	@echo "Building and starting DEV..."
	docker compose --env-file .env.dev up --build -d
	@echo "  http://localhost:3000  [DEV]"

stg:
	@echo "Building and starting STAGING..."
	docker compose --env-file .env.stg up --build -d
	@echo "  http://localhost:3000  [STG]"

prod:
	@echo "Building and starting PRODUCTION..."
	docker compose --env-file .env.prod up --build -d
	@echo "  http://localhost:3000  [PROD]"

# ── Fast env switch (restarts only, no image rebuild) ────────────────────────
# The web image is reused; only the API restarts with the new DB credentials.
# The env badge in the UI updates automatically from the health endpoint.
switch-dev:
	@echo "Switching to DEV (no rebuild)..."
	docker compose --env-file .env.dev up -d
	@echo "  http://localhost:3000  [DEV]"

switch-stg:
	@echo "Switching to STAGING (no rebuild)..."
	docker compose --env-file .env.stg up -d
	@echo "  http://localhost:3000  [STG]"

switch-prod:
	@echo "Switching to PRODUCTION (no rebuild)..."
	docker compose --env-file .env.prod up -d
	@echo "  http://localhost:3000  [PROD]"

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
