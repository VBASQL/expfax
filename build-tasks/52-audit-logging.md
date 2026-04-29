# Task 52 — Audit Logging Service

## Goal
Build the audit log service that records all significant actions (login, fax send/receive, admin changes) to the Cosmos DB `auditLog` container. Plus an admin audit log viewer.

## Files to Create
- `src/lib/audit/logger.ts`
- `src/app/(portal)/admin/audit/page.tsx`
- `src/app/api/admin/audit/route.ts`

## Dependencies
- `src/lib/db/cosmos.ts` (task 11)
- `src/types/index.ts` (task 12) — `AuditLogEntry` type

## Audit Events to Log
- `auth.login` — user login success
- `auth.login_failed` — user login failure
- `auth.logout` — user logout
- `fax.send` — fax submitted
- `fax.received` — fax received and stored
- `fax.delete` — fax deleted
- `fax.abort` — fax aborted
- `admin.user_link` — admin linked user to FaxBack
- `admin.role_change` — admin changed user role
- `admin.email_config` — admin updated email config
- `admin.retention_update` — admin changed retention settings
- `contact.create` / `contact.update` / `contact.delete`

## Implementation

### 1. Create `src/lib/audit/logger.ts`

```typescript
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "fax.send"
  | "fax.received"
  | "fax.delete"
  | "fax.abort"
  | "admin.user_link"
  | "admin.role_change"
  | "admin.email_config"
  | "admin.retention_update"
  | "contact.create"
  | "contact.update"
  | "contact.delete"
  | "template.upload"
  | "template.delete";

interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

/**
 * Write an audit log entry.
 * Call this from API routes after significant actions.
 *
 * @example
 * await audit({
 *   userId: user.id,
 *   action: "fax.send",
 *   resourceType: "fax",
 *   resourceId: fax.id,
 *   detail: { recipients: ["5551234567"], pages: 3 },
 *   request,
 * });
 */
export async function audit(params: {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  try {
    const container = await containers.auditLog();

    const entry: AuditEntry = {
      id: uuid(),
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      detail: params.detail || {},
      ipAddress: params.request?.headers.get("x-forwarded-for") || params.request?.headers.get("x-real-ip") || "unknown",
      userAgent: params.request?.headers.get("user-agent") || "unknown",
      timestamp: new Date().toISOString(),
    };

    await container.items.create(entry);
  } catch (error) {
    // Never let audit failures break the main flow
    console.error("Audit log write failed:", error);
  }
}
```

### 2. Create `src/app/api/admin/audit/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1", 10);
  const pageSize = parseInt(params.get("pageSize") || "50", 10);
  const action = params.get("action");
  const userId = params.get("userId");

  let query = "SELECT * FROM c WHERE 1=1";
  const queryParams: Array<{ name: string; value: string }> = [];

  if (action) {
    query += " AND c.action = @action";
    queryParams.push({ name: "@action", value: action });
  }
  if (userId) {
    query += " AND c.userId = @userId";
    queryParams.push({ name: "@userId", value: userId });
  }

  query += " ORDER BY c.timestamp DESC OFFSET @offset LIMIT @limit";
  queryParams.push({ name: "@offset", value: String((page - 1) * pageSize) });
  queryParams.push({ name: "@limit", value: String(pageSize) });

  const container = await containers.auditLog();
  const { resources } = await container.items.query({ query, parameters: queryParams }).fetchAll();

  // Count
  let countQuery = "SELECT VALUE COUNT(1) FROM c WHERE 1=1";
  const countParams: Array<{ name: string; value: string }> = [];
  if (action) { countQuery += " AND c.action = @action"; countParams.push({ name: "@action", value: action }); }
  if (userId) { countQuery += " AND c.userId = @userId"; countParams.push({ name: "@userId", value: userId }); }

  const { resources: countResult } = await container.items.query({ query: countQuery, parameters: countParams }).fetchAll();
  const total = countResult[0] || 0;

  return NextResponse.json({ items: resources, total, page, pageSize });
}
```

### 3. Create `src/app/(portal)/admin/audit/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

const actionColors: Record<string, string> = {
  "auth.login": "bg-emerald-50 text-emerald-700",
  "auth.login_failed": "bg-red-50 text-red-700",
  "fax.send": "bg-blue-50 text-blue-700",
  "fax.received": "bg-purple-50 text-purple-700",
  "fax.delete": "bg-red-50 text-red-700",
  "admin.user_link": "bg-amber-50 text-amber-700",
  "admin.role_change": "bg-amber-50 text-amber-700",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const pageSize = 50;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filterAction) params.set("action", filterAction);
    fetch(`/api/admin/audit?${params}`).then((r) => r.json()).then((data) => {
      setEntries(data.items || []);
      setTotal(data.total || 0);
    });
  }, [page, filterAction]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold">Audit Log</h2>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <option value="auth.login">Login</option>
          <option value="auth.login_failed">Login Failed</option>
          <option value="fax.send">Fax Send</option>
          <option value="fax.received">Fax Received</option>
          <option value="fax.delete">Fax Delete</option>
          <option value="admin.user_link">User Link</option>
          <option value="admin.role_change">Role Change</option>
          <option value="admin.email_config">Email Config</option>
        </select>
        <span className="text-sm text-slate-400">{total} entries</span>
      </div>

      {/* Entries */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Time</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Action</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resource</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <Badge className={`text-[10px] ${actionColors[e.action] || "bg-slate-50 text-slate-600"}`}>
                    {e.action}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{e.userId.substring(0, 8)}...</td>
                <td className="px-4 py-2.5 text-slate-500">{e.resourceType}/{e.resourceId.substring(0, 8)}</td>
                <td className="px-4 py-2.5 text-slate-400">{e.ipAddress}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No audit entries</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / pageSize) || 1}</span>
        <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

## Integration
After creating the audit service, add `audit()` calls to existing API routes:

- **Task 13** (auth session): `audit({ action: "auth.login", ... })` on successful login
- **Task 34** (fax send): `audit({ action: "fax.send", ... })` after SendMessage
- **Task 41** (contacts): `audit({ action: "contact.create", ... })` on create/update/delete
- **Task 50** (admin users): `audit({ action: "admin.user_link", ... })` on link

## Verify
- `npm run build` — no errors
- `/admin/audit` shows paginated, filterable audit log
