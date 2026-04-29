# Task 14 — Entra ID Authentication Flows

## Goal
Implement both authentication methods:
1. Username/Password via ROPC (Resource Owner Password Credentials)
2. "Sign in with Microsoft" via OAuth Authorization Code

## Files to Create
- `src/lib/auth/entra.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/auth/logout/route.ts`

## Dependencies
- `arctic` (installed in task 00) — lightweight OAuth2 library
- `src/lib/config.ts` (task 10)
- `src/lib/auth/session.ts` (task 13)
- `src/lib/db/cosmos.ts` (task 11)

## Implementation

### 1. Create `src/lib/auth/entra.ts`

Handles both ROPC and OAuth flows.

```typescript
import { MicrosoftEntraId } from "arctic";
import { getConfig } from "@/lib/config";
import { containers } from "@/lib/db/cosmos";
import type { User } from "@/types";

let entraClient: MicrosoftEntraId | null = null;

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
 * ROPC flow — authenticates user with username/password directly.
 * Returns the Entra ID user info if successful.
 */
export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<{ entraId: string; email: string; displayName: string } | null> {
  const config = await getConfig();

  const tokenUrl = `https://login.microsoftonline.com/${config.entraTenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.entraClientId,
    client_secret: config.entraClientSecret,
    scope: "openid profile email",
    username: email,
    password: password,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) return null;

  const data = await response.json();
  const idToken = data.id_token;

  // Decode the JWT payload (no verification needed — Entra ID issued it)
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
 * Look up portal user by Entra ID object ID
 */
export async function findUserByEntraId(entraId: string): Promise<User | null> {
  const container = await containers.users();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.entraId = @entraId AND c.isActive = true",
      parameters: [{ name: "@entraId", value: entraId }],
    })
    .fetchAll();

  return resources.length > 0 ? (resources[0] as User) : null;
}
```

### 2. Create `src/app/api/auth/login/route.ts`

Handles username/password POST from the login form.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateWithPassword, findUserByEntraId } from "@/lib/auth/entra";
import { createSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Authenticate with Entra ID via ROPC
    const entraUser = await authenticateWithPassword(email, password);
    if (!entraUser) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Find linked portal user
    const user = await findUserByEntraId(entraUser.entraId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Your account has not been set up in the portal. Contact your administrator." },
        { status: 403 }
      );
    }

    // Create session
    const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    await createSession(user.id, ip, ua);

    return NextResponse.json({ success: true, redirectTo: "/" });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
```

### 3. Create `src/app/api/auth/callback/route.ts`

Handles the OAuth redirect from Microsoft login.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getEntraClient, findUserByEntraId } from "@/lib/auth/entra";
import { createSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  const config = await getConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(`${config.appUrl}/login?error=no_code`);
  }

  try {
    const entra = await getEntraClient();
    const tokens = await entra.validateAuthorizationCode(code, "");

    // Decode ID token to get user info
    const idToken = tokens.idToken();
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString()
    );

    const entraId = payload.oid || payload.sub;
    const user = await findUserByEntraId(entraId);

    if (!user) {
      return NextResponse.redirect(`${config.appUrl}/login?error=not_linked`);
    }

    const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    await createSession(user.id, ip, ua);

    return NextResponse.redirect(config.appUrl);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(`${config.appUrl}/login?error=auth_failed`);
  }
}
```

### 4. Create `src/app/api/auth/logout/route.ts`

```typescript
import { NextResponse } from "next/server";
import { destroySession, validateSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";

export async function POST() {
  const { session } = await validateSession();
  if (session) {
    await destroySession(session.id, session.userId);
  }

  const config = await getConfig();
  return NextResponse.json({ success: true, redirectTo: "/login" });
}
```

## Verify
- `npm run build` compiles without errors
- POST to `/api/auth/login` with `{ email, password }` returns success or error
- GET to `/api/auth/callback` handles the OAuth redirect

## Notes for Future Tasks
- The login PAGE (UI) is built in task 17
- The OAuth "Sign in with Microsoft" button needs to generate an authorization URL — task 17 will add a `/api/auth/microsoft` route for that
