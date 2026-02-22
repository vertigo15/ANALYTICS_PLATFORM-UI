# Azure Container Apps Deployment

This directory contains the Infrastructure as Code (IaC) and deployment scripts for deploying the Jeen Analytics Platform to Azure Container Apps.

## Prerequisites

1. **Azure CLI** installed and configured
   ```powershell
   az --version
   ```

2. **Azure login**
   ```powershell
   az login
   az account set --subscription "c4289eb9-2fb6-48b7-9a75-1251ebba3992"
   ```

3. **Docker** installed for building images

4. **Secrets in Azure Key Vault**
   - `analytics-db-password` - PostgreSQL database password for bi_readonly user
   - `azure-openai-api-key` - Azure OpenAI API key

## Quick Deploy

Run the PowerShell deployment script from the project root:

```powershell
.\azure\deploy.ps1
```

### Custom Parameters

```powershell
.\azure\deploy.ps1 `
    -ResourceGroup "jeen-rg-dev-weu" `
    -AcrName "jeendevregistry" `
    -ImageTag "v1.0.0"
```

## Manual Deployment Steps

### 1. Build and Push Docker Images

```powershell
# Login to ACR
az acr login --name jeendevregistry

# Build and push API
docker build -t jeendevregistry.azurecr.io/jeen-analytics-api:latest -f api/Dockerfile ./api
docker push jeendevregistry.azurecr.io/jeen-analytics-api:latest

# Build and push Web
docker build -t jeendevregistry.azurecr.io/jeen-analytics-web:latest -f web/Dockerfile ./web
docker push jeendevregistry.azurecr.io/jeen-analytics-web:latest
```

### 2. Configure Parameters

Edit `azure/container-apps.parameters.json` with your values:
- Update `azureOpenAiEndpoint` with your Azure OpenAI endpoint
- Verify Key Vault references are correct
- Update ACR registry name if different

### 3. Deploy Infrastructure

```powershell
az deployment group create \
    --name jeen-analytics-deployment \
    --resource-group jeen-rg-dev-weu \
    --template-file azure/container-apps.bicep \
    --parameters azure/container-apps.parameters.json
```

### 4. Get Application URLs

```powershell
az containerapp show \
    --name jeen-analytics-web \
    --resource-group jeen-rg-dev-weu \
    --query properties.configuration.ingress.fqdn \
    --output tsv
```

## Architecture

The deployment creates two Azure Container Apps:

### API Container App
- **Name**: `jeen-analytics-api`
- **Port**: 3001
- **Image**: `jeendevregistry.azurecr.io/jeen-analytics-api:latest`
- **Resources**: 0.5 CPU, 1Gi Memory
- **Scaling**: 1-3 replicas (HTTP-based autoscaling)
- **Ingress**: External, HTTPS with CORS enabled

### Web Container App
- **Name**: `jeen-analytics-web`
- **Port**: 3000
- **Image**: `jeendevregistry.azurecr.io/jeen-analytics-web:latest`
- **Resources**: 0.5 CPU, 1Gi Memory
- **Scaling**: 1-5 replicas (HTTP-based autoscaling)
- **Ingress**: External, HTTPS

Both apps:
- Use **System-Assigned Managed Identity** for ACR access
- Are deployed to the existing environment: `jeen-analytics-env`
- Use secrets from Azure Key Vault

## Environment Variables

### API Container
- `ANALYTICS_DB_HOST` - PostgreSQL host
- `ANALYTICS_DB_PORT` - PostgreSQL port (5432)
- `ANALYTICS_DB_NAME` - Database name (analytics_db)
- `ANALYTICS_DB_USER` - Database user (bi_readonly)
- `ANALYTICS_DB_PASSWORD` - Database password (from Key Vault)
- `ANALYTICS_DB_SSLMODE` - SSL mode (require)
- `API_PORT` - API port (3001)
- `CACHE_TTL_SECONDS` - Cache TTL (3300 = 55 minutes)
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key (from Key Vault)
- `AZURE_OPENAI_DEPLOYMENT` - Model deployment name (gpt-4o)
- `AZURE_OPENAI_API_VERSION` - API version

### Web Container
- `NEXT_PUBLIC_API_URL` - API URL (automatically set to API container FQDN)

## Monitoring

### View Logs
```powershell
# API logs
az containerapp logs show \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --follow

# Web logs
az containerapp logs show \
    --name jeen-analytics-web \
    --resource-group jeen-rg-dev-weu \
    --follow
```

### View Metrics
```powershell
az containerapp show \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --query properties.template.scale
```

## Updating the Deployment

### Update Container Images Only
```powershell
# Update API
az containerapp update \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --image jeendevregistry.azurecr.io/jeen-analytics-api:v1.1.0

# Update Web
az containerapp update \
    --name jeen-analytics-web \
    --resource-group jeen-rg-dev-weu \
    --image jeendevregistry.azurecr.io/jeen-analytics-web:v1.1.0
```

### Update Environment Variables
```powershell
az containerapp update \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --set-env-vars "CACHE_TTL_SECONDS=7200"
```

## Troubleshooting

### Check Container App Status
```powershell
az containerapp show \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --query properties.provisioningState
```

### Check Revision Status
```powershell
az containerapp revision list \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --output table
```

### Test API Health
```powershell
$apiUrl = az containerapp show \
    --name jeen-analytics-api \
    --resource-group jeen-rg-dev-weu \
    --query properties.configuration.ingress.fqdn \
    --output tsv

curl "https://$apiUrl/api/v1/health"
```

### Check ACR Access
```powershell
# Verify managed identity has AcrPull role
az role assignment list \
    --scope "/subscriptions/c4289eb9-2fb6-48b7-9a75-1251ebba3992/resourceGroups/jeen-rg-dev-weu/providers/Microsoft.ContainerRegistry/registries/jeendevregistry" \
    --output table
```

## Security Considerations

1. **Secrets Management**: All sensitive values are stored in Azure Key Vault
2. **Managed Identity**: Container apps use system-assigned managed identity for ACR access
3. **SSL/TLS**: All ingress is HTTPS-only
4. **Database**: Read-only user (`bi_readonly`) with minimal permissions
5. **CORS**: API has CORS enabled for the web app domain

## Cost Optimization

- **Consumption-based pricing**: Only pay for resources used
- **Auto-scaling**: Scales down to 1 replica when idle
- **Efficient caching**: 55-minute cache TTL reduces database load

## Support

For issues or questions:
1. Check container logs
2. Verify Key Vault secrets are accessible
3. Ensure database allows connections from Azure
4. Check Container Apps Environment health
