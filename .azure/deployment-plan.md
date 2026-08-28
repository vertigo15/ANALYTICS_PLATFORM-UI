# Azure Deployment Plan

> **Status:** Deployed

Generated: 2026-08-26T10:40:00+03:00

## 1. Project Overview

**Goal:** Deploy corrected dashboard presentation, environment-wide data-source
switching, and read-only document wait analysis to the existing development
application without changing warehouse data.

**Path:** Modify existing deployment. No new Azure resources are planned.

## 2. Requirements and Azure Context

| Attribute | Value |
|---|---|
| Classification | Development |
| Scale | Medium |
| Budget | Balanced; preserve existing SKUs and replica limits |
| Subscription | `Jeen Subscription` (`c4289eb9-2fb6-48b7-9a75-1251ebba3992`) |
| Location | West Europe (`westeurope`) |
| Resource group | `jeen-rg-dev-weu` |
| Container Apps Environment | `jeen-analytics-env` |
| Application registry | `jeendevregistry.azurecr.io` |

The user confirmed deployment to the existing Analytics Platform application.
All Azure CLI commands will pass the subscription explicitly because the
currently selected CLI default is a different subscription.

## 3. Components Detected

| Component | Type | Technology | Path / Existing Target |
|---|---|---|---|
| Analytics API | API | Fastify, TypeScript, Node 20 | `api/` → `jeen-analytics-api` |
| Analytics web | Frontend | Next.js 14, TypeScript, Node 20 | `web/` → `jeen-analytics-web` |
| Infrastructure | IaC | Bicep | `azure/container-apps.bicep` |

Current application images use tag `4fb2808`.

## 4. Recipe Selection

**Selected:** AZCLI with existing Bicep validation.

**Rationale:**

- The project already has Azure CLI deployment scripts and Bicep.
- This is a code-only update to existing Container Apps.
- Immutable ACR builds plus image-only Container App updates avoid replacing
  resources or rewriting live secrets.

The destructive `azure/deploy-simple.ps1` path will not be used.

## 5. Architecture and Planned Changes

| Component | Existing Azure Service | Planned Change |
|---|---|---|
| API | Azure Container Apps | Build immutable image and update existing app |
| Web | Azure Container Apps | Build with deployed API FQDN, then update existing app |
| Application images | Azure Container Registry | Add immutable API/web tags |
| PostgreSQL | Existing Azure Database for PostgreSQL | Read-only `SELECT` queries only; no data or schema changes |

Application scope:

- Correct API KPI SQL, date bounds, organisation filters, DTOs, and AI metric definitions.
- Correct web KPI cards, labels, tooltips, and freshness display.
- Add read-only document upload load and processing performance analysis.
- Reset and isolate the complete dashboard cache whenever DEV/STG/PROD changes,
  send the selected environment on AI requests, and show connection health.
- Add true upload-to-embedding end-to-end latency and document-level average,
  median, p95, success, failure, and pending counts for every processing stage.
- Preserve `jeen-dev-db-weu.postgres.database.azure.com` in live configuration and IaC.
- Rebuild the web bundle with
  `NEXT_PUBLIC_API_URL=https://jeen-analytics-api.victoriousdesert-e48a62c2.westeurope.azurecontainerapps.io`.
- Do not change dbt, Airflow, watermarks, warehouse rows, schemas, or source data.

## 6. Provisioning Limit Checklist

No resources are being provisioned; existing resources are updated in place.

| Resource Type | Number to Deploy | Current / Total After | Limit / Quota | Evidence |
|---|---:|---:|---:|---|
| `Microsoft.App/managedEnvironments` | 0 | 13 / 13 | 50 | `az quota` in West Europe on 2026-08-26 |
| `Microsoft.App/containerApps` | 0 | unchanged | Not consumed by this code-only update | Existing apps verified `Succeeded` |
| `Microsoft.ContainerRegistry/registries` | 0 | unchanged | Not consumed by adding image tags | Existing registries verified |

**Status:** All planned resource additions are zero; no quota increase is required.

## 7. Execution Checklist

### Planning

- [x] Analyze workspace and deployment topology
- [x] Scan application components
- [x] Select the AZCLI recipe
- [x] Verify target resources and current image versions
- [x] Check relevant Container Apps quota
- [x] User confirms subscription and location
- [x] User approves this deployment plan

### Preparation

- [x] Complete API and web corrections
- [x] Ensure the web image build receives `NEXT_PUBLIC_API_URL`
- [x] Set plan status to `Ready for Validation`

### Validation

