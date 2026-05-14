import { NextRequest, NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { getCommonEntraClient } from "@/lib/auth/entra";
import { findActiveInvitationByToken } from "@/lib/auth/invitations";
import { getConfig } from "@/lib/config";

/**
 * Start a Microsoft signup flow tied to a one-shot invitation token.
 * Sets a short-lived cookie carrying the invitation id; the callback
 * uses that to materialize the user.
 *
 * Uses the multitenant /common endpoint — the user signs in with their
 * EXISTING Microsoft account (personal / work / school) and we never create
 * a shadow user in our CIAM tenant. The callback enforces email match.
 */
export async function GET(request: NextRequest) {
  const config = await getConfig();
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  const invitation = await findActiveInvitationByToken(token);
  if (!invitation) {
    return NextResponse.redirect(`${config.appUrl}/signup?error=invalid_token`);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const entra = await getCommonEntraClient();
  const authUrl = entra.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
  // Pre-fill the invited email so the user lands on the right account picker.
  authUrl.searchParams.set("login_hint", invitation.email);
  // Force a fresh account chooser so a stale logged-in account isn't reused.
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };
  response.cookies.set("entra_oauth_state", state, cookieOpts);
  response.cookies.set("entra_code_verifier", codeVerifier, cookieOpts);
  // Tag this OAuth round-trip as a customer signup against /common.
  response.cookies.set("entra_signup_invitation", invitation.id, cookieOpts);
  response.cookies.set("entra_tenant_kind", "common", cookieOpts);
  return response;
}
