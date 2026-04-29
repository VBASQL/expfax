# Task 05 — Bicep: Main Orchestrator + azd Configuration

## Goal
Create the `main.bicep` that wires all modules together, plus `azure.yaml` for azd.

## Context
- main.bicep consumes modules from tasks 01–04
- azd uses `azure.yaml` to know how to build and deploy the Next.js app
- All secrets are passed to App Service as Key Vault references

## Steps

### 1. Create `infra/main.bicep`

```bicep
targetScope = 'resourceGroup'

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Base name prefix for all resources (keep short, lowercase)')
param baseName string = 'expfax'

@description('App Service SKU')
param appServiceSku string = 'B1'

// --- Module: App Service ---
module appService 'modules/app-service.bicep' = {
  name: 'app-service'
  params: {
    location: location
    baseName: baseName
    skuName: appServiceSku
    appSettings: [
      { name: 'COSMOS_ENDPOINT', value: cosmos.outputs.cosmosEndpoint }
      { name: 'COSMOS_DATABASE', value: cosmos.outputs.cosmosDatabaseName }
      { name: 'KEY_VAULT_URI', value: keyVault.outputs.keyVaultUri }
      { name: 'NEXT_PUBLIC_APP_URL', value: 'https://${baseName}-app.azurewebsites.net' }
      { name: 'NODE_ENV', value: 'production' }
      { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
    ]
  }
}

// --- Module: Cosmos DB ---
module cosmos 'modules/cosmos-db.bicep' = {
  name: 'cosmos-db'
  params: {
    location: location
    baseName: baseName
    appServicePrincipalId: appService.outputs.appServicePrincipalId
  }
}

// --- Module: Key Vault ---
module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    baseName: baseName
    appServicePrincipalId: appService.outputs.appServicePrincipalId
  }
}

// --- Outputs ---
output APP_URL string = 'https://${appService.outputs.appServiceDefaultHostname}'
output COSMOS_ENDPOINT string = cosmos.outputs.cosmosEndpoint
output KEY_VAULT_URI string = keyVault.outputs.keyVaultUri
output APP_SERVICE_NAME string = appService.outputs.appServiceName
```

### 2. Create `infra/main.parameters.json`

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "baseName": { "value": "${AZURE_ENV_NAME}" },
    "location": { "value": "${AZURE_LOCATION}" },
    "appServiceSku": { "value": "B1" }
  }
}
```

### 3. Create `azure.yaml` (project root: `expfax-portal/azure.yaml`)

```yaml
name: expfax-portal
metadata:
  template: expfax-portal
services:
  web:
    project: .
    language: js
    host: appservice
    dist: .next/standalone
hooks:
  preprovision:
    shell: pwsh
    run: Write-Host "Provisioning ExpFax infrastructure..."
  postprovision:
    shell: pwsh
    run: |
      Write-Host "Provisioned! Run infra/scripts/register-entra-app.ps1 to set up Entra ID."
  prebuild:
    shell: pwsh
    run: npm ci
  build:
    shell: pwsh
    run: npm run build
```

### 4. Create `.env.local` template for local dev

Create `expfax-portal/.env.local.example`:
```env
# === LOCAL DEVELOPMENT ===
# Copy this to .env.local and fill in values

# Cosmos DB (use emulator or Azure endpoint)
COSMOS_ENDPOINT=https://localhost:8081
COSMOS_KEY=your-local-emulator-key
COSMOS_DATABASE=expfax

# Key Vault (not used locally — secrets loaded from .env.local instead)
# KEY_VAULT_URI=

# FaxBack
FAXBACK_API_URL=http://localhost:81/mqs
FAXBACK_SUPERVISOR_USERNAME=
FAXBACK_SUPERVISOR_PASSWORD=

# Entra ID
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=

# Session
SESSION_SECRET=local-dev-secret-change-me-in-production

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Storage (local path for fax images in dev)
FAX_STORAGE_PATH=./data/faxes
```

### 5. Verify Bicep compiles
```powershell
az bicep build --file infra/main.bicep
```

## Files Created
- `infra/main.bicep`
- `infra/main.parameters.json`
- `azure.yaml`
- `.env.local.example`

## Next Steps
- Run `azd init` (if not already) then `azd provision --preview` to validate
- After provisioning, run `infra/scripts/register-entra-app.ps1`
- Populate Key Vault secrets manually or via script
