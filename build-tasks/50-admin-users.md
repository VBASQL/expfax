# Task 50 — Admin: User Management Page

## Goal
Build admin page to manage users: list all users, link/unlink Entra users to FaxBack accounts, view status, navigate to per-user email config.

## Files to Create
- `src/app/(portal)/admin/users/page.tsx`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[userId]/link/route.ts`

## Dependencies
- `src/lib/faxback/accounts.ts` (task 24) — `listFaxBackAccounts()`
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Design
- Table: Display Name, Email, FaxBack Account ID, Role, Email Config status, Last Login
- Actions per user: Link FaxBack Account, Edit Role, Email Config (→ task 47)
- Ability to create new FaxBack account via `CreateAccount`

## Implementation

### 1. Create `src/app/api/admin/users/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const container = await containers.users();
  const { resources } = await container.items
    .query("SELECT * FROM c WHERE NOT IS_DEFINED(c.type) ORDER BY c.displayName")
    .fetchAll();

  return NextResponse.json({ items: resources });
}
```

### 2. Create `src/app/api/admin/users/[userId]/link/route.ts`

Link a user to a FaxBack account.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { faxbackAccountId, faxbackAccountGuid, faxNumber, role } = await request.json();

  const container = await containers.users();
  const { resource: user } = await container.item(params.userId, params.userId).read();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const patches: Array<{ op: string; path: string; value: any }> = [];
  if (faxbackAccountId !== undefined) patches.push({ op: "set", path: "/faxbackAccountId", value: faxbackAccountId });
  if (faxbackAccountGuid !== undefined) patches.push({ op: "set", path: "/faxbackAccountGuid", value: faxbackAccountGuid });
  if (faxNumber !== undefined) patches.push({ op: "set", path: "/faxNumber", value: faxNumber });
  if (role !== undefined) patches.push({ op: "set", path: "/role", value: role });
  patches.push({ op: "set", path: "/updatedAt", value: new Date().toISOString() });

  await container.item(params.userId, params.userId).patch(patches);

  return NextResponse.json({ success: true });
}
```

### 3. Create `src/app/(portal)/admin/users/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Link2, Shield, Users } from "lucide-react";

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  faxbackAccountId: string | null;
  faxNumber: string | null;
  lastLogin: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [linkDialog, setLinkDialog] = useState<{ userId: string; name: string } | null>(null);
  const [linkAccountId, setLinkAccountId] = useState("");
  const [linkGuid, setLinkGuid] = useState("");
  const [linkFaxNumber, setLinkFaxNumber] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/users").then((r) => r.json()).then((data) => setUsers(data.items || []));
  }

  useEffect(() => { load(); }, []);

  async function handleLink() {
    if (!linkDialog) return;
    setSaving(true);
    await fetch(`/api/admin/users/${linkDialog.userId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faxbackAccountId: linkAccountId || null,
        faxbackAccountGuid: linkGuid || null,
        faxNumber: linkFaxNumber || null,
      }),
    });
    setSaving(false);
    setLinkDialog(null);
    load();
  }

  async function handleRoleToggle(userId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`Change role to ${newRole}?`)) return;
    await fetch(`/api/admin/users/${userId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold">User Management</h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">FaxBack Account</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Role</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Login</th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <p className="text-sm font-medium">{u.displayName}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  {u.faxbackAccountId ? (
                    <div>
                      <p className="text-sm font-mono">{u.faxbackAccountId}</p>
                      {u.faxNumber && <p className="text-xs text-slate-400">{u.faxNumber}</p>}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 text-[10px]">Not linked</Badge>
                  )}
                </td>
                <td className="px-5 py-3">
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px] cursor-pointer"
                    onClick={() => handleRoleToggle(u.id, u.role)}>
                    <Shield className="h-3 w-3 mr-1" /> {u.role}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-sm text-slate-400">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm"
                      onClick={() => { setLinkDialog({ userId: u.id, name: u.displayName }); setLinkAccountId(u.faxbackAccountId || ""); setLinkFaxNumber(u.faxNumber || ""); }}>
                      <Link2 className="h-4 w-4 mr-1" /> Link
                    </Button>
                    {u.faxbackAccountId && (
                      <Link href={`/admin/users/${u.id}/email`}>
                        <Button variant="ghost" size="sm">
                          <Mail className="h-4 w-4 mr-1" /> Email
                        </Button>
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Link Dialog */}
      <Dialog open={!!linkDialog} onOpenChange={() => setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link FaxBack Account — {linkDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>FaxBack Account ID</Label>
              <Input value={linkAccountId} onChange={(e) => setLinkAccountId(e.target.value)} placeholder="e.g., 12345" />
            </div>
            <div className="space-y-2">
              <Label>FaxBack Account GUID</Label>
              <Input value={linkGuid} onChange={(e) => setLinkGuid(e.target.value)} placeholder="GUID from FaxBack" />
            </div>
            <div className="space-y-2">
              <Label>Fax Number</Label>
              <Input value={linkFaxNumber} onChange={(e) => setLinkFaxNumber(e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancel</Button>
            <Button onClick={handleLink} disabled={saving}>{saving ? "Saving..." : "Link Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/admin/users` shows user table with link, role, email config actions
- Email Config button links to task 47 page
