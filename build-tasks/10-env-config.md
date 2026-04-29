# Task 10 — Environment Config Loader

## Goal
Create a config module that loads secrets from Key Vault in production and from `.env.local` in development.

## Files to Create
- `src/lib/config.ts`

## Dependencies
- `@azure/identity` (installed in task 00)
- `@azure/keyvault-secrets` (installed in task 00)

## Implementation

### Create `src/lib/config.ts`

This module:
1. In production: reads `KEY_VAULT_URI` from env, uses `DefaultAzureCredential` to fetch secrets from Key Vault
2. In development: reads directly from `process.env` (populated by `.env.local`)
3. Caches values — secrets are loaded once at startup

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

interface AppConfig {
  // Cosmos DB
  cosmosEndpoint: string;
  cosmosDatabase: string;
  cosmosKey?: string; // Only for local dev with emulator

  // FaxBack
  faxbackApiUrl: string;
  faxbackUsername: string;
  faxbackPassword: string;

  // Entra ID
  entraTenantId: string;
  entraClientId: string;
  entraClientSecret: string;

  // Session
  sessionSecret: string;

  // App
  appUrl: string;
  nodeEnv: string;

  // Storage
  faxStoragePath: string;
}

let cachedConfig: AppConfig | null = null;

async function loadFromKeyVault(): Promise<Record<string, string>> {
  const vaultUri = process.env.KEY_VAULT_URI;
  if (!vaultUri) return {};

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUri, credential);
  const secrets: Record<string, string> = {};

  // Map Key Vault secret names to config keys
  const secretNames = [
    "faxback-api-url",
    "faxback-username",
    "faxback-password",
    "entra-client-id",
    "entra-client-secret",
    "entra-tenant-id",
    "session-secret",
  ];

  for (const name of secretNames) {
    try {
      const secret = await client.getSecret(name);
      if (secret.value) {
        secrets[name] = secret.value;
      }
    } catch {
      console.warn(`Key Vault secret "${name}" not found`);
    }
  }

  return secrets;
}

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  const isProduction = process.env.NODE_ENV === "production";
  const kvSecrets = isProduction ? await loadFromKeyVault() : {};

  // Helper: Key Vault value (kebab-case name) → falls back to env var
  const get = (kvName: string, envName: string, fallback = ""): string =>
    kvSecrets[kvName] || process.env[envName] || fallback;

  cachedConfig = {
    cosmosEndpoint: process.env.COSMOS_ENDPOINT || "",
    cosmosDatabase: process.env.COSMOS_DATABASE || "expfax",
    cosmosKey: process.env.COSMOS_KEY, // Only set for local emulator

    faxbackApiUrl: get("faxback-api-url", "FAXBACK_API_URL"),
    faxbackUsername: get("faxback-username", "FAXBACK_SUPERVISOR_USERNAME"),
    faxbackPassword: get("faxback-password", "FAXBACK_SUPERVISOR_PASSWORD"),

    entraTenantId: get("entra-tenant-id", "ENTRA_TENANT_ID"),
    entraClientId: get("entra-client-id", "ENTRA_CLIENT_ID"),
    entraClientSecret: get("entra-client-secret", "ENTRA_CLIENT_SECRET"),

    sessionSecret: get("session-secret", "SESSION_SECRET"),

    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV || "development",

    faxStoragePath: process.env.FAX_STORAGE_PATH || "./data/faxes",
  };

  return cachedConfig;
}

// Synchronous access after initial load (for middleware etc.)
export function getConfigSync(): AppConfig {
  if (!cachedConfig) throw new Error("Config not loaded yet. Call getConfig() first.");
  return cachedConfig;
}
```

## Verify
- File compiles with `npm run build` (no type errors)
- In dev mode with `.env.local`, `getConfig()` returns values from env vars

## Notes for Future Tasks
- Import as: `import { getConfig } from "@/lib/config"`
- Always `await getConfig()` in server components and API routes
- The config is server-side only — never import in client components
