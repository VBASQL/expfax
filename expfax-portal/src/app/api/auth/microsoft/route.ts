import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { getEntraClient } from "@/lib/auth/entra";

export async function GET() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const entra = await getEntraClient();

  const url = entra.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("entra_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("entra_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
