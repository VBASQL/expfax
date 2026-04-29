# Task 13 — Session Management

## Goal
Create session creation, validation, and destruction logic backed by Cosmos DB.

## Files to Create
- `src/lib/auth/session.ts`

## Dependencies
- `@oslojs/crypto` and `@oslojs/encoding` (installed in task 00)
- `src/lib/db/cosmos.ts` (from task 11)
- `src/types/index.ts` (from task 12)

## Business Rules (from design doc section 5.2)
- Session duration: 8 hours (configurable)
- Idle timeout: 30 minutes
- Cookie: `HttpOnly`, `Secure`, `SameSite=Strict`
- Session token is cryptographically random

## Implementation

### Create `src/lib/auth/session.ts`

```typescript
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { cookies } from "next/headers";
import { containers } from "@/lib/db/cosmos";
import { getConfig } from "@/lib/config";
import type { Session, User } from "@/types";

const SESSION_COOKIE_NAME = "expfax_session";
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;      // 8 hours in ms
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000;       // 30 minutes in ms

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(sha256(bytes));
}

export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const token = generateSessionToken();
  const now = new Date();

  const session: Session = {
    id: token,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE).toISOString(),
    createdAt: now.toISOString(),
    ipAddress,
    userAgent,
  };

  const container = await containers.sessions();
  await container.items.create(session);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE / 1000,
    path: "/",
  });

  return token;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  user?: User;
}

export async function validateSession(): Promise<SessionValidationResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return { valid: false };

  try {
    const sessionsContainer = await containers.sessions();

    // Query session by token (id) — need to find it across partitions
    // or use cross-partition query
    const { resources } = await sessionsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @token",
        parameters: [{ name: "@token", value: token }],
      })
      .fetchAll();

    if (resources.length === 0) return { valid: false };

    const session = resources[0] as Session;

    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      await destroySession(token, session.userId);
      return { valid: false };
    }

    // Fetch user
    const usersContainer = await containers.users();
    const { resource: user } = await usersContainer.item(session.userId, session.userId).read<User>();

    if (!user || !user.isActive) {
      await destroySession(token, session.userId);
      return { valid: false };
    }

    // Extend session on activity (sliding window for idle timeout)
    const newExpiry = new Date(Date.now() + SESSION_IDLE_TIMEOUT);
    const maxExpiry = new Date(new Date(session.createdAt).getTime() + SESSION_MAX_AGE);
    const effectiveExpiry = newExpiry < maxExpiry ? newExpiry : maxExpiry;

    await sessionsContainer.item(session.id, session.userId).replace({
      ...session,
      expiresAt: effectiveExpiry.toISOString(),
    });

    return { valid: true, session, user };
  } catch (error) {
    console.error("Session validation error:", error);
    return { valid: false };
  }
}

export async function destroySession(token?: string, userId?: string): Promise<void> {
  try {
    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    }

    if (token && userId) {
      const container = await containers.sessions();
      await container.item(token, userId).delete();
    }

    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch (error) {
    console.error("Session destruction error:", error);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const result = await validateSession();
  return result.user || null;
}
```

## Verify
- `npm run build` compiles without errors

## Notes for Future Tasks
- Import `validateSession` in middleware (task 15)
- Import `createSession` in login handler (task 14)
- Import `getCurrentUser` in any server component that needs the logged-in user
