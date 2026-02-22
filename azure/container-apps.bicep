@description('Environment name for the container apps')
param environmentName string = 'jeen-analytics-env'

@description('Location for all resources')
param location string = 'westeurope'

@description('Resource group name')
param resourceGroupName string = 'jeen-rg-dev-weu'

@description('Container Registry name')
param acrName string

@description('API container image')
param apiImage string

@description('Web container image')
param webImage string

@description('Database password')
@secure()
param dbPassword string

@description('Azure OpenAI endpoint')
param azureOpenAiEndpoint string

@description('Azure OpenAI API key')
@secure()
param azureOpenAiApiKey string

@description('Azure OpenAI deployment name')
param azureOpenAiDeployment string = 'gpt-4o'

// Existing Container Apps Environment
resource environment 'Microsoft.App/managedEnvironments@2024-02-02-preview' existing = {
  name: environmentName
}

// API Container App
resource apiContainerApp 'Microsoft.App/containerApps@2024-02-02-preview' = {
  name: 'jeen-analytics-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        corsPolicy: {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'OPTIONS'
          ]
          allowedHeaders: [
            '*'
          ]
        }
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'db-password'
          value: dbPassword
        }
        {
          name: 'azure-openai-api-key'
          value: azureOpenAiApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: [
            {
              name: 'ANALYTICS_DB_HOST'
              value: 'jeen-dev-db.postgres.database.azure.com'
            }
            {
              name: 'ANALYTICS_DB_PORT'
              value: '5432'
            }
            {
              name: 'ANALYTICS_DB_NAME'
              value: 'analytics_db'
            }
            {
              name: 'ANALYTICS_DB_USER'
              value: 'bi_readonly'
            }
            {
              name: 'ANALYTICS_DB_PASSWORD'
              secretRef: 'db-password'
            }
            {
              name: 'ANALYTICS_DB_SSLMODE'
              value: 'require'
            }
            {
              name: 'API_PORT'
              value: '3001'
            }
            {
              name: 'API_HOST'
              value: '0.0.0.0'
            }
            {
              name: 'CACHE_TTL_SECONDS'
              value: '3300'
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: azureOpenAiEndpoint
            }
            {
              name: 'AZURE_OPENAI_API_KEY'
              secretRef: 'azure-openai-api-key'
            }
            {
              name: 'AZURE_OPENAI_DEPLOYMENT'
              value: azureOpenAiDeployment
            }
            {
              name: 'AZURE_OPENAI_API_VERSION'
              value: '2024-02-15-preview'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '30'
              }
            }
          }
        ]
      }
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Web Container App
resource webContainerApp 'Microsoft.App/containerApps@2024-02-02-preview' = {
  name: 'jeen-analytics-web'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: webImage
          env: [
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: 'https://${apiContainerApp.properties.configuration.ingress.fqdn}'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
  dependsOn: [
    apiContainerApp
  ]
}

// Outputs
output apiUrl string = 'https://${apiContainerApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webContainerApp.properties.configuration.ingress.fqdn}'
output apiName string = apiContainerApp.name
output webName string = webContainerApp.name
