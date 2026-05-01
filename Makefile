# Jeen Analytics Dashboard
# Single .env file holds all DB credentials.
# APP_ENV selects which set to use at runtime — no rebuild needed to switch.
#
# First run / after code changes:
#   make dev | stg | prod          (builds + starts)
#
# Switch DB source only (seconds, no rebuild):
#   make switch-dev | switch-stg | switch-prod

.PHONY: dev stg prod switch-dev switch-stg switch-prod \
        down logs logs-api logs-web ps health

# ── First run / after code changes (build + start) ───────────────────────────
dev:
	@echo "Building and starting (DEV DB)..."
	APP_ENV=dev docker compose --env-file .env up --build -d
	@echo "  http://localhost:3000  [DEV]"

stg:
	@echo "Building and starting (STG DB)..."
	APP_ENV=stg docker compose --env-file .env up --build -d
	@echo "  http://localhost:3000  [STG]"

prod:
	@echo "Building and starting (PROD DB)..."
	APP_ENV=prod docker compose --env-file .env up --build -d
	@echo "  http://localhost:3000  [PROD]"

# ── Fast env switch — restarts API only, no image rebuild (~5s) ──────────────
switch-dev:
	@echo "Switching to DEV DB (no rebuild)..."
	APP_ENV=dev docker compose --env-file .env up -d
	@echo "  http://localhost:3000  [DEV]"

switch-stg:
	@echo "Switching to STG DB (no rebuild)..."
	APP_ENV=stg docker compose --env-file .env up -d
	@echo "  http://localhost:3000  [STG]"

switch-prod:
	@echo "Switching to PROD DB (no rebuild)..."
	APP_ENV=prod docker compose --env-file .env up -d
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
