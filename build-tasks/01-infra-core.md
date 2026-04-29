# Task 01 — Bicep: Core Infrastructure

## Goal
Create the Bicep module for Resource Group, App Service Plan, and App Service (Node.js).

## Context
- We are deploying a Next.js 15 app on Azure App Service (Linux, Node 20 LTS)
- All Bicep files go in `expfax-portal/infra/`
- Use latest API versions
- Use managed identity (system-assigned) on the App Service

## Steps

### 1. Create `infra/modules/app-service.bicep`

```bicep
// Module: App Service Plan + App Service for ExpFax Portal
// Linux Node.js 20 LTS, System-assigned Managed Identity

@description('Location for all resources')
param location string

@description('Base name for resources')
param baseName string

@description('SKU for the App Service Plan')
param skuName string = 'B1'

@description('App settings to configure on the web app')
param appSettings array = []

var appServicePlanName = '${baseName}-plan'
var appServiceName = '${baseName}-app'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: skuName
  }
  properties: {
    reserved: true // Required for Linux
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appServiceName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      alwaysOn: true
      appSettings: appSettings
    }
  }
}

output appServiceId string = appService.id
output appServiceName string = appService.name
output appServicePrincipalId string = appService.identity.principalId
output appServiceDefaultHostname string = appService.properties.defaultHostName
```

### 2. Verify syntax
```powershell
az bicep build --file infra/modules/app-service.bicep
```

## Files Created
- `infra/modules/app-service.bicep`

## Outputs for Other Tasks
- `appServicePrincipalId` — used in task 02 (Cosmos RBAC) and task 04 (Key Vault access)
- `appServiceName` — used in task 05 (main.bicep wiring)
