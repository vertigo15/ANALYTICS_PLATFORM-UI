#!/usr/bin/env bash
# pull-secrets.sh — populate .env DB credentials from K8s / Azure Key Vault
# Usage: ./scripts/pull-secrets.sh          (pulls all three envs)
#        ./scripts/pull-secrets.sh dev       (dev only)
#        ./scripts/pull-secrets.sh stg       (stg only)
#        ./scripts/pull-secrets.sh prod      (prod only)

set -uo pipefail

ENV_FILE="$(dirname "$0")/../.env"
TARGET="${1:-all}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; }

# ── helpers ──────────────────────────────────────────────────────────────────
kv_get() {
  local vault="$1" key="$2"
  az keyvault secret show --vault-name "$vault" --name "$key" --query value -o tsv 2>/dev/null
}

k8s_configmap_get() {
  local ctx="$1" ns="$2" cm="$3" key="$4"
  kubectl --context "$ctx" get configmap "$cm" -n "$ns" \
    -o jsonpath="{.data.$key}" 2>/dev/null
}

k8s_secret_get() {
  local ctx="$1" ns="$2" secret="$3" key="$4"
  kubectl --context "$ctx" get secret "$secret" -n "$ns" \
    -o jsonpath="{.data.$key}" 2>/dev/null | base64 -d 2>/dev/null
}

set_env() {
  local prefix="$1" key="$2" value="$3"
  local full_key="${prefix}_${key}"
  if [ -z "$value" ]; then return; fi
  if grep -q "^${full_key}=" "$ENV_FILE"; then
    sed -i '' "s|^${full_key}=.*|${full_key}=${value}|" "$ENV_FILE"
  else
    echo "${full_key}=${value}" >> "$ENV_FILE"
  fi
}

# ── DEV — reads from dev-jeen-aks K8s + jeen-api-kv-dev ─────────────────────
pull_dev() {
  echo "── DEV ──────────────────────────────────────────────────"
  local ctx="dev-jeen-aks" ns="jeen-dev"
  local cm="dev-base-ms-analytics-base-ms-config"
  local kv="jeen-api-kv-dev"

  host=$(k8s_configmap_get "$ctx" "$ns" "$cm" "PG_HOST")
  port=$(k8s_configmap_get "$ctx" "$ns" "$cm" "PG_PORT")
  name=$(k8s_configmap_get "$ctx" "$ns" "$cm" "PG_NAME")
  user=$(k8s_configmap_get "$ctx" "$ns" "$cm" "PG_USER")
  pass=$(kv_get "$kv" "PG-PASSWORD")

  if [ -n "$host" ]; then
    set_env "DEV" "DB_HOST" "$host"
    set_env "DEV" "DB_PORT" "${port:-5432}"
    set_env "DEV" "DB_NAME" "${name:-analytics_db}"
    set_env "DEV" "DB_USER" "$user"
    set_env "DEV" "DB_SSLMODE" "require"
    [ -n "$pass" ] && set_env "DEV" "DB_PASSWORD" "$pass"
    info "DEV  host=${host}  user=${user}  pass=$([ -n "$pass" ] && echo "***set***" || echo "NOT FOUND")"
  else
    error "DEV K8s unreachable — check kubectl context dev-jeen-aks"
  fi
}

# ── STG — reads from jeen-api-kv-stg ─────────────────────────────────────────
pull_stg() {
  echo "── STG ──────────────────────────────────────────────────"
  local kv="jeen-api-kv-stg"

  host=$(kv_get "$kv" "PG-HOST")
  port=$(kv_get "$kv" "PG-PORT")
  name=$(kv_get "$kv" "PG-DB")
  user=$(kv_get "$kv" "PG-USER")
  pass=$(kv_get "$kv" "PG-PASSWORD")

  if [ -n "$host" ]; then
    set_env "STG" "DB_HOST" "$host"
    set_env "STG" "DB_PORT" "${port:-5432}"
    set_env "STG" "DB_NAME" "${name:-analytics_db}"
    set_env "STG" "DB_USER" "$user"
    set_env "STG" "DB_PASSWORD" "$pass"
    set_env "STG" "DB_SSLMODE" "require"
    info "STG  host=${host}  user=${user}  pass=***set***"
  else
    warn "STG Key Vault ${kv} not accessible."
    warn "Request 'Key Vault Secrets User' role on ${kv} for your Azure identity:"
    warn "  az role assignment create \\"
    warn "    --role 'Key Vault Secrets User' \\"
    warn "    --assignee \$(az ad signed-in-user show --query id -o tsv) \\"
    warn "    --scope \$(az keyvault show --name ${kv} --query id -o tsv)"
  fi
}

# ── PROD — reads from jeen-kv-aks-prod ───────────────────────────────────────
pull_prod() {
  echo "── PROD ─────────────────────────────────────────────────"
  local kv="jeen-kv-aks-prod"

  host=$(kv_get "$kv" "PG-HOST")
  port=$(kv_get "$kv" "PG-PORT")
  name=$(kv_get "$kv" "PG-DB")
  user=$(kv_get "$kv" "PG-USER")
  pass=$(kv_get "$kv" "PG-PASSWORD")

  if [ -n "$host" ]; then
    set_env "PROD" "DB_HOST" "$host"
    set_env "PROD" "DB_PORT" "${port:-5432}"
    set_env "PROD" "DB_NAME" "${name:-analytics_db}"
    set_env "PROD" "DB_USER" "$user"
    set_env "PROD" "DB_PASSWORD" "$pass"
    set_env "PROD" "DB_SSLMODE" "require"
    info "PROD host=${host}  user=${user}  pass=***set***"
  else
    warn "PROD Key Vault ${kv} not accessible."
    warn "Request 'Key Vault Secrets User' role on ${kv} for your Azure identity:"
    warn "  az role assignment create \\"
    warn "    --role 'Key Vault Secrets User' \\"
    warn "    --assignee \$(az ad signed-in-user show --query id -o tsv) \\"
    warn "    --scope \$(az keyvault show --name ${kv} --query id -o tsv)"
  fi
}

# ── run ───────────────────────────────────────────────────────────────────────
echo "Pulling DB secrets → ${ENV_FILE}"
echo ""
case "$TARGET" in
  dev)  pull_dev ;;
  stg)  pull_stg ;;
  prod) pull_prod ;;
  all)  pull_dev; echo ""; pull_stg; echo ""; pull_prod ;;
  *)    error "Unknown target: $TARGET. Use dev | stg | prod | all" ;;
esac
echo ""
echo "Done. Run 'make health' after switching to verify the connection."
