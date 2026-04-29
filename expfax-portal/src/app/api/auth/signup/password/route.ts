import { NextRequest, NextResponse } from "next/server";
import { findActiveInvitationByToken } from "@/lib/auth/invitations";
import { createExternalPasswordUser } from "@/lib/auth/entra";
import { createUserFromSignup } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";

/**
 * Email + password signup against the External ID (CIAM) tenant.
 * Creates a Graph user with a password identity, materializes the portal User,
 * starts a session, and redirects.
 */
export async function POST(request: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const password = body.password ?? "";

  if (!token || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const invitation = await findActiveInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 });
  }

  let entraId: string;
  try {
    const created = await createExternalPasswordUser({
      email: invitation.email,
      password,
      displayName: invitation.displayName,
    });
    entraId = created.entraId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[signup/password] createExternalPasswordUser failed:", msg);
    // Surface common cases without leaking secrets
    const conflict = msg.includes("\"code\":\"ObjectConflict\"") || msg.includes("already exists");
    const weakPassword = msg.includes("password complexity") || msg.includes("PasswordPolicy") || msg.includes("does not comply");
    if (weakPassword) {
      return NextResponse.json(
        { error: "Password does not meet complexity requirements. Use at least 8 characters with a mix of uppercase, lowercase, numbers, and symbols, and avoid common words." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: conflict
          ? "An account with this email already exists. Try signing in instead."
          : "Could not create account. Please try again or contact support.",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: conflict ? 409 : 500 }
    );
  }

  const user = await createUserFromSignup({
    invitation,
    entraId,
    email: invitation.email,
    displayName: invitation.displayName,
    authType: "password",
  });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  await createSession(user.id, ip, ua);
  await audit({
    userId: user.id,
    action: "signup.complete",
    resourceType: "user",
    resourceId: user.id,
    detail: { authType: "password", invitationId: invitation.id },
    request,
  });

  return NextResponse.json({ success: true, redirectTo: "/" });
}
