import { NextRequest, NextResponse } from "next/server";
import { authenticateWithPassword, findUserByEntraId, PasswordAuthError } from "@/lib/auth/entra";
import { createSession } from "@/lib/auth/session";

/**
 * Map Native Authentication API error codes (and legacy AADSTS codes) to
 * actionable end-user copy.
 *
 * Native auth errors: https://learn.microsoft.com/en-us/entra/identity-platform/reference-native-authentication-api
 */
function mapAuthError(err: PasswordAuthError): { message: string; status: number } {
  const code = err.code;
  const desc = err.description;

  // ── Native Auth API codes ──────────────────────────────────────────────────
  if (code === "user_not_found") {
    return { message: "No account found with that email.", status: 401 };
  }
  if (code === "redirect_required") {
    return {
      message: "This account requires browser-based sign-in. Use the Sign in with Microsoft button.",
      status: 401,
    };
  }
  if (code.startsWith("invalid_client")) {
    // suberror "nativeauthapi_disabled" means the app registration is not
    // configured for native auth yet.
    return {
      message: "Sign-in misconfigured. Contact support.",
      status: 500,
    };
  }
  if (code === "invalid_grant" || code.startsWith("invalid_grant/")) {
    // Wrong password or token expired — generic message to avoid leaking info.
    return { message: "Invalid email or password.", status: 401 };
  }

  // ── Legacy AADSTS codes (kept for safety) ─────────────────────────────────
  if (desc.includes("AADSTS50055")) {
    return {
      message: "Your password is expired or must be changed. Use the Forgot password link.",
      status: 401,
    };
  }
  if (desc.includes("AADSTS50057")) {
    return { message: "Your account is disabled. Contact your administrator.", status: 403 };
  }
  if (desc.includes("AADSTS50053") || desc.includes("AADSTS50128")) {
    return {
      message: "Your account is temporarily locked. Try again in a few minutes.",
      status: 429,
    };
  }
  if (desc.includes("AADSTS50034")) {
    return { message: "No account found with that email.", status: 401 };
  }
  if (desc.includes("AADSTS50076") || desc.includes("AADSTS50079") || desc.includes("AADSTS50158")) {
    return {
      message: "This account requires extra verification. Use the Sign in with Microsoft button.",
      status: 401,
    };
  }
  if (desc.includes("AADSTS65001") || desc.includes("AADSTS700016")) {
    return {
      message: "Sign-in misconfigured. Contact support.",
      status: 500,
    };
  }

  return { message: "Invalid email or password.", status: 401 };
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    let entraUser: { entraId: string; email: string; displayName: string } | null = null;
    try {
      entraUser = await authenticateWithPassword(email, password);
    } catch (err) {
      if (err instanceof PasswordAuthError) {
        // Log full Entra detail server-side for forensics.
        console.warn(
          `[login] AADSTS auth failed for ${email}: ${err.code} :: ${err.description}`
        );
        const mapped = mapAuthError(err);
        return NextResponse.json(
          {
            success: false,
            error: mapped.message,
            // Surface raw detail only outside production to aid debugging.
            detail:
              process.env.NODE_ENV === "production"
                ? undefined
                : { code: err.code, description: err.description },
          },
          { status: mapped.status }
        );
      }
      throw err;
    }

    if (!entraUser) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Find linked portal user
    const user = await findUserByEntraId(entraUser.entraId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Your account has not been set up in the portal. Contact your administrator." },
        { status: 403 }
      );
    }

    // Create session
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    await createSession(user.id, ip, ua);

    const redirectTo = user.role === "admin" ? "/admin/users" : "/";
    return NextResponse.json({ success: true, redirectTo });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