- [x] API typecheck and build pass
- [x] Web typecheck and production build pass
- [x] Bicep compiles
- [x] Bicep what-if or equivalent non-destructive preflight passes
- [x] Existing dev secret reference is preserved; environment credentials are
  copied from their existing Key Vaults without printing or persisting values
- [x] Populate Validation Proof and set status to `Validated`

### Deployment

- [x] Build and push immutable API and web image tags
- [x] Update existing Container Apps and wait for healthy revisions
- [x] Verify live health, freshness, document, cost, user, agent, and operations KPIs
- [x] Record rollback image/revision names and set status to `Deployed`

## 8. Validation Proof

Validated on 2026-08-26, completed at 2026-08-26T12:12:23Z.

Follow-up review fixes were revalidated at 2026-08-26T19:35:25Z:

- API and web typechecks and production builds passed.
- ACR no-push container builds `cbu6` (API) and `cbu7` (web) passed.
- Bicep lint/build passed with the same two non-blocking warnings.
- ARM group validation returned `Succeeded`.
- ARM what-if returned `Succeeded` with only the existing API and web
  Container Apps marked `Deploy`; no resources were created or deleted.
- The target subscription, resource group, registry, running apps, location,
  and credential-based registry configuration remain unchanged.

Dashboard wait analysis and environment switching were validated on
2026-08-27:

- API and web typechecks and production builds passed.
- ACR no-push builds `cbub` (API) and `cbuc` (web) passed.
- Bicep lint/build passed with the same two non-blocking warnings.
- The document load analysis query ran successfully against the dev warehouse
  with `SELECT`-only access and returned recorded wait and handoff metrics.
- Header routing returns the requested environment for DEV, STG, and PROD.
- Staging credential testing confirmed the Key Vault analytics credential is
  valid. Production network inspection confirmed the intended West Europe
  database is private-network-only and is not reachable from the current
  non-VNet Container Apps environment.

Numeric lifecycle analysis was validated at 2026-08-27T05:49:50Z:

- API typecheck/build and web typecheck/production build passed.
- Read-only stage queries returned complete document-level metrics in both dev
  and staging within the API timeout, including true upload-to-embedding
  end-to-end time and per-stage success, failure, pending, average, median,
  and p95 values.
- ACR no-push builds `cbuf` (API) and `cbug` (web) passed.
- Bicep lint/build and ARM group validation passed with the same two
  non-blocking warnings.
- ARM what-if returned two existing Container Apps as `Deploy` and 377
  resources as `Ignore`; there were no creates or deletes.

Lifecycle charts were validated at 2026-08-27T09:03:07Z:

- Web typecheck and production build passed.
- The Documents bundle includes a latency comparison chart, an upload-to-ready
  funnel, and a 100% stacked stage-outcome chart while retaining the exact
  numeric table.
- ACR no-push web build `cbum` passed with the deployed API URL.
- Bicep lint/build passed with the same two non-blocking warnings. Infrastructure
  is unchanged, so the successful same-day ARM validation and what-if remain
  applicable to this web-image-only deployment.

Funnel average-time labels and processing KPI names were validated at
2026-08-27T09:29:00Z:

- Web typecheck and production build passed.
- Every funnel stage now shows its average time in the visible label and tooltip.
- Processing Performance uses `Avg Processing Time` and `Avg Upload Time`
  consistently in the chart legend and tooltip.
- Infrastructure and the API are unchanged; the successful same-day Bicep and
  ARM validation remain applicable to this web-image-only deployment.

| Check | Command / evidence | Outcome |
|---|---|---|
| Target authentication | `az account show --subscription c4289eb9-2fb6-48b7-9a75-1251ebba3992` | `Jeen Subscription`, enabled |
| API typecheck and build | `npm --prefix api run typecheck` and `npm --prefix api run build` | Passed |
| Web typecheck and build | `NEXT_PUBLIC_API_URL=https://jeen-analytics-api.victoriousdesert-e48a62c2.westeurope.azurecontainerapps.io npm --prefix web run typecheck/build` | Passed; existing React Hook lint warnings remain |
| API container build | ACR no-push build `cbtw` | Passed |
| Web container build | ACR no-push build `cbtx` with `NEXT_PUBLIC_API_URL` build argument | Passed |
| Deployment script syntax | PowerShell parser against `azure/deploy.ps1` | Passed |
| Bicep lint and compile | `az bicep lint/build --file azure/container-apps.bicep` | Passed with two non-blocking linter warnings |
| ARM template validation | `az deployment group validate` against `jeen-rg-dev-weu` | `Succeeded`; policies evaluated |
| ARM what-if | `az deployment group what-if --result-format ResourceIdOnly` | Only the two analytics apps marked `Deploy`; no create or delete changes |
| Existing runtime state | `az containerapp show` for API and web | Both `Running` and `Succeeded`; API DB host and web API URL match this plan |
| Secret safety | Environment credentials copied directly from existing Key Vault values into Container App secret references | Values were not printed or persisted |

