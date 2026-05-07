// One-off: wipe ALL documents from every Cosmos DB container (for fresh test runs).
// Usage:  node scripts/wipe-cosmos.mjs
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { readFileSync } from "node:fs";

// Tiny .env.local loader (no deps)
try {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const endpoint = process.env.COSMOS_ENDPOINT;
const dbName = process.env.COSMOS_DATABASE || "expfax";

if (!endpoint) {
  console.error("Missing COSMOS_ENDPOINT in .env.local");
  process.exit(1);
}

const CONTAINERS = [
  "users",
  "sessions",
  "contacts",
  "faxMessages",
  "auditLog",
  "coverTemplates",
  "invitations",
  "faxDrafts",
];

const cosmosKey = process.env.COSMOS_KEY;
const client = cosmosKey
  ? new CosmosClient({ endpoint, key: cosmosKey })
  : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });

const db = client.database(dbName);

async function wipeContainer(name) {
  const container = db.container(name);

  // Read all item ids + partition key values
  let deleted = 0;
  let continuationToken;

  do {
    const { resources, continuationToken: next } = await container.items
      .query("SELECT c.id, c.userId FROM c", { continuationToken })
      .fetchAll();

    continuationToken = next;

    for (const item of resources) {
      // Determine the partition key value for this container
      const pk = item.userId ?? item.id;
      await container.item(item.id, pk).delete();
      deleted++;
    }
  } while (continuationToken);

  console.log(`  ${name}: deleted ${deleted} document(s)`);
}

console.log(`Wiping database '${dbName}' at ${endpoint}`);

for (const name of CONTAINERS) {
  try {
    await wipeContainer(name);
  } catch (err) {
    // Container may not exist yet or already empty — treat as non-fatal
    console.warn(`  ${name}: skipped (${err.message})`);
  }
}

console.log("Done. Cosmos DB is empty.");
