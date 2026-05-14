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
  /** Email-to-fax gateway domain (e.g. "fax.yourdomain.com" — addresses look like 5551234567@fax.yourdomain.com) */
  faxbackEmailDomain: string;

  // Entra ID (workforce — admin sign-in)
  entraTenantId: string;
  entraClientId: string;
  entraClientSecret: string;

  // External ID / CIAM (customer sign-in + Graph user provisioning)
  externalTenantId: string;
  externalTenantDomain: string;
  externalClientId: string;
  externalClientSecret: string;

  // Multitenant /common SSO (federated sign-in with any existing Microsoft
  // account; no shadow user is created). App reg lives in the External ID
  // tenant but is configured as multitenant + personal MSA.
  commonClientId: string;
  commonClientSecret: string;

  // Session
  sessionSecret: string;

  // App
  appUrl: string;
  nodeEnv: string;

  // Storage
  faxStoragePath: string;
  storageBlobEndpoint: string;

  // Azure resource identifiers (used for ARM role-assignment checks)
  azureSubscriptionId: string;
  azureResourceGroup: string;
  azureAppServiceName: string;
}

let cachedConfig: AppConfig | null = null;

async function loadFromKeyVault(): Promise<Record<string, string>> {
  const vaultUri = process.env.KEY_VAULT_URI;
  if (!vaultUri) return {};

  const tenantId = process.env.AZURE_TENANT_ID;
  const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
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
    "external-tenant-id",
    "external-tenant-domain",
    "external-client-id",
    "external-client-secret",
    "common-client-id",
    "common-client-secret",
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
    faxbackEmailDomain: get("faxback-email-domain", "FAXBACK_EMAIL_DOMAIN"),

    entraTenantId: get("entra-tenant-id", "ENTRA_TENANT_ID"),
    entraClientId: get("entra-client-id", "ENTRA_CLIENT_ID"),
    entraClientSecret: get("entra-client-secret", "ENTRA_CLIENT_SECRET"),

    externalTenantId: get("external-tenant-id", "EXTERNAL_TENANT_ID"),
    externalTenantDomain: get("external-tenant-domain", "EXTERNAL_TENANT_DOMAIN"),
    externalClientId: get("external-client-id", "EXTERNAL_CLIENT_ID"),
    externalClientSecret: get("external-client-secret", "EXTERNAL_CLIENT_SECRET"),

    commonClientId: get("common-client-id", "COMMON_CLIENT_ID"),
    commonClientSecret: get("common-client-secret", "COMMON_CLIENT_SECRET"),

    sessionSecret: get("session-secret", "SESSION_SECRET"),

    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV || "development",

    faxStoragePath: process.env.FAX_STORAGE_PATH || "./data/faxes",
    storageBlobEndpoint: process.env.STORAGE_BLOB_ENDPOINT || "",

    azureSubscriptionId: process.env.AZURE_SUBSCRIPTION_ID || "",
    azureResourceGroup: process.env.AZURE_RESOURCE_GROUP || "",
    azureAppServiceName: process.env.AZURE_APP_SERVICE_NAME || "",
  };

  return cachedConfig;
}

// Synchronous access after initial load (for middleware etc.)
export function getConfigSync(): AppConfig {
  if (!cachedConfig) throw new Error("Config not loaded yet. Call getConfig() first.");
  return cachedConfig;
}
