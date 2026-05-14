import { MicrosoftEntraId, OAuth2Client, CodeChallengeMethod } from "arctic";
import type { OAuth2Tokens } from "arctic";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "@/lib/config";
import { containers } from "@/lib/db/cosmos";
import type { User } from "@/types";

let entraClient: MicrosoftEntraId | null = null;
let externalClient: CiamEntraClient | null = null;
let commonClient: MicrosoftEntraId | null = null;

/**
 * Thin wrapper around Arctic's OAuth2Client that exposes the same interface
 * as MicrosoftEntraId but targets the External ID CIAM endpoint
 * ({subdomain}.ciamlogin.com) instead of login.microsoftonline.com.
 *
 * Using login.microsoftonline.com for a CIAM tenant produces AADSTS50020
 * ("account does not exist in tenant") for any account that isn't a member
 * of that tenant, because Microsoft treats it as a regular workforce tenant.
 */
class CiamEntraClient {
  private base: string;
  private inner: OAuth2Client;

  constructor(domain: string, clientId: string, clientSecret: string, redirectURI: string) {
    const subdomain = domain.split(".")[0];
    this.base = `https://${subdomain}.ciamlogin.com/${domain}`;
    this.inner = new OAuth2Client(clientId, clientSecret, redirectURI);
  }

  createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL {
    return this.inner.createAuthorizationURLWithPKCE(
      `${this.base}/oauth2/v2.0/authorize`,
      state,
      CodeChallengeMethod.S256,
      codeVerifier,
      scopes
    );
  }

  validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens> {
    return this.inner.validateAuthorizationCode(
      `${this.base}/oauth2/v2.0/token`,
      code,
      codeVerifier
    );
  }
}

/**
 * Workforce tenant client (admin sign-in: anyexcel.com).
 */
export async function getEntraClient(): Promise<MicrosoftEntraId> {
  if (entraClient) return entraClient;
  const config = await getConfig();
  entraClient = new MicrosoftEntraId(
    config.entraTenantId,
    config.entraClientId,
    config.entraClientSecret,
    `${config.appUrl}/api/auth/callback`
  );
  return entraClient;
}

/**
 * External ID / CIAM tenant client (customer sign-up + sign-in).
 * Uses ciamlogin.com endpoints so that Microsoft accounts (personal, work,
 * school) can authenticate against the CIAM tenant without being members of it.
 */
export async function getExternalEntraClient(): Promise<CiamEntraClient> {
  if (externalClient) return externalClient;
  const config = await getConfig();
  externalClient = new CiamEntraClient(
    config.externalTenantDomain,
    config.externalClientId,
    config.externalClientSecret,
    `${config.appUrl}/api/auth/callback`
  );
  return externalClient;
}

/**
 * Multitenant / "common" client — federated SSO for any Microsoft account
 * (personal, work, school) WITHOUT creating a shadow user in our CIAM tenant.
 * The user signs in to their home tenant (or consumer MSA) and we receive
 * an ID token whose `oid` + `tid` uniquely identify them.
 *
 * Requires the workforce app registration to have "Supported account types"
 * set to "Accounts in any organizational directory and personal Microsoft
 * accounts" (multitenant + MSA).
 */
export async function getCommonEntraClient(): Promise<MicrosoftEntraId> {
  if (commonClient) return commonClient;
  const config = await getConfig();
  commonClient = new MicrosoftEntraId(
    "common",
    config.commonClientId,
    config.commonClientSecret,
    `${config.appUrl}/api/auth/callback`
  );
  return commonClient;
}

/**
 * Native Authentication API error wrapper — same shape as before so the
 * login route doesn't need restructuring.
 */
export class PasswordAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public httpStatus: number
  ) {
    super(`${code}: ${description}`);
    this.name = "PasswordAuthError";
  }
}

/**
 * Authenticate a CIAM customer using the Entra External ID Native
 * Authentication API (3-step challenge flow). This replaces the defunct ROPC
 * path which returned AADSTS500208 for local accounts.
 *
 * Flow:
 *   1. POST /oauth2/v2.0/initiate  — announce username + supported challenge types
 *   2. POST /oauth2/v2.0/challenge — select "password" credential
 *   3. POST /oauth2/v2.0/token     — submit password, receive id/access tokens
 *
 * Prerequisites (one-time, in Entra admin center):
 *   App registration → Authentication → Advanced settings
 *   • "Allow public client flows"  → Yes
 *   • "Enable native authentication" → Yes
 *
 * Reference: https://learn.microsoft.com/en-us/entra/identity-platform/reference-native-authentication-api
 */
