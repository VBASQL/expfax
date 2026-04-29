// One-shot: backfill admin user document with authType + signupCompletedAt
// for the pre-existing seeded admin (created before the new schema).
// Run with:  node ./scripts/backfill-admin-authtype.mjs
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "dotenv";
config({ path: ".env.local" });

const endpoint = process.env.COSMOS_ENDPOINT;
const dbName = process.env.COSMOS_DATABASE_NAME ?? "expfax";

if (!endpoint) {
  console.error("COSMOS_ENDPOINT missing");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
const users = client.database(dbName).container("users");

const { resources } = await users.items
  .query({ query: "SELECT * FROM c WHERE c.role = 'admin' AND NOT IS_DEFINED(c.type)" })
  .fetchAll();

console.log(`Found ${resources.length} admin user(s) to inspect.`);

for (const u of resources) {
  if (u.authType && u.signupCompletedAt) {
    console.log(`  ${u.email}: already migrated, skipping`);
    continue;
  }
  const patches = [];
  if (!u.authType) patches.push({ op: "set", path: "/authType", value: "microsoft" });
  if (!u.signupCompletedAt)
    patches.push({ op: "set", path: "/signupCompletedAt", value: u.createdAt ?? new Date().toISOString() });
  if (u.mfaMode === undefined) patches.push({ op: "set", path: "/mfaMode", value: "off" });
  if (!Array.isArray(u.trustedLocations))
    patches.push({ op: "set", path: "/trustedLocations", value: [] });
  patches.push({ op: "set", path: "/updatedAt", value: new Date().toISOString() });

  await users.item(u.id, u.id).patch(patches);
  console.log(`  ${u.email}: backfilled`);
}

console.log("Done.");
