# Task 47 — Admin: Per-Customer Email Configuration

## Goal
Build an admin page section where admins configure email-to-fax (inbound) and fax-to-email (outbound) routing per customer account.

## ⚠️ NEW FEATURE — Not in original design doc

## Files to Create
- `src/app/(portal)/admin/users/[userId]/email/page.tsx`
- `src/app/api/admin/users/[userId]/email/route.ts`

## Dependencies
- `src/lib/faxback/accounts.ts` (task 24) — `getAccountEmailSettings()`, `updateEmailConfig()`
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Feature Details

### Inbound (Email → Fax)
- Admin assigns an email alias like `customer@faxdomain.com` via `CreateEmailAlias`
- When someone emails that address, FaxBack gateway sends it as a fax from that account
- `UseCoverPage` controls whether email-originated faxes get a cover page

### Outbound (Received Fax → Email)
- Admin sets up `QueueProfileXml` via `ModifyAccount`:
  - Delivery email address
  - Attachment format (PDF or TIF)
  - Delivery/non-delivery notifications

## Implementation

### 1. Create `src/app/api/admin/users/[userId]/email/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getAccountEmailSettings, updateEmailConfig } from "@/lib/faxback/accounts";
import type { User } from "@/types";

// GET: Read current email config for a user
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const usersContainer = await containers.users();
  const { resource: user } = await usersContainer.item(params.userId, params.userId).read<User>();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.faxbackAccountGuid) {
    return NextResponse.json({ error: "User has no linked FaxBack account" }, { status: 400 });
  }

  const settings = await getAccountEmailSettings(user.faxbackAccountGuid);

  return NextResponse.json({
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    faxbackAccountId: user.faxbackAccountId,
    emailSettings: settings,
  });
}

// PUT: Update email config for a user
export async function PUT(request: NextRequest, { params }: { params: { userId: string } }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const usersContainer = await containers.users();
  const { resource: user } = await usersContainer.item(params.userId, params.userId).read<User>();
  if (!user || !user.faxbackAccountGuid) {
    return NextResponse.json({ error: "User not found or no FaxBack account" }, { status: 404 });
  }

  const body = await request.json();

  try {
    await updateEmailConfig({
      accountGuid: user.faxbackAccountGuid,
      inboundAlias: body.inboundAlias || null,
      outbound: body.outbound
        ? {
            deliveryEmail: body.outbound.deliveryEmail,
            attachmentFormat: body.outbound.attachmentFormat || "pdf",
            deliveryNotification: body.outbound.deliveryNotification ?? true,
            nonDeliveryNotification: body.outbound.nonDeliveryNotification ?? true,
          }
        : null,
      useCoverPage: body.useCoverPage ?? false,
      emailCoverType: body.emailCoverType,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Email config update error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### 2. Create `src/app/(portal)/admin/users/[userId]/email/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Mail, Send, Inbox, Save } from "lucide-react";

interface EmailSettings {
  inbound: { emailAlias: string } | null;
  outbound: {
    deliveryEmail: string;
    attachmentFormat: "pdf" | "tif";
    deliveryNotification: boolean;
    nonDeliveryNotification: boolean;
  } | null;
  useCoverPage: boolean;
  emailCoverType: number;
}

export default function EmailConfigPage() {
  const { userId } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [userName, setUserName] = useState("");
  const [accountId, setAccountId] = useState("");

  // Inbound
  const [enableInbound, setEnableInbound] = useState(false);
  const [inboundAlias, setInboundAlias] = useState("");

  // Outbound
  const [enableOutbound, setEnableOutbound] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [attachmentFormat, setAttachmentFormat] = useState<"pdf" | "tif">("pdf");
  const [deliveryNotification, setDeliveryNotification] = useState(true);
  const [nonDeliveryNotification, setNonDeliveryNotification] = useState(true);

  // Cover page
  const [useCoverPage, setUseCoverPage] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/email`)
      .then((r) => r.json())
      .then((data) => {
        setUserName(data.displayName);
        setAccountId(data.faxbackAccountId);

        const s: EmailSettings = data.emailSettings;
        if (s.inbound) {
          setEnableInbound(true);
          setInboundAlias(s.inbound.emailAlias);
        }
        if (s.outbound) {
          setEnableOutbound(true);
          setDeliveryEmail(s.outbound.deliveryEmail);
          setAttachmentFormat(s.outbound.attachmentFormat);
          setDeliveryNotification(s.outbound.deliveryNotification);
          setNonDeliveryNotification(s.outbound.nonDeliveryNotification);
        }
        setUseCoverPage(s.useCoverPage);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleSave() {
    setError("");
    setSuccess(false);
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}/email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inboundAlias: enableInbound ? inboundAlias : null,
          outbound: enableOutbound
            ? { deliveryEmail, attachmentFormat, deliveryNotification, nonDeliveryNotification }
            : null,
          useCoverPage,
        }),
      });

      const data = await res.json();
      if (!data.success) { setError(data.error || "Failed to save"); return; }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Email Configuration</h2>
          <p className="text-sm text-slate-400">{userName} — Account: {accountId}</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">Settings saved successfully!</div>}

      {/* Inbound: Email → Fax */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm">Inbound: Email → Fax</CardTitle>
            </div>
            <Switch checked={enableInbound} onCheckedChange={setEnableInbound} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Assign an email address. Emails sent to it become faxes from this account.
          </p>
        </CardHeader>
        {enableInbound && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email Alias</Label>
              <Input
                placeholder="customer@faxdomain.com"
                value={inboundAlias}
                onChange={(e) => setInboundAlias(e.target.value)}
              />
              <p className="text-xs text-slate-400">This email will be created on the FaxBack gateway</p>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Use cover page for email faxes</Label>
              <Switch checked={useCoverPage} onCheckedChange={setUseCoverPage} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Outbound: Fax → Email */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm">Outbound: Received Fax → Email</CardTitle>
            </div>
            <Switch checked={enableOutbound} onCheckedChange={setEnableOutbound} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Auto-forward received faxes to an email address as PDF/TIF attachments.
          </p>
        </CardHeader>
        {enableOutbound && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Delivery Email Address</Label>
              <Input
                type="email"
                placeholder="user@company.com"
                value={deliveryEmail}
                onChange={(e) => setDeliveryEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Attachment Format</Label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                value={attachmentFormat}
                onChange={(e) => setAttachmentFormat(e.target.value as "pdf" | "tif")}
              >
                <option value="pdf">PDF (recommended)</option>
                <option value="tif">TIF</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Delivery notification (success)</Label>
              <Switch checked={deliveryNotification} onCheckedChange={setDeliveryNotification} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Non-delivery notification (failure)</Label>
              <Switch checked={nonDeliveryNotification} onCheckedChange={setNonDeliveryNotification} />
            </div>
          </CardContent>
        )}
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Saving..." : "Save Email Configuration"}
      </Button>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/admin/users/{userId}/email` shows inbound + outbound email config
- Save calls FaxBack `CreateEmailAlias` / `ModifyAccount` / `ModifyAccount(cover page)`

## Notes
- Only admins can access this page (role check in API route)
- Task 50 (admin users page) should add an "Email Config" button per user row that links here
- The `updateEmailConfig()` function handles create/update/delete logic for aliases and routing
