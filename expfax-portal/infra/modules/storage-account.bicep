@description('Location for Storage Account')
param location string

@description('Base name for resources')
param baseName string

@description('Principal ID of the App Service managed identity')
param appServicePrincipalId string

@description('Default retention period in days (0 = never delete)')
param defaultRetentionDays int = 365

// Storage account names: lowercase, no hyphens, 3-24 chars
var storageAccountName = replace('${baseName}faxstore', '-', '')

// Built-in role: Storage Blob Data Contributor
var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false   // RBAC only
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    encryption: {
      services: {
        blob: { enabled: true, keyType: 'Account' }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 30  // Soft delete for recovery
    }
  }
}

// Container: received faxes
resource receivedContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'received'
  properties: {
    publicAccess: 'None'
  }
}

// Container: sent faxes
resource sentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobServices
  name: 'sent'
  properties: {
    publicAccess: 'None'
  }
}

// Lifecycle policy: auto-delete blobs after retention period
resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = if (defaultRetentionDays > 0) {
  parent: storageAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'auto-purge-faxes'
          enabled: true
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: defaultRetentionDays
                }
              }
            }
            filters: {
              blobTypes: [ 'blockBlob' ]
            }
          }
        }
      ]
    }
  }
}

// RBAC: Grant App Service blob data contributor
resource storageRbac 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, appServicePrincipalId, blobDataContributorRoleId)
  properties: {
    principalId: appServicePrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
    principalType: 'ServicePrincipal'
  }
}

output storageAccountName string = storageAccount.name
output storageBlobEndpoint string = storageAccount.properties.primaryEndpoints.blob
