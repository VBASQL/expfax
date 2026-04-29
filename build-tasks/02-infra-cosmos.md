# Task 02 — Bicep: Cosmos DB

## Goal
Create the Bicep module for Azure Cosmos DB (NoSQL API) with all containers needed by ExpFax.

## Context
- Cosmos DB NoSQL API
- Disable key-based access (use RBAC only via managed identity)
- Containers and partition keys are fixed — see list below

## Container Definitions

| Container | Partition Key | TTL | Description |
|-----------|--------------|-----|-------------|
| users | `/id` | -1 (off) | User profiles + FaxBack account links |
| sessions | `/userId` | 28800 (8hr) | Active login sessions |
| contacts | `/userId` | -1 (off) | User contacts and groups |
| faxMessages | `/userId` | -1 (off) | Fax records with embedded recipients/docs |
| auditLog | `/userId` | 7776000 (90d) | Audit trail |
| coverTemplates | `/userId` | -1 (off) | Template metadata |

## Steps

### 1. Create `infra/modules/cosmos-db.bicep`

```bicep
@description('Location for Cosmos DB')
param location string

@description('Base name for resources')
param baseName string

@description('Principal ID of the App Service managed identity for RBAC')
param appServicePrincipalId string

var accountName = '${baseName}-cosmos'
var databaseName = 'expfax'

// Built-in role: Cosmos DB Built-in Data Contributor
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    disableLocalAuth: true // RBAC only — no keys
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// --- Containers ---

resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

resource sessionsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'sessions'
  properties: {
    resource: {
      id: 'sessions'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      defaultTtl: 28800
    }
  }
}

resource contactsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'contacts'
  properties: {
    resource: {
      id: 'contacts'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

resource faxMessagesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'faxMessages'
  properties: {
    resource: {
      id: 'faxMessages'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

resource auditLogContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'auditLog'
  properties: {
    resource: {
      id: 'auditLog'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      defaultTtl: 7776000
    }
  }
}

resource coverTemplatesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'coverTemplates'
  properties: {
    resource: {
      id: 'coverTemplates'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

// --- RBAC: Grant App Service data contributor role ---

resource cosmosRbac 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, appServicePrincipalId, cosmosDataContributorRoleId)
  properties: {
    principalId: appServicePrincipalId
    roleDefinitionId: '/${subscription().subscriptionId}/resourceGroups/${resourceGroup().name}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosAccount.name}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: cosmosAccount.id
  }
}

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseName string = databaseName
output cosmosAccountName string = cosmosAccount.name
```

### 2. Verify syntax
```powershell
az bicep build --file infra/modules/cosmos-db.bicep
```

## Files Created
- `infra/modules/cosmos-db.bicep`

## Outputs for Other Tasks
- `cosmosEndpoint` — used in App Service app settings (task 05)
- `cosmosDatabaseName` — used in app config (task 10)
