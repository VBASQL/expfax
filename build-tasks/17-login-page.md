# Task 17 — Login Page

## Goal
Build the custom login page with username/password form and "Sign in with Microsoft" button.

## Files to Create
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/layout.tsx`
- `src/app/api/auth/microsoft/route.ts`

## Design Reference
- Clean, centered login card on a subtle background
- Portal logo + "ExpFax" branding at top
- Email + Password fields
- "Sign In" primary button
- Divider with "or"
- "Sign in with Microsoft" secondary button
- Error message display area

## Implementation

### 1. Create `src/app/(auth)/layout.tsx`

Simple layout for auth pages — no sidebar.

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
```

### 2. Create `src/app/(auth)/login/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = searchParams.get("callbackUrl") || "/";

  // Map error codes from OAuth callback
  const errorFromParams = searchParams.get("error");
  const errorMessages: Record<string, string> = {
    not_linked: "Your Microsoft account is not linked to a portal account. Contact your administrator.",
    auth_failed: "Authentication failed. Please try again.",
    no_code: "Authentication was cancelled.",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Login failed");
        return;
      }

      router.push(callbackUrl);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  function handleMicrosoftLogin() {
    window.location.href = "/api/auth/microsoft";
  }

  return (
    <Card className="w-full max-w-md shadow-lg border-slate-200">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-lg">
          EF
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">ExpFax Portal</h1>
        <p className="text-sm text-slate-500">Sign in to manage your faxes</p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error display */}
        {(error || errorFromParams) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error || errorMessages[errorFromParams!] || "An error occurred"}
          </div>
        )}

        {/* Username/Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-400">or</span>
          </div>
        </div>

        {/* Microsoft login */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleMicrosoftLogin}
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          Sign in with Microsoft
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 3. Create `src/app/api/auth/microsoft/route.ts`

Generates the Entra ID authorization URL and redirects.

```typescript
import { NextResponse } from "next/server";
import { generateState } from "arctic";
import { getEntraClient } from "@/lib/auth/entra";

export async function GET() {
  const state = generateState();
  const entra = await getEntraClient();

  const url = entra.createAuthorizationURL(state, ["openid", "profile", "email"]);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("entra_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
```

## Verify
- `npm run build` — no errors
- `/login` shows the login card with email, password, and Microsoft button
- Submitting the form calls `/api/auth/login`
- "Sign in with Microsoft" redirects to Entra ID