export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<{ entraId: string; email: string; displayName: string } | null> {
  const config = await getConfig();

  // Native Auth uses ciamlogin.com, not login.microsoftonline.com.
  // Subdomain is the first label of externalTenantDomain
  // (e.g. "quantbotauth.onmicrosoft.com" → "quantbotauth").
  const subdomain = config.externalTenantDomain.split(".")[0];
  const base = `https://${subdomain}.ciamlogin.com/${config.externalTenantDomain}`;
  const clientId = config.externalClientId;

  // ── Step 1: Initiate ────────────────────────────────────────────────────────
  const initiateRes = await fetch(`${base}/oauth2/v2.0/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      challenge_type: "password redirect",
      username: email,
    }),
  });
  const initiateData = await initiateRes.json().catch(() => ({}));

  if (initiateData.error) {
    const code: string = initiateData.error;
    const desc: string = initiateData.error_description ?? `Initiate failed (${initiateRes.status})`;
    const sub: string | undefined = initiateData.suberror;
    throw new PasswordAuthError(sub ? `${code}/${sub}` : code, desc, initiateRes.status);
  }
  if (initiateData.challenge_type === "redirect") {
    throw new PasswordAuthError(
      "redirect_required",
      "Native authentication requires a browser redirect. Enable native auth on the app registration.",
      401
    );
  }

  const tok1: string = initiateData.continuation_token;

  // ── Step 2: Challenge ───────────────────────────────────────────────────────
  const challengeRes = await fetch(`${base}/oauth2/v2.0/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      challenge_type: "password redirect",
      continuation_token: tok1,
    }),
  });
  const challengeData = await challengeRes.json().catch(() => ({}));

  if (challengeData.error) {
    const code: string = challengeData.error;
    const desc: string = challengeData.error_description ?? `Challenge failed (${challengeRes.status})`;
    throw new PasswordAuthError(code, desc, challengeRes.status);
  }
  if (challengeData.challenge_type === "redirect") {
    throw new PasswordAuthError(
      "redirect_required",
      "Native authentication requires a browser redirect. Enable native auth on the app registration.",
      401
    );
  }
  if (challengeData.challenge_type !== "password") {
    throw new PasswordAuthError(
      "unexpected_challenge",
      `Expected 'password' challenge, got '${challengeData.challenge_type}'.`,
      500
    );
  }

  const tok2: string = challengeData.continuation_token;

  // ── Step 3: Token ───────────────────────────────────────────────────────────
  const tokenRes = await fetch(`${base}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      continuation_token: tok2,
      grant_type: "password",
      password,
      scope: "openid profile email",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));

  if (tokenData.error) {
    const code: string = tokenData.error;
    const desc: string = tokenData.error_description ?? `Token failed (${tokenRes.status})`;
    const sub: string | undefined = tokenData.suberror;
    throw new PasswordAuthError(sub ? `${code}/${sub}` : code, desc, tokenRes.status);
  }

  const idToken: string = tokenData.id_token;
  const payload = JSON.parse(
    Buffer.from(idToken.split(".")[1], "base64url").toString()
  );

  return {
    entraId: payload.oid || payload.sub,
    email: payload.preferred_username || payload.email || email,
    displayName: payload.name || email.split("@")[0],
  };
}

/**
 * Get an app-only Graph token for the External ID tenant (client credentials).
 */
async function getExternalGraphToken(): Promise<string> {
  const config = await getConfig();
  const url = `https://login.microsoftonline.com/${config.externalTenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.externalClientId,
    client_secret: config.externalClientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`External Graph token failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Provision a password-identity user in the External ID tenant via Graph.
 * Returns the new user's Entra object id.
 */
export async function createExternalPasswordUser(args: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ entraId: string }> {
  const config = await getConfig();
  const token = await getExternalGraphToken();

  // mailNickname: Graph requires it; derive from email local-part, sanitized.
  const local = args.email.split("@")[0] || "user";
  const mailNickname = local.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "user";

  const userPayload = {
    accountEnabled: true,
    displayName: args.displayName,
    mailNickname,
    identities: [
      {
        signInType: "emailAddress",
        issuer: config.externalTenantDomain,
        issuerAssignedId: args.email,
      },
    ],
    passwordProfile: {
      password: args.password,
      forceChangePasswordNextSignIn: false,
    },
    passwordPolicies: "DisablePasswordExpiration",
  };

  const res = await fetch("https://graph.microsoft.com/v1.0/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(userPayload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Graph create user failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return { entraId: data.id as string };
}

/**
 * Delete a user from the External ID (CIAM) tenant via Graph.
 * No-op if the user does not exist (404).
 */
export async function deleteExternalUser(entraId: string): Promise<void> {
  const token = await getExternalGraphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(entraId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = await res.text().catch(() => "");
    throw new Error(`Graph delete user failed: ${res.status} ${err}`);
  }
}

/**
 * Look up portal user by Entra ID object ID, optionally scoped to a tenant.
 *
 * For federated /common SSO, oid is unique only within a tenant — so callers
 * with a known `tid` should pass it. For legacy single-tenant lookups (e.g.
 * password auth, workforce admin sign-in) `tid` may be omitted and we match
 * any user with that oid (preserving previous behaviour).
 */
export async function findUserByEntraId(
  entraId: string,
  entraTenantId?: string | null
): Promise<User | null> {
  const container = await containers.users();

  // When tenant id is provided, prefer an exact (oid, tid) match. Allow legacy
  // rows where entraTenantId is missing/null to match too — but only when no
  // tenant-scoped row exists for this oid (handled by ordering / filtering).
  const query = entraTenantId
    ? "SELECT * FROM c WHERE c.entraId = @entraId AND c.isActive = true AND (c.entraTenantId = @tid OR NOT IS_DEFINED(c.entraTenantId) OR c.entraTenantId = null)"
    : "SELECT * FROM c WHERE c.entraId = @entraId AND c.isActive = true";

  const parameters: { name: string; value: string }[] = [
    { name: "@entraId", value: entraId },
  ];
  if (entraTenantId) parameters.push({ name: "@tid", value: entraTenantId });

  const { resources } = await container.items.query({ query, parameters }).fetchAll();

  if (resources.length === 0) return null;
  if (entraTenantId) {
    // Prefer exact tenant match over legacy null-tenant rows.
    const exact = resources.find(
      (r) => (r as User).entraTenantId === entraTenantId
    );
    if (exact) return exact as User;
  }
  return resources[0] as User;
}

/**
 * Check whether a workforce user (by Entra OID) has at least one Azure RBAC
 * role assignment on the Cosmos DB account or Storage account.
 * Uses the app's own credential to call the ARM role-assignments API.
 * Returns false on any error so a misconfigured subscription never grants
 * unintended access.
 */
export async function hasArmRoleOnAppResources(userOid: string): Promise<boolean> {
  const config = await getConfig();
  const { azureSubscriptionId, azureResourceGroup, cosmosEndpoint, storageBlobEndpoint } = config;

  if (!azureSubscriptionId || !azureResourceGroup) {
    // Env vars not set — fall back to tenant-membership-only check
    console.warn("AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP not set; skipping ARM role check");
    return true;
  }

  try {
    const tenantId = process.env.AZURE_TENANT_ID || config.entraTenantId;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
    const tokenResponse = await credential.getToken("https://management.azure.com/.default");
    const token = tokenResponse.token;

    // Derive resource names from endpoints
    const cosmosAccount = cosmosEndpoint.match(/\/\/([^.]+)\./)?.[1] ?? "";
    const storageAccount = storageBlobEndpoint.match(/\/\/([^.]+)\./)?.[1] ?? "";

    const resources = [
      cosmosAccount && `subscriptions/${azureSubscriptionId}/resourceGroups/${azureResourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosAccount}`,
      storageAccount && `subscriptions/${azureSubscriptionId}/resourceGroups/${azureResourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccount}`,
    ].filter(Boolean) as string[];

    for (const scope of resources) {
      const url = `https://management.azure.com/${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${userOid}')`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = await res.json() as { value?: unknown[] };
      if (data.value && data.value.length > 0) return true;
    }

    return false;
  } catch (err) {
    console.error("ARM role check failed:", err);
    return false;
  }
}
