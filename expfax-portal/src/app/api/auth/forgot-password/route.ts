import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { getExternalEntraClient } from "@/lib/auth/entra";

/**
 * "Forgot password?" entrypoint for password-auth users.
 *
 * Hands the user off to the External ID (CIAM) hosted sign-in page. When the
 * tenant's user flow has Self-Service Password Reset enabled, that page shows
 * Microsoft's built-in "Forgot your password?" link, which runs the entire
 * reset flow (email verification + new password) on Microsoft's side.
 *
 * After the user signs in with their new password on the hosted page, the
 * standard /api/auth/callback handler picks up the code, finds the portal
 * User by entraId, and creates a session — the same path used by Microsoft
 * sign-in. No portal-side reset state to manage.
 *
 * Required tenant config (External ID admin center):
 *   - User flow: enable "Self-service password reset" on the email + password
 *     sign-in user flow used by this client.
 */
export async function GET() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const entra = await getExternalEntraClient();

  const url = entra.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
  ]);

  // prompt=login forces the hosted page to ignore any existing cookie session
  // so the user always lands on the sign-in screen (where the SSPR link lives)
  // rather than being silently signed back in.
  url.searchParams.set("prompt", "login");

  const response = NextResponse.redirect(url.toString());

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };

  response.cookies.set("entra_oauth_state", state, cookieOpts);
  response.cookies.set("entra_code_verifier", codeVerifier, cookieOpts);
  // Tells the shared callback to validate the code against the External tenant.
  response.cookies.set("entra_tenant_kind", "external", cookieOpts);

  return response;
}
