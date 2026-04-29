import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";
import { resendInvitation } from "@/lib/auth/invitations";
import { getConfig } from "@/lib/config";
import { isMailerConfigured, sendInvitationEmail } from "@/lib/services/mailer";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const result = await resendInvitation(id);
  if (!result) {
    return NextResponse.json(
      { error: "Invitation not found or already completed/revoked" },
      { status: 404 }
    );
  }

  await audit({
    userId: user.id,
    action: "admin.invitation_resend",
    resourceType: "invitation",
    resourceId: id,
    detail: { email: result.invitation.email },
    request,
  });

  const config = await getConfig();
  const signupUrl = `${config.appUrl}/signup?token=${result.rawToken}`;

  let emailed = false;
  let emailError: string | null = null;
  if (isMailerConfigured()) {
    try {
      emailed = await sendInvitationEmail({
        to: result.invitation.email,
        displayName: result.invitation.displayName,
        signupUrl,
        expiresAt: result.invitation.expiresAt,
        inviterName: user.displayName,
      });
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Failed to send email";
      console.error("Invitation resend email failed:", err);
    }
  }

  return NextResponse.json({
    id: result.invitation.id,
    expiresAt: result.invitation.expiresAt,
    signupUrl,
    emailed,
    emailError,
  });
}
