"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, KeyRound, AlertTriangle, Check, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";

interface InvitationInfo {
  valid: boolean;
  email?: string;
  displayName?: string;
  expiresAt?: string;
}

const ERRORS: Record<string, string> = {
  invalid_token: "This signup link is invalid, expired, or already used.",
  auth_failed: "Sign-in failed. Please try the link again.",
  email_mismatch:
    "You signed in with a different account than the one this invitation was sent to. Use the invited email address.",
};

function checkPassword(pw: string) {
  const classes = {
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  const classesMet = Number(classes.upper) + Number(classes.lower) + Number(classes.digit) + Number(classes.symbol);
  return {
    length: pw.length >= 8,
    classes,
    classesMet,
    classesOk: classesMet >= 3,
  };
}

function passwordMeetsAll(pw: string): boolean {
  const c = checkPassword(pw);
  return c.length && c.classesOk;
}

function SignupInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const errKey = params.get("error");

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setInfo({ valid: false });
      setLoading(false);
      return;
    }
    fetch(`/api/auth/signup/check?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : { valid: false }))
      .then((data) => setInfo(data))
      .catch(() => setInfo({ valid: false }))
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (!passwordMeetsAll(password)) {
      setPwError("Password doesn't meet all requirements.");
      return;
    }
    if (password !== confirm) {
      setPwError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error ?? "Signup failed.");
        return;
      }
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardContent className="py-10 text-center text-sm text-slate-500">Loading…</CardContent>
      </Card>
    );
  }

  if (!info?.valid) {
    return (
      <Card className="w-full max-w-md shadow-lg border-slate-200">
        <CardHeader>
          <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-center">Invalid invitation</h1>
        </CardHeader>
        <CardContent className="text-center text-sm text-slate-500">
          {ERRORS[errKey ?? ""] ??
            "This signup link is invalid, expired, or already used. Please contact your administrator for a new invitation."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl shadow-lg border-slate-200">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-3">
          <Logo height={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to ExpFax</h1>
        <p className="text-sm text-slate-500">
          Set up sign-in for <span className="font-medium">{info.email}</span>
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {errKey && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {ERRORS[errKey] ?? "An error occurred."}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Microsoft option */}
          <div className="border border-slate-200 rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold">Use a Microsoft account</h2>
            </div>
            <p className="text-sm text-slate-500 flex-1">
              Recommended if you already use Microsoft for email or other apps, or if you want
              optional multi-factor authentication. You&apos;ll sign in with your Microsoft work,
              school, or personal account.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                window.location.href = `/api/auth/signup/microsoft?token=${encodeURIComponent(
                  token
                )}`;
              }}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              Continue with Microsoft
            </Button>
          </div>

          {/* Password option */}
          <div className="border border-slate-200 rounded-xl p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="h-5 w-5 text-slate-600" />
              <h2 className="font-semibold">Use email + password</h2>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Sign in with just your email and a password. No Microsoft account needed.
            </p>
            <form onSubmit={handlePasswordSubmit} className="space-y-3 flex-1 flex flex-col">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={info.email ?? ""} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                />
              </div>
              <PasswordChecklist password={password} confirm={confirm} />
              <div className="space-y-2">
                <Label>Confirm</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {pwError && (
                <p className="text-xs text-red-600">{pwError}</p>
              )}
              <Button type="submit" className="mt-auto" disabled={submitting || !passwordMeetsAll(password) || password !== confirm}>
                {submitting ? "Creating…" : "Create account"}
              </Button>
            </form>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Invitation expires {info.expiresAt ? new Date(info.expiresAt).toLocaleString() : ""}.
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  );
}

function PasswordChecklist({ password, confirm }: { password: string; confirm: string }) {
  const c = checkPassword(password);
  const match = password.length > 0 && password === confirm;
  return (
    <ul className="text-xs space-y-1">
      <Item ok={c.length} label="At least 8 characters" />
      <Item ok={c.classesOk} label={`Mix 3 of: uppercase, lowercase, number, symbol (${c.classesMet}/4)`} />
      <Item ok={match} label="Passwords match" />
      <li className="text-slate-400 pl-5 text-[11px]">Avoid common words like &quot;password&quot; or your name.</li>
    </ul>
  );
}

function Item({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-emerald-600" : "text-slate-400"}`}>
      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </li>
  );
}
