# Task 55 — Security Headers, CSP, Rate Limiting, CSRF

## Goal
Add security hardening: Content Security Policy, security headers, rate limiting on auth/API routes, and CSRF protection.

## Files to Create / Modify
- `src/middleware.ts` — **MODIFY** (add security headers + rate limiting)
- `src/lib/security/rate-limit.ts` — in-memory rate limiter
- `next.config.ts` — **MODIFY** (add security headers)

## Dependencies
- Tasks 15 (middleware) — extend existing middleware

## Implementation

### 1. Create `src/lib/security/rate-limit.ts`

Simple in-memory sliding window rate limiter (good for single-instance App Service).

```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a key.
 *
 * @param key - Unique key (e.g., IP + route)
 * @param maxRequests - Max requests per window
 * @param windowMs - Window in milliseconds
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
```

### 2. Modify `src/middleware.ts`

Add security headers and rate limiting to existing auth middleware.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self';",
};

// Rate limit configs
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/auth/login": { max: 10, windowMs: 60_000 },    // 10 per minute
  "/api/auth/callback": { max: 20, windowMs: 60_000 },  // 20 per minute
  "/api/fax/send": { max: 30, windowMs: 60_000 },       // 30 per minute
};

export function middleware(request: NextRequest) {
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

  // Auth check for protected routes (from task 15)
  if (pathname.startsWith("/api/") || pathname.startsWith("/(portal)")) {
    // ... existing auth middleware from task 15 ...
    // Keep the session validation logic from task 15 here
  }

  // Build response with security headers
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### 3. Modify `next.config.ts`

Add additional headers.

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... existing config from task 00 ...

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

## CSRF Protection

For state-changing API routes (POST, PUT, DELETE), add origin check:

```typescript
// Add to middleware.ts before processing state-changing requests:
if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (pathname.startsWith("/api/") && origin) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return new NextResponse(JSON.stringify({ error: "CSRF validation failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
}
```

## Verify
- `npm run build` — no errors
- Response headers include all security headers
- Login endpoint returns 429 after 10 rapid requests
- Cross-origin POST to API routes returns 403

## Notes
- In-memory rate limiter is fine for single App Service instance
- For multi-instance, use Redis or Azure Cache (future enhancement)
- CSP `unsafe-inline` + `unsafe-eval` needed for Next.js — tighten with nonces in future
- `Strict-Transport-Security` only matters when behind HTTPS (Azure App Service handles this)
