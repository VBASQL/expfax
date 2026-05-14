// Module: Logic App (Consumption) that invokes the retention cleanup
// endpoint on a daily schedule.
//
// Why a Logic App and not a Function App? Zero code, no separate deploy,
// no extra storage account. The workflow is two actions: Recurrence + HTTP.

@description('Location for the Logic App')
param location string

@description('Base name for resources')
param baseName string

@description('Hostname of the App Service to call (e.g. expfax-app.azurewebsites.net)')
param appHostname string

@description('Shared secret sent in the x-cron-secret header')
@secure()
param cronSecret string

@description('Hour of day (0-23, UTC) to trigger the cleanup')
param scheduleHourUtc int = 3

var logicAppName = '${baseName}-retention-cron'
var endpointUrl = 'https://${appHostname}/api/cron/retention-cleanup'

resource logicApp 'Microsoft.Logic/workflows@2019-05-01' = {
  name: logicAppName
  location: location
  properties: {
    state: 'Enabled'
    definition: {
      '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
      contentVersion: '1.0.0.0'
      parameters: {
        endpointUrl: {
          type: 'String'
          defaultValue: endpointUrl
        }
        cronSecret: {
          type: 'SecureString'
          defaultValue: cronSecret
        }
      }
      triggers: {
        DailyRecurrence: {
          type: 'Recurrence'
          recurrence: {
            frequency: 'Day'
            interval: 1
            timeZone: 'UTC'
            schedule: {
              hours: [
                string(scheduleHourUtc)
              ]
              minutes: [
                0
              ]
            }
          }
        }
      }
      actions: {
        InvokeRetentionCleanup: {
          type: 'Http'
          inputs: {
            method: 'POST'
            uri: '@parameters(\'endpointUrl\')'
            headers: {
              'x-cron-secret': '@parameters(\'cronSecret\')'
              'Content-Type': 'application/json'
            }
            // Cleanup can take a while on large fax volumes — App Service
            // already caps the route at 5 min. Match here so Logic App
            // doesn't time out earlier.
            body: {}
          }
          runtimeConfiguration: {
            requestOptions: {
              timeout: 'PT5M'
            }
          }
          // Retry on transient 5xx / network errors. The Cosmos lock makes
          // retries safe (a successful run will mark the lock; retries will
          // be skipped within the 23h window).
          operationOptions: ''
        }
      }
      outputs: {}
    }
  }
}

output logicAppName string = logicApp.name
output logicAppId string = logicApp.id
