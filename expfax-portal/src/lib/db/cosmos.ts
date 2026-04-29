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
    // Production: Managed Identity via RBAC.
    // Pass tenantId explicitly so AzureCliCredential (used in dev) requests
    // a token from the workforce tenant, not the external/CIAM tenant.
    const tenantId = process.env.AZURE_TENANT_ID;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
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
  invitations: () => getContainer("invitations"),
  faxDrafts: () => getContainer("faxDrafts"),
};
