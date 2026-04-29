# Task 11 — Cosmos DB Client Singleton

## Goal
Create a Cosmos DB client that connects using managed identity in production and key-based auth in local dev.

## Files to Create
- `src/lib/db/cosmos.ts`

## Dependencies
- `@azure/cosmos` (installed in task 00)
- `@azure/identity` (installed in task 00)
- `src/lib/config.ts` (from task 10)

## Implementation

### Create `src/lib/db/cosmos.ts`

```typescript
import { CosmosClient, Database, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "@/lib/config";

let client: CosmosClient | null = null;
let database: Database | null = null;

async function getClient(): Promise<CosmosClient> {
  if (client) return client;

  const config = await getConfig();

  if (config.cosmosKey) {
    // Local dev with emulator or key-based auth
    client = new CosmosClient({
      endpoint: config.cosmosEndpoint,
      key: config.cosmosKey,
    });
  } else {
    // Production: Managed Identity via RBAC
    const credential = new DefaultAzureCredential();
    client = new CosmosClient({
      endpoint: config.cosmosEndpoint,
      aadCredentials: credential,
    });
  }

  return client;
}

export async function getDatabase(): Promise<Database> {
  if (database) return database;

  const cosmosClient = await getClient();
  const config = await getConfig();
  database = cosmosClient.database(config.cosmosDatabase);
  return database;
}

export async function getContainer(containerName: string): Promise<Container> {
  const db = await getDatabase();
  return db.container(containerName);
}

// Convenience accessors for each container
export const containers = {
  users: () => getContainer("users"),
  sessions: () => getContainer("sessions"),
  contacts: () => getContainer("contacts"),
  faxMessages: () => getContainer("faxMessages"),
  auditLog: () => getContainer("auditLog"),
  coverTemplates: () => getContainer("coverTemplates"),
};
```

## Verify
- File compiles with `npm run build`
- With Cosmos Emulator running locally (or connection to Azure), `containers.users()` should return a Container object

## Notes for Future Tasks
- Import as: `import { containers } from "@/lib/db/cosmos"`
- Usage: `const container = await containers.users(); const { resource } = await container.item(id, id).read();`
- All containers use the names from the Bicep definition (task 02)
