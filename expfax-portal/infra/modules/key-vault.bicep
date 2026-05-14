@description('Location for Key Vault')
param location string

@description('Base name for resources')
param baseName string

@description('Principal ID of the App Service managed identity')
param appServicePrincipalId string

// --- Optional secret values to seed at deploy time ---
// Pass these via main.parameters.json or `azd env set` so a fresh subscription
// deploy lands with everything wired up. Leave blank to skip a given secret;
// the operator can populate it manually later.

@secure() @description('FaxBack supervisor API URL') param faxbackApiUrl string = ''
@secure() @description('FaxBack supervisor username') param faxbackUsername string = ''
@secure() @description('FaxBack supervisor password') param faxbackPassword string = ''
@secure() @description('Email-to-fax gateway domain (e.g. fax.yourdomain.com)') param faxbackEmailDomain string = ''

@secure() @description('Workforce Entra tenant id (admin sign-in)') param entraTenantId string = ''
@secure() @description('Workforce Entra app client id') param entraClientId string = ''
@secure() @description('Workforce Entra app client secret') param entraClientSecret string = ''

@secure() @description('External ID (CIAM) tenant id') param externalTenantId string = ''
@secure() @description('External ID (CIAM) tenant domain (e.g. quantbotauth.onmicrosoft.com)') param externalTenantDomain string = ''
@secure() @description('External ID (CIAM) app client id') param externalClientId string = ''
@secure() @description('External ID (CIAM) app client secret') param externalClientSecret string = ''

@secure() @description('Multitenant /common SSO app client id (federated Microsoft sign-in for invitation flow)') param commonClientId string = ''
@secure() @description('Multitenant /common SSO app client secret') param commonClientSecret string = ''

@secure() @description('Session signing secret (random 32+ bytes)') param sessionSecret string = ''

@secure() @description('Shared secret used by the retention-cleanup cron Logic App to call the app webhook') param cronSecret string = ''

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

// --- Seed secrets (only those with non-empty values) ---
// Uses a small helper pattern: one resource per secret, gated by a non-empty
// check. The names match the kebab-case keys read by lib/config.ts.
var secretsToSeed = [
  { name: 'faxback-api-url',         value: faxbackApiUrl }
  { name: 'faxback-username',        value: faxbackUsername }
  { name: 'faxback-password',        value: faxbackPassword }
  { name: 'faxback-email-domain',    value: faxbackEmailDomain }
  { name: 'entra-tenant-id',         value: entraTenantId }
  { name: 'entra-client-id',         value: entraClientId }
  { name: 'entra-client-secret',     value: entraClientSecret }
  { name: 'external-tenant-id',      value: externalTenantId }
  { name: 'external-tenant-domain',  value: externalTenantDomain }
  { name: 'external-client-id',      value: externalClientId }
  { name: 'external-client-secret',  value: externalClientSecret }
  { name: 'common-client-id',        value: commonClientId }
  { name: 'common-client-secret',    value: commonClientSecret }
  { name: 'session-secret',          value: sessionSecret }
  { name: 'cron-secret',             value: cronSecret }
]

@batchSize(1)
resource seedSecrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [for s in secretsToSeed: if (!empty(s.value)) {
  parent: keyVault
  name: s.name
  properties: {
    value: s.value
  }
}]

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