### Role Assignment Verification

- Static Bicep defines system identities and registry identity configuration but
  does not define role assignments.
- The existing live apps use their preserved registry credential
  configuration (`identity.type = None`) and are successfully pulling the
  current immutable images.
- Deployment will therefore use image-only `az containerapp update` commands.
  It will not apply the Bicep template, change registry authentication, or
  materialize application secrets.
- ACR and both Container Apps are in `Succeeded` state before deployment.

## 9. Deployment Results

Latest deployment completed on 2026-08-27.

| Component | ACR build | Deployed image digest | Active revision |
|---|---|---|---|
| API | `cbuh` | `jeendevregistry.azurecr.io/jeen-analytics-api@sha256:fe418b16e2c093b00fe1ccea8b5fd2040c8b7ab44e59bace0d271db826374e77` | `jeen-analytics-api--stageanalysis-20260827-0550-api` |
| Web | `cbup` | `jeendevregistry.azurecr.io/jeen-analytics-web@sha256:c0696d93ad5d29c33e2c9b524c29fa31d436285a81fdab3135eda0b3d9a3e0f9` | `jeen-analytics-web--funnelavg-20260827-0930-web` |

Both revisions are active, healthy, and receive 100% traffic. The deployed web
bundle contains the true end-to-end analysis, exact numeric table, latency
comparison chart, upload-to-ready funnel, and 100% stacked stage-outcome chart.
The funnel includes average time for every stage, and Processing Performance
uses explicit `Avg Processing Time` and `Avg Upload Time` labels. The live
endpoint returns the average, median, p95, success, failure, and pending values
for dev and staging.
Production returns unavailable rather than falling back to development data
because its intended database is private-network-only.

### Live Role Verification

- Both Container Apps report `identity.type = None` and no principal ID.
- Both retain credential-based access to `jeendevregistry.azurecr.io`; no
  managed-identity `AcrPull` role is expected for this deployment model.
- Successful pulls of both digest-pinned images confirm live registry access.

### Rollback

| Component | Previous image / revision |
|---|---|
| API | Unchanged: `jeendevregistry.azurecr.io/jeen-analytics-api@sha256:fe418b16e2c093b00fe1ccea8b5fd2040c8b7ab44e59bace0d271db826374e77` / `jeen-analytics-api--stageanalysis-20260827-0550-api` |
| Web | `jeendevregistry.azurecr.io/jeen-analytics-web@sha256:87141e8c7bfc64097b5f3e12ed602658636fd7676d84f7db8737edc612d8ee9a` / `jeen-analytics-web--stagecharts-20260827-0905-web` |

### Environment Connection Audit

- Dev is connected to `jeen-dev-db-weu.postgres.database.azure.com`; health and
  dashboard queries return HTTP 200.
- Staging is connected to `jeen-staging-db.postgres.database.azure.com` with
  its validated staging credential; health and dashboard queries return HTTP 200.
- Production is configured for
  `prod-jeen-pg-db.postgres.database.azure.com` with its production credential.
  The server has public access disabled and private DNS, while
  `jeen-analytics-env` has no VNet integration. Production therefore returns
  unavailable and never serves development data under a production label.

## 10. Safety and Recovery

- Do not delete or recreate Container Apps, environments, registries, or databases.
- Do not run database DDL/DML, warehouse backfills, watermark resets, or pipeline deployments.
- Do not use `latest`; use immutable image tags and record image digests.
- Do not print or persist secret values. Copy only the validated staging and
  production analytics credentials from their existing Key Vaults into
  Container App secret references.
- Keep previous Container App revisions/images available for rollback.
- Do not change the Azure CLI default subscription; pass the confirmed subscription explicitly.
- Do not commit, push, or merge repository changes without separate explicit authorization.

## 11. Files

| File | Purpose | Status |
|---|---|---|
| `.azure/deployment-plan.md` | Deployment source of truth | Deployed |
| `azure/container-apps.bicep` | Existing Container Apps IaC | Existing; DB host corrected |
| `api/Dockerfile` | API image | Existing |
| `web/Dockerfile` | Web image with build-time API argument | Existing |
