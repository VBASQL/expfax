import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' data: blob:; frame-ancestors 'self'; form-action 'self';",
};

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/auth/login": { max: 10, windowMs: 60_000 },
  "/api/auth/callback": { max: 20, windowMs: 60_000 },
  "/api/fax/send": { max: 30, windowMs: 60_000 },
};

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/api/auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Rate limiting for specific routes
  for (const [route, config] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(route)) {
      const result = checkRateLimit(`${ip}:${route}`, config.max, config.windowMs);
      if (!result.allowed) {
        return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(config.max),
            "X-RateLimit-Remaining": "0",
          },
        });
      }
    }
  }

  // CSRF protection for state-changing API requests
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (pathname.startsWith("/api/") && origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          const csrfResponse = new NextResponse(JSON.stringify({ error: "CSRF validation failed" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
          return applySecurityHeaders(csrfResponse);
        }
      } catch {
        // Invalid origin URL — reject
        const csrfResponse = new NextResponse(JSON.stringify({ error: "CSRF validation failed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
        return applySecurityHeaders(csrfResponse);
      }
    }
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  // NOTE: Full session validation (Cosmos DB lookup) happens in the
  // page/API route itself. Middleware only checks cookie existence
  // for performance (middleware runs on every request on the edge).
  // If the session is actually expired, the page will redirect.
  const sessionToken = request.cookies.get("expfax_session")?.value;

  if (!sessionToken) {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return applySecurityHeaders(response);
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next({
    request: {
      headers: (() => {
        const h = new Headers(request.headers);
        h.set("x-pathname", pathname);
        return h;
      })(),
    },
  });
  // Also expose on response for parity.
  response.headers.set("x-pathname", pathname);
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
