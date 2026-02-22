#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Jeen Analytics Platform to Azure Container Apps
.DESCRIPTION
    Builds Docker images, pushes to ACR, and deploys to Azure Container Apps Environment
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "jeen-rg-dev-weu",
    
    [Parameter(Mandatory=$false)]
    [string]$Location = "westeurope",
    
    [Parameter(Mandatory=$false)]
    [string]$AcrName = "jeendevregistry",
    
    [Parameter(Mandatory=$false)]
    [string]$Environment = "jeen-analytics-env",
    
    [Parameter(Mandatory=$false)]
    [string]$ImageTag = "latest",
    
    [Parameter(Mandatory=$true)]
    [SecureString]$DbPassword,
    
    [Parameter(Mandatory=$true)]
    [SecureString]$AzureOpenAiApiKey
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Jeen Analytics Platform Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if logged in to Azure
Write-Host "Checking Azure login..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in to Azure. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in as: $($account.user.name)" -ForegroundColor Green
Write-Host "✓ Subscription: $($account.name)" -ForegroundColor Green
Write-Host ""

# Login to ACR
Write-Host "Logging in to Azure Container Registry..." -ForegroundColor Yellow
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to login to ACR" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in to ACR: $AcrName.azurecr.io" -ForegroundColor Green
Write-Host ""

# Build and push API image
Write-Host "Building API Docker image..." -ForegroundColor Yellow
$apiImage = "$AcrName.azurecr.io/jeen-analytics-api:$ImageTag"
docker build -t $apiImage -f api/Dockerfile ./api
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build API image" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Built API image: $apiImage" -ForegroundColor Green

Write-Host "Pushing API image to ACR..." -ForegroundColor Yellow
docker push $apiImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push API image" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Pushed API image to ACR" -ForegroundColor Green
Write-Host ""

# Build and push Web image
Write-Host "Building Web Docker image..." -ForegroundColor Yellow
$webImage = "$AcrName.azurecr.io/jeen-analytics-web:$ImageTag"
docker build -t $webImage -f web/Dockerfile ./web
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build Web image" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Built Web image: $webImage" -ForegroundColor Green

Write-Host "Pushing Web image to ACR..." -ForegroundColor Yellow
docker push $webImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push Web image" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Pushed Web image to ACR" -ForegroundColor Green
Write-Host ""

# Deploy using Bicep
Write-Host "Deploying to Azure Container Apps..." -ForegroundColor Yellow
$deploymentName = "jeen-analytics-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Convert SecureStrings to plain text for Azure CLI
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DbPassword)
)
$openAiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AzureOpenAiApiKey)
)

az deployment group create `
    --name $deploymentName `
    --resource-group $ResourceGroup `
    --template-file azure/container-apps.bicep `
    --parameters azure/container-apps.parameters.json `
    --parameters apiImage=$apiImage `
    --parameters webImage=$webImage `
    --parameters dbPassword=$dbPasswordPlain `
    --parameters azureOpenAiApiKey=$openAiKeyPlain

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Deployment completed successfully" -ForegroundColor Green
Write-Host ""

# Get the URLs
Write-Host "Getting application URLs..." -ForegroundColor Yellow
$deployment = az deployment group show `
    --name $deploymentName `
    --resource-group $ResourceGroup `
    --query properties.outputs `
    | ConvertFrom-Json

$apiUrl = $deployment.apiUrl.value
$webUrl = $deployment.webUrl.value

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "API URL:  $apiUrl" -ForegroundColor Cyan
Write-Host "Web URL:  $webUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify API health: curl $apiUrl/api/v1/health" -ForegroundColor White
Write-Host "2. Open web app: $webUrl" -ForegroundColor White
Write-Host ""
