# Task 53 — User Settings / Preferences Page

## Goal
Build a user settings page for personal preferences: notification settings, display preferences, default cover template.

## Files to Create
- `src/app/(portal)/settings/page.tsx`
- `src/app/api/settings/route.ts`

## Dependencies
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Design
- Profile section (display name, email — read-only from Entra)
- Notification preferences (email on fax received, email on send complete)
- Default cover template selection
- Display preferences (items per page, timezone)
- Password change link (redirects to Entra)

## Implementation

### 1. Create `src/app/api/settings/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Settings stored directly on the user document
  return NextResponse.json({
    displayName: user.displayName,
    email: user.email,
    faxNumber: user.faxNumber,
    preferences: user.preferences || {
      notifyOnReceive: true,
      notifyOnSendComplete: false,
      defaultCoverTemplate: null,
      itemsPerPage: 20,
      timezone: "America/New_York",
    },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const container = await containers.users();

  await container.item(user.id, user.id).patch([
    {
      op: "set",
      path: "/preferences",
      value: {
        notifyOnReceive: body.notifyOnReceive ?? true,
        notifyOnSendComplete: body.notifyOnSendComplete ?? false,
        defaultCoverTemplate: body.defaultCoverTemplate || null,
        itemsPerPage: body.itemsPerPage || 20,
        timezone: body.timezone || "America/New_York",
      },
    },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
```

### 2. Create `src/app/(portal)/settings/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Save, User, Bell, Palette } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [faxNumber, setFaxNumber] = useState("");
  const [notifyOnReceive, setNotifyOnReceive] = useState(true);
  const [notifyOnSendComplete, setNotifyOnSendComplete] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [timezone, setTimezone] = useState("America/New_York");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setDisplayName(data.displayName);
        setEmail(data.email);
        setFaxNumber(data.faxNumber || "");
        const p = data.preferences;
        setNotifyOnReceive(p.notifyOnReceive);
        setNotifyOnSendComplete(p.notifyOnSendComplete);
        setItemsPerPage(p.itemsPerPage);
        setTimezone(p.timezone);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyOnReceive, notifyOnSendComplete, itemsPerPage, timezone }),
    });
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">Settings saved!</div>}

      {/* Profile (read-only) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm">Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Display Name</Label>
              <Input value={displayName} disabled className="bg-slate-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Email</Label>
              <Input value={email} disabled className="bg-slate-50" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Fax Number</Label>
            <Input value={faxNumber} disabled className="bg-slate-50" />
          </div>
          <p className="text-xs text-slate-400">Profile information is managed by your administrator.</p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm">Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">New fax received</p>
              <p className="text-xs text-slate-400">Get notified when a new fax arrives</p>
            </div>
            <Switch checked={notifyOnReceive} onCheckedChange={setNotifyOnReceive} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Send complete</p>
              <p className="text-xs text-slate-400">Get notified when a fax is successfully sent</p>
            </div>
            <Switch checked={notifyOnSendComplete} onCheckedChange={setNotifyOnSendComplete} />
          </div>
        </CardContent>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm">Display</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Items per page</Label>
              <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={itemsPerPage} onChange={(e) => setItemsPerPage(parseInt(e.target.value))}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/settings` shows profile, notification, and display settings
