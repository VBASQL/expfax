import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";
import {
  createInvitation,
  listInvitations,
} from "@/lib/auth/invitations";
import { getConfig } from "@/lib/config";
import { isMailerConfigured, sendInvitationEmail } from "@/lib/services/mailer";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const items = await listInvitations();
  // Never leak token hashes to client.
  const sanitized = items.map(({ tokenHash: _ignore, ...rest }) => rest);
  return NextResponse.json({ items: sanitized });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: {
    email?: string;
    displayName?: string;
    initialFaxbackAccountId?: string;
    initialFaxbackAccountGuid?: string;
    initialFaxNumber?: string;
    initialPurgeDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }

  const { invitation, rawToken } = await createInvitation({
    email,
    displayName,
    createdBy: user.id,
    initialFaxbackAccountId: body.initialFaxbackAccountId ?? null,
    initialFaxbackAccountGuid: body.initialFaxbackAccountGuid ?? null,
    initialFaxNumber: body.initialFaxNumber ?? null,
    initialPurgeDays:
      typeof body.initialPurgeDays === "number" ? body.initialPurgeDays : null,
  });

  await audit({
    userId: user.id,
    action: "admin.invitation_create",
    resourceType: "invitation",
    resourceId: invitation.id,
    detail: { email },
    request,
  });

  const config = await getConfig();
  const url = `${config.appUrl}/signup?token=${rawToken}`;

  let emailed = false;
  let emailError: string | null = null;
  if (isMailerConfigured()) {
    try {
      emailed = await sendInvitationEmail({
        to: invitation.email,
        displayName: invitation.displayName,
        signupUrl: url,
        expiresAt: invitation.expiresAt,
        inviterName: user.displayName,
      });
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Failed to send email";
      console.error("Invitation email send failed:", err);
    }
  }

  return NextResponse.json({
    id: invitation.id,
    email: invitation.email,
    displayName: invitation.displayName,
    expiresAt: invitation.expiresAt,
    status: invitation.status,
    /** One-shot URL — never returned again. Admin must copy now. */
    signupUrl: url,
    emailed,
    emailError,
  });
}
