import { NextRequest, NextResponse } from "next/server";
import { getEntraClient, getExternalEntraClient, findUserByEntraId } from "@/lib/auth/entra";
import { createSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { getInvitation } from "@/lib/auth/invitations";
import { createUserFromSignup } from "@/lib/auth/users";
import { audit } from "@/lib/audit/logger";

export async function GET(request: NextRequest) {
  const config = await getConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${config.appUrl}/login?error=no_code`);
  }

  const signupInvitationId = request.cookies.get("entra_signup_invitation")?.value ?? "";
  const tenantKind = request.cookies.get("entra_tenant_kind")?.value ?? "";

  try {
    // Choose client based on which flow started the round-trip.
    const entra = tenantKind === "external" || signupInvitationId
      ? await getExternalEntraClient()
      : await getEntraClient();
    const codeVerifier = request.cookies.get("entra_code_verifier")?.value ?? "";
    const tokens = await entra.validateAuthorizationCode(code, codeVerifier);

    // Decode ID token to get user info
    const idToken = tokens.idToken();
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString()
    );

    const entraId = payload.oid || payload.sub;
    const claimedEmail =
      payload.preferred_username || payload.email || payload.upn || "";
    const claimedName = payload.name || claimedEmail.split("@")[0] || "User";

    // Signup branch: materialize a User from the invitation.
    if (signupInvitationId) {
      const invitation = await getInvitation(signupInvitationId);
      if (!invitation || invitation.status !== "pending") {
        return clearSignupCookies(
          NextResponse.redirect(`${config.appUrl}/signup?error=invalid_token`)
        );
      }

      // Sanity: make sure the email the user authenticated as matches the
      // invited email (case-insensitive). If it doesn't, refuse — prevents
      // a wrong-account-on-the-machine scenario.
      if (
        claimedEmail &&
        claimedEmail.toLowerCase() !== invitation.email.toLowerCase()
      ) {
        return clearSignupCookies(
          NextResponse.redirect(
            `${config.appUrl}/signup?token=${encodeURIComponent("")}&error=email_mismatch`
          )
        );
      }

      const user = await createUserFromSignup({
        invitation,
        entraId,
        email: invitation.email,
        displayName: claimedName,
        authType: "microsoft",
      });

      const ip = request.headers.get("x-forwarded-for") || "unknown";
      const ua = request.headers.get("user-agent") || "unknown";
      const token = await createSession(user.id, ip, ua);
      await audit({
        userId: user.id,
        action: "signup.complete",
        resourceType: "user",
        resourceId: user.id,
        detail: { authType: "microsoft", invitationId: invitation.id },
        request,
      });

      const res = clearSignupCookies(NextResponse.redirect(config.appUrl));
      res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
      return res;
    }

    // Normal login branch.
    const user = await findUserByEntraId(entraId);

    if (!user) {
      return NextResponse.redirect(`${config.appUrl}/login?error=not_linked`);
    }

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const token = await createSession(user.id, ip, ua);

    const landing = user.role === "admin" ? "/admin/users" : "/";
    const res = NextResponse.redirect(`${config.appUrl}${landing}`);
    res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (error) {
    console.error("OAuth callback error:", error);
    if (signupInvitationId) {
      return clearSignupCookies(
        NextResponse.redirect(`${config.appUrl}/signup?error=auth_failed`)
      );
    }
    return NextResponse.redirect(`${config.appUrl}/login?error=auth_failed`);
  }
}

function clearSignupCookies(response: NextResponse): NextResponse {
  response.cookies.delete("entra_signup_invitation");
  response.cookies.delete("entra_oauth_state");
  response.cookies.delete("entra_code_verifier");
  response.cookies.delete("entra_tenant_kind");
  return response;
}
