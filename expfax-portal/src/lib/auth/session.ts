import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { cookies } from "next/headers";
import { containers } from "@/lib/db/cosmos";
import type { Session, User } from "@/types";

export const SESSION_COOKIE_NAME = "expfax_session";
export const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;      // 8 hours in ms
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000;       // 30 minutes in ms

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE / 1000,
  path: "/",
};

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(sha256(bytes));
}

export async function createSession(
  userId: string,
  ipAddress: string,
  userAgent: string,
  isAdmin = false
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
    isAdmin,
  };

  const container = await containers.sessions();
  await container.items.create(session);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

  return token;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  user?: User;
  isAdmin: boolean;
}

export async function validateSession(): Promise<SessionValidationResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

if (!token) return { valid: false, isAdmin: false };

  try {
    const sessionsContainer = await containers.sessions();

    const { resources } = await sessionsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @token",
        parameters: [{ name: "@token", value: token }],
      })
      .fetchAll();

    if (resources.length === 0) return { valid: false, isAdmin: false };

    const session = resources[0] as Session;

    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      await destroySession(token, session.userId);
      return { valid: false, isAdmin: false };
    }

    // Fetch user
    const usersContainer = await containers.users();
    const { resource: user } = await usersContainer.item(session.userId, session.userId).read<User>();

    if (!user || !user.isActive) {
      await destroySession(token, session.userId);
      return { valid: false, isAdmin: false };
    }

    // Extend session on activity (sliding window for idle timeout)
    const newExpiry = new Date(Date.now() + SESSION_IDLE_TIMEOUT);
    const maxExpiry = new Date(new Date(session.createdAt).getTime() + SESSION_MAX_AGE);
    const effectiveExpiry = newExpiry < maxExpiry ? newExpiry : maxExpiry;

    await sessionsContainer.item(session.id, session.userId).replace({
      ...session,
      expiresAt: effectiveExpiry.toISOString(),
    });

    const isAdmin = session.isAdmin ?? false;
    return { valid: true, session, user, isAdmin };
  } catch (error) {
    console.error("Session validation error:", error);
    return { valid: false, isAdmin: false };
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

export async function getCurrentUser(): Promise<(User & { isAdmin: boolean }) | null> {
  const result = await validateSession();
  if (!result.user) return null;
  return { ...result.user, isAdmin: result.isAdmin };
}
