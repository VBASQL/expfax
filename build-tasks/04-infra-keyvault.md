# Task 04 — Bicep: Azure Key Vault

## Goal
Create the Bicep module for Azure Key Vault to store all application secrets.

## Context
- Key Vault stores: Entra client secret, FaxBack credentials, session secret
- App Service managed identity gets `Key Vault Secrets User` role
- Do NOT disable purge protection (Azure best practice)

## Secrets to Store (populated manually or via script after deploy)

| Secret Name | Description |
|------------|-------------|
| `faxback-api-url` | FaxBack API base URL (e.g., https://faxback.expfax.com:81/mqs) |
| `faxback-username` | FaxBack supervisor username |
| `faxback-password` | FaxBack supervisor password |
| `entra-client-id` | From Entra app registration (task 03) |
| `entra-client-secret` | From Entra app registration (task 03) |
| `entra-tenant-id` | Azure tenant ID |
| `session-secret` | Random 256-bit key for session signing |

## Steps

### 1. Create `infra/modules/key-vault.bicep`

```bicep
@description('Location for Key Vault')
param location string

@description('Base name for resources')
param baseName string

@description('Principal ID of the App Service managed identity')
param appServicePrincipalId string

var keyVaultName = '${baseName}-kv'

// Built-in role: Key Vault Secrets User
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    // purge protection stays enabled (default)
  }
}

// Grant App Service read access to secrets
resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, appServicePrincipalId, kvSecretsUserRoleId)
  properties: {
    principalId: appServicePrincipalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalType: 'ServicePrincipal'
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
```

### 2. Verify syntax
```powershell
az bicep build --file infra/modules/key-vault.bicep
```

## Files Created
- `infra/modules/key-vault.bicep`

## Outputs for Other Tasks
- `keyVaultUri` — used in App Service app settings and config loader (task 10)
