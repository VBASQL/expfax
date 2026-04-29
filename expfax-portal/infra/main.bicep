targetScope = 'resourceGroup'

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Base name prefix for all resources (keep short, lowercase)')
param baseName string = 'expfax'

@description('App Service SKU')
param appServiceSku string = 'B1'

@description('Deploy the App Service (set false for local-only dev — Cosmos/KV/Storage still deploy)')
param deployAppService bool = false

@description('Object ID of a developer/user to grant data-plane RBAC on Cosmos/KV/Storage when App Service is not deployed')
param developerPrincipalId string = ''

// --- Module: App Service (optional) ---
module appService 'modules/app-service.bicep' = if (deployAppService) {
  name: 'app-service'
  params: {
    location: location
    baseName: baseName
    skuName: appServiceSku
    appSettings: [
      { name: 'NEXT_PUBLIC_APP_URL', value: 'https://${baseName}-app.azurewebsites.net' }
      { name: 'NODE_ENV', value: 'production' }
      { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
    ]
  }
}

// Principal that gets RBAC on data services. Either App Service MI or developer.
var dataPlanePrincipalId = deployAppService ? appService.outputs.appServicePrincipalId : developerPrincipalId

// --- Module: Cosmos DB ---
module cosmos 'modules/cosmos-db.bicep' = {
  name: 'cosmos-db'
  params: {
    location: location
    baseName: baseName
    appServicePrincipalId: dataPlanePrincipalId
  }
}

// --- Module: Key Vault ---
module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    baseName: baseName
    appServicePrincipalId: dataPlanePrincipalId
  }
}

// --- Module: Storage Account (fax blob storage) ---
module storage 'modules/storage-account.bicep' = {
  name: 'storage-account'
  params: {
    location: location
    baseName: baseName
    appServicePrincipalId: dataPlanePrincipalId
  }
}

// --- Wire dynamic app settings (only when App Service is deployed) ---
resource appServiceRef 'Microsoft.Web/sites@2023-12-01' existing = if (deployAppService) {
  name: '${baseName}-app'
}

resource appSettingsConfig 'Microsoft.Web/sites/config@2023-12-01' = if (deployAppService) {
  parent: appServiceRef
  name: 'appsettings'
  properties: {
    NEXT_PUBLIC_APP_URL: 'https://${baseName}-app.azurewebsites.net'
    NODE_ENV: 'production'
    WEBSITE_NODE_DEFAULT_VERSION: '~20'
    COSMOS_ENDPOINT: cosmos.outputs.cosmosEndpoint
    COSMOS_DATABASE: cosmos.outputs.cosmosDatabaseName
    KEY_VAULT_URI: keyVault.outputs.keyVaultUri
    STORAGE_BLOB_ENDPOINT: storage.outputs.storageBlobEndpoint
  }
  dependsOn: [
    appService
  ]
}

// --- Outputs ---
output APP_URL string = deployAppService ? 'https://${appService.outputs.appServiceDefaultHostname}' : ''
output APP_SERVICE_NAME string = deployAppService ? appService.outputs.appServiceName : ''
output COSMOS_ENDPOINT string = cosmos.outputs.cosmosEndpoint
output KEY_VAULT_URI string = keyVault.outputs.keyVaultUri
output KEY_VAULT_NAME string = keyVault.outputs.keyVaultName
output STORAGE_BLOB_ENDPOINT string = storage.outputs.storageBlobEndpoint
output STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName
