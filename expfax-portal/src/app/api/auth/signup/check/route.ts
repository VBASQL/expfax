import { NextResponse } from "next/server";
import { findActiveInvitationByToken } from "@/lib/auth/invitations";

/** Public — used by the signup page to validate a token without exposing the hash. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const invitation = await findActiveInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }
  return NextResponse.json({
    valid: true,
    email: invitation.email,
    displayName: invitation.displayName,
    expiresAt: invitation.expiresAt,
  });
}
