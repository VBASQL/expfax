# Task 20 — FaxBack Supervisor Session Manager

## Goal
Create a singleton service that maintains a supervisor-level FaxBack API session, auto-refreshes it, and retries on 401.

## Files to Create
- `src/lib/faxback/session.ts`

## Dependencies
- `src/lib/config.ts` (task 10)

## Business Rules (from design doc section 6.1)
- On startup: call `Login` with supervisor credentials to get a LoginId
- Every 3 minutes: call `RefreshId` to keep session alive
- On 401: re-authenticate immediately and retry the failed call once
- Supervisor credentials from Key Vault / env vars

## FaxBack API Details
- Base URL: `FAXBACK_API_URL` (e.g., `https://faxback.expfax.com:81/mqs`)
- Login endpoint: `POST /Login` with XML body
- RefreshId endpoint: `GET /RefreshId?LoginId={id}`
- All API calls append `?LoginId={id}` as query param

## Implementation

### Create `src/lib/faxback/session.ts`

```typescript
import { getConfig } from "@/lib/config";

interface FaxBackSessionState {
  loginId: string;
  lastRefresh: Date;
  refreshTimer: ReturnType<typeof setInterval> | null;
}

let sessionState: FaxBackSessionState | null = null;
let loginPromise: Promise<string> | null = null;

async function login(): Promise<string> {
  const config = await getConfig();

  const body = `<?xml version="1.0" encoding="utf-8"?>
<Login>
  <UserName>${config.faxbackUsername}</UserName>
  <Password>${config.faxbackPassword}</Password>
</Login>`;

  const res = await fetch(`${config.faxbackApiUrl}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    throw new Error(`FaxBack Login failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  // Parse LoginId from XML response: <LoginId>...</LoginId>
  const match = text.match(/<LoginId>([^<]+)<\/LoginId>/);
  if (!match) {
    throw new Error(`FaxBack Login response missing LoginId: ${text}`);
  }

  return match[1];
}

async function refreshSession(): Promise<void> {
  if (!sessionState) return;
  const config = await getConfig();

  try {
    const res = await fetch(
      `${config.faxbackApiUrl}/RefreshId?LoginId=${sessionState.loginId}`
    );
    if (!res.ok) {
      console.warn("FaxBack RefreshId failed, re-authenticating...");
      sessionState.loginId = await login();
    }
    sessionState.lastRefresh = new Date();
  } catch (error) {
    console.error("FaxBack refresh error:", error);
    try {
      sessionState.loginId = await login();
      sessionState.lastRefresh = new Date();
    } catch (loginError) {
      console.error("FaxBack re-login failed:", loginError);
    }
  }
}

/**
 * Initialize the supervisor session. Call once at app startup.
 */
export async function initFaxBackSession(): Promise<void> {
  if (sessionState?.refreshTimer) return; // Already initialized

  const loginId = await login();

  sessionState = {
    loginId,
    lastRefresh: new Date(),
    refreshTimer: setInterval(refreshSession, 3 * 60 * 1000), // 3 min
  };

  console.log("FaxBack supervisor session initialized.");
}

/**
 * Get the current LoginId. Initializes session if needed.
 */
export async function getLoginId(): Promise<string> {
  if (sessionState) return sessionState.loginId;

  // Prevent concurrent initialization
  if (!loginPromise) {
    loginPromise = (async () => {
      await initFaxBackSession();
      loginPromise = null;
      return sessionState!.loginId;
    })();
  }
  return loginPromise;
}

/**
 * Make an authenticated FaxBack API call.
 * Automatically appends LoginId and retries once on 401.
 */
export async function faxbackFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = await getConfig();
  const loginId = await getLoginId();

  const separator = path.includes("?") ? "&" : "?";
  const url = `${config.faxbackApiUrl}/${path}${separator}LoginId=${loginId}`;

  let res = await fetch(url, options);

  // Retry on 401: re-login and try once more
  if (res.status === 401) {
    console.warn(`FaxBack 401 on ${path}, re-authenticating...`);
    const newLoginId = await login();
    sessionState!.loginId = newLoginId;
    sessionState!.lastRefresh = new Date();

    const retryUrl = `${config.faxbackApiUrl}/${path}${separator}LoginId=${newLoginId}`;
    res = await fetch(retryUrl, options);
  }

  return res;
}

/**
 * Shut down the supervisor session (for graceful shutdown).
 */
export function destroyFaxBackSession(): void {
  if (sessionState?.refreshTimer) {
    clearInterval(sessionState.refreshTimer);
  }
  sessionState = null;
}
```

## Verify
- `npm run build` — no type errors
- With FaxBack running, `getLoginId()` returns a valid login ID
- `faxbackFetch("ReadQueue?Queue=1")` returns fax queue data

## Notes for Future Tasks
- Import as: `import { faxbackFetch } from "@/lib/faxback/session"`
- All other FaxBack modules (messages, queues, templates) use `faxbackFetch()`
- The `initFaxBackSession()` gets called lazily on first API call
