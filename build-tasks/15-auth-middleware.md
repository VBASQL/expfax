# Task 15 — Next.js Middleware for Route Protection

## Goal
Create middleware that protects all portal routes, redirecting unauthenticated users to `/login`.

## Files to Create
- `src/middleware.ts`

## Context
- Public routes: `/login`, `/api/auth/*`
- Protected routes: everything else under `/(portal)/*` and `/api/*`
- Uses session validation from task 13

## Implementation

### Create `src/middleware.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/api/auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
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
  const sessionToken = request.cookies.get("expfax_session")?.value;

  if (!sessionToken) {
    // Redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: Full session validation (Cosmos DB lookup) happens in the
  // page/API route itself. Middleware only checks cookie existence
  // for performance (middleware runs on every request on the edge).
  // If the session is actually expired, the page will redirect.

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

## Verify
- `npm run build` compiles
- Navigating to `/` without a session cookie redirects to `/login`
- Navigating to `/login` works without a cookie
- `/api/auth/login` is accessible without a cookie

## Notes
- This middleware does a lightweight cookie check only — NOT a full DB lookup
- Full session validation occurs in `validateSession()` called by pages/API routes
- This prevents unnecessary Cosmos reads on every static asset request
