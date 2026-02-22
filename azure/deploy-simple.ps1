#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Jeen Analytics Platform to Azure Container Apps using .env file
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "jeen-rg-dev-weu",
    
    [Parameter(Mandatory=$false)]
    [string]$AcrName = "jeendevregistry",
    
    [Parameter(Mandatory=$false)]
    [string]$Environment = "jeen-analytics-env",
    
    [Parameter(Mandatory=$false)]
    [string]$ImageTag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Jeen Analytics Platform Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load .env file
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please create a .env file in the project root with required variables" -ForegroundColor Yellow
    exit 1
}

Write-Host "Loading environment variables from .env..." -ForegroundColor Yellow
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.+)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        $envVars[$key] = $value
    }
}
Write-Host "✓ Loaded $($envVars.Count) environment variables" -ForegroundColor Green
Write-Host ""

# Check required variables
$required = @(
    'ANALYTICS_DB_PASSWORD',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'ANALYTICS_DB_HOST'
)

foreach ($var in $required) {
    if (-not $envVars.ContainsKey($var)) {
        Write-Host "ERROR: Required variable $var not found in .env file" -ForegroundColor Red
        exit 1
    }
}

# Check Azure login
Write-Host "Checking Azure login..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in to Azure. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in as: $($account.user.name)" -ForegroundColor Green
Write-Host ""

# Login to ACR
Write-Host "Logging in to Azure Container Registry..." -ForegroundColor Yellow
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to login to ACR" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in to ACR" -ForegroundColor Green
Write-Host ""

# Build and push images
$apiImage = "$AcrName.azurecr.io/jeen-analytics-api:$ImageTag"
$webImage = "$AcrName.azurecr.io/jeen-analytics-web:$ImageTag"

Write-Host "Building and pushing API image..." -ForegroundColor Yellow
docker build -t $apiImage -f api/Dockerfile ./api
if ($LASTEXITCODE -ne 0) { exit 1 }
docker push $apiImage
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "✓ API image pushed" -ForegroundColor Green
Write-Host ""

Write-Host "Building and pushing Web image..." -ForegroundColor Yellow
docker build -t $webImage -f web/Dockerfile ./web
if ($LASTEXITCODE -ne 0) { exit 1 }
docker push $webImage
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "✓ Web image pushed" -ForegroundColor Green
Write-Host ""

# Delete existing container apps if they exist
Write-Host "Checking for existing container apps..." -ForegroundColor Yellow
$apiExists = az containerapp show --name jeen-analytics-api --resource-group $ResourceGroup 2>$null
$webExists = az containerapp show --name jeen-analytics-web --resource-group $ResourceGroup 2>$null

if ($apiExists) {
    Write-Host "Deleting existing API container app..." -ForegroundColor Yellow
    az containerapp delete --name jeen-analytics-api --resource-group $ResourceGroup --yes
}
if ($webExists) {
    Write-Host "Deleting existing Web container app..." -ForegroundColor Yellow
    az containerapp delete --name jeen-analytics-web --resource-group $ResourceGroup --yes
}
Write-Host ""

# Grant ACR pull access to managed identity (will be assigned after creation)
$acrId = "/subscriptions/$($account.id)/resourceGroups/$ResourceGroup/providers/Microsoft.ContainerRegistry/registries/$AcrName"

# Create API container app
Write-Host "Creating API container app..." -ForegroundColor Yellow
az containerapp create `
    --name jeen-analytics-api `
    --resource-group $ResourceGroup `
    --environment $Environment `
    --image $apiImage `
    --target-port 3001 `
    --ingress external `
    --min-replicas 1 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1Gi `
    --registry-server "$AcrName.azurecr.io" `
    --env-vars `
        "ANALYTICS_DB_HOST=$($envVars['ANALYTICS_DB_HOST'])" `
        "ANALYTICS_DB_PORT=5432" `
        "ANALYTICS_DB_NAME=analytics_db" `
        "ANALYTICS_DB_USER=bi_readonly" `
        "ANALYTICS_DB_SSLMODE=require" `
        "API_PORT=3001" `
        "API_HOST=0.0.0.0" `
        "CACHE_TTL_SECONDS=3300" `
        "AZURE_OPENAI_ENDPOINT=$($envVars['AZURE_OPENAI_ENDPOINT'])" `
        "AZURE_OPENAI_DEPLOYMENT=$($envVars['AZURE_OPENAI_DEPLOYMENT'])" `
        "AZURE_OPENAI_API_VERSION=2024-02-15-preview" `
    --secrets `
        "db-password=$($envVars['ANALYTICS_DB_PASSWORD'])" `
        "openai-key=$($envVars['AZURE_OPENAI_API_KEY'])" `
    --env-vars `
        "ANALYTICS_DB_PASSWORD=secretref:db-password" `
        "AZURE_OPENAI_API_KEY=secretref:openai-key"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create API container app" -ForegroundColor Red
    exit 1
}
Write-Host "✓ API container app created" -ForegroundColor Green
Write-Host ""

# Get API URL
$apiUrl = az containerapp show `
    --name jeen-analytics-api `
    --resource-group $ResourceGroup `
    --query properties.configuration.ingress.fqdn `
    --output tsv

Write-Host "API URL: https://$apiUrl" -ForegroundColor Cyan
Write-Host ""

# Create Web container app
Write-Host "Creating Web container app..." -ForegroundColor Yellow
az containerapp create `
    --name jeen-analytics-web `
    --resource-group $ResourceGroup `
    --environment $Environment `
    --image $webImage `
    --target-port 3000 `
    --ingress external `
    --min-replicas 1 `
    --max-replicas 5 `
    --cpu 0.5 `
    --memory 1Gi `
    --registry-server "$AcrName.azurecr.io" `
    --env-vars "NEXT_PUBLIC_API_URL=https://$apiUrl"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create Web container app" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Web container app created" -ForegroundColor Green
Write-Host ""

# Get Web URL
$webUrl = az containerapp show `
    --name jeen-analytics-web `
    --resource-group $ResourceGroup `
    --query properties.configuration.ingress.fqdn `
    --output tsv

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "API URL:  https://$apiUrl" -ForegroundColor Cyan
Write-Host "Web URL:  https://$webUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test API: curl https://$apiUrl/api/v1/health" -ForegroundColor White
Write-Host "2. Open Web: https://$webUrl" -ForegroundColor White
Write-Host ""
