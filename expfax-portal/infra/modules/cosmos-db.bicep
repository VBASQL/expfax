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

resource invitationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'invitations'
  properties: {
    resource: {
      id: 'invitations'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

// --- RBAC: Grant App Service data contributor role ---

resource cosmosRbac 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, appServicePrincipalId, cosmosDataContributorRoleId)
  properties: {
    principalId: appServicePrincipalId
    roleDefinitionId: '/subscriptions/${subscription().subscriptionId}/resourceGroups/${resourceGroup().name}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosAccount.name}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    scope: cosmosAccount.id
  }
}

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseName string = databaseName
output cosmosAccountName string = cosmosAccount.name
