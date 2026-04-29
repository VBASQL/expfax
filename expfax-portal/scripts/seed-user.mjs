// One-off: seed the current az-CLI user as an admin in Cosmos `users` container.
// Usage:  node scripts/seed-user.mjs
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "node:crypto";
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
const oid = process.argv[2] || "2674ec41-673e-407c-b293-c9c7a9874287";
const email = process.argv[3] || "abraham@anyexcel.com";
const displayName = process.argv[4] || "Abraham Ekstein";

if (!endpoint) {
  console.error("Missing COSMOS_ENDPOINT");
  process.exit(1);
}

const client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
const container = client.database(dbName).container("users");

// Check if user already exists by entraId
const { resources } = await container.items
  .query({ query: "SELECT * FROM c WHERE c.entraId = @oid", parameters: [{ name: "@oid", value: oid }] })
  .fetchAll();

if (resources.length > 0) {
  console.log("User already exists:", resources[0].id);
  process.exit(0);
}

const now = new Date().toISOString();
const doc = {
  id: randomUUID(),
  entraId: oid,
  email,
  displayName,
  role: "admin",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const { resource } = await container.items.create(doc);
console.log("Created:", resource);
