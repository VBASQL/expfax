"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorFromParams = searchParams.get("error");
  const errorMessages: Record<string, string> = {
    not_linked:
      "Your Microsoft account is not linked to a portal account. Contact your administrator.",
    auth_failed: "Authentication failed. Please try again.",
    no_code: "Authentication was cancelled.",
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"email" | "password">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.action === "redirect" && data.url) {
        window.location.href = data.url;
        return;
      }
      setStage("password");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
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
        <div className="flex justify-center mb-4">
          <Logo height={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">ExpFax Portal</h1>
        <p className="text-sm text-slate-500">Sign in to manage your faxes</p>
      </CardHeader>

      <CardContent className="space-y-6">
        {(error || errorFromParams) && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error || errorMessages[errorFromParams!] || "An error occurred"}
          </div>
        )}

        {stage === "email" ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Checking…" : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} readOnly disabled />
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
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/auth/forgot-password";
              }}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline w-full text-center"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("email");
                setPassword("");
                setError("");
              }}
              className="text-xs text-slate-500 hover:text-slate-700 w-full text-center"
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-400">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleMicrosoftLogin}>
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
