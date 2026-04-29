# Task 48 — Admin: Storage Retention / Purge Configuration

## Goal
Build an admin page to configure fax storage retention policies and view storage usage. Per-customer retention for HIPAA compliance.

## ⚠️ NEW FEATURE — Not in original design doc

## Files to Create
- `src/app/(portal)/admin/storage/page.tsx`
- `src/app/api/admin/storage/route.ts`
- `src/app/api/admin/storage/retention/route.ts`

## Dependencies
- `@azure/storage-blob` (installed in task 23)
- `@azure/identity` (installed)
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Feature Details
- Global default retention period (days before auto-purge)
- Per-customer retention override (for HIPAA — different BAA terms may require different retention)
- Storage usage display (total blobs, size)
- Manual purge trigger for expired items
- Retention settings stored in a `settings` Cosmos container (or appended to user docs)

## Cosmos Storage for Settings
Add a `retentionSettings` field to user documents OR create a simple `settings` document:

```typescript
interface RetentionConfig {
  id: "retention-config";       // Singleton
  userId: "system";             // Partition key
  globalRetentionDays: number;  // Default: 365
  perCustomerOverrides: Array<{
    userId: string;
    retentionDays: number;
    reason: string;             // e.g., "BAA requires 7 years"
  }>;
  updatedAt: string;
  updatedBy: string;
}
```

## Implementation

### 1. Create `src/app/api/admin/storage/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const endpoint = process.env.STORAGE_BLOB_ENDPOINT;
  if (!endpoint) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  try {
    const credential = new DefaultAzureCredential();
    const client = new BlobServiceClient(endpoint, credential);

    const stats = { received: { count: 0, sizeBytes: 0 }, sent: { count: 0, sizeBytes: 0 } };

    for (const containerName of ["received", "sent"] as const) {
      const containerClient = client.getContainerClient(containerName);
      for await (const blob of containerClient.listBlobsFlat()) {
        stats[containerName].count++;
        stats[containerName].sizeBytes += blob.properties.contentLength || 0;
      }
    }

    return NextResponse.json({
      received: {
        count: stats.received.count,
        sizeMB: Math.round(stats.received.sizeBytes / 1024 / 1024 * 100) / 100,
      },
      sent: {
        count: stats.sent.count,
        sizeMB: Math.round(stats.sent.sizeBytes / 1024 / 1024 * 100) / 100,
      },
      totalSizeMB: Math.round((stats.received.sizeBytes + stats.sent.sizeBytes) / 1024 / 1024 * 100) / 100,
      totalCount: stats.received.count + stats.sent.count,
    });
  } catch (error: any) {
    console.error("Storage stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### 2. Create `src/app/api/admin/storage/retention/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

const RETENTION_DOC_ID = "retention-config";
const SYSTEM_PARTITION = "system";

interface RetentionConfig {
  id: string;
  userId: string;
  globalRetentionDays: number;
  perCustomerOverrides: Array<{
    userId: string;
    displayName: string;
    retentionDays: number;
    reason: string;
  }>;
  updatedAt: string;
  updatedBy: string;
}

async function getRetentionConfig(): Promise<RetentionConfig> {
  // Use the users container with a special "system" partition doc
  const container = await containers.users();
  try {
    const { resource } = await container.item(RETENTION_DOC_ID, RETENTION_DOC_ID).read<RetentionConfig>();
    if (resource) return resource;
  } catch {}

  // Default config
  return {
    id: RETENTION_DOC_ID,
    userId: RETENTION_DOC_ID,
    globalRetentionDays: 365,
    perCustomerOverrides: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const config = await getRetentionConfig();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const container = await containers.users();

  const config: RetentionConfig = {
    id: RETENTION_DOC_ID,
    userId: RETENTION_DOC_ID,
    globalRetentionDays: body.globalRetentionDays ?? 365,
    perCustomerOverrides: body.perCustomerOverrides ?? [],
    updatedAt: new Date().toISOString(),
    updatedBy: user.id,
  };

  await container.items.upsert(config);

  return NextResponse.json({ success: true });
}
```

### 3. Create `src/app/(portal)/admin/storage/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Inbox, Send, Save, Plus, X, Trash2 } from "lucide-react";

interface StorageStats {
  received: { count: number; sizeMB: number };
  sent: { count: number; sizeMB: number };
  totalSizeMB: number;
  totalCount: number;
}

interface Override {
  userId: string;
  displayName: string;
  retentionDays: number;
  reason: string;
}

export default function StorageAdminPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [globalDays, setGlobalDays] = useState(365);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/admin/storage").then((r) => r.json()).then(setStats);
    fetch("/api/admin/storage/retention").then((r) => r.json()).then((data) => {
      setGlobalDays(data.globalRetentionDays);
      setOverrides(data.perCustomerOverrides || []);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/storage/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ globalRetentionDays: globalDays, perCustomerOverrides: overrides }),
    });
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  function addOverride() {
    setOverrides([...overrides, { userId: "", displayName: "", retentionDays: 2555, reason: "" }]);
  }

  function removeOverride(index: number) {
    setOverrides(overrides.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Storage & Retention</h2>

      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">Settings saved!</div>}

      {/* Storage Usage */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 text-center">
              <Inbox className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.received.count}</p>
              <p className="text-xs text-slate-400">Received faxes ({stats.received.sizeMB} MB)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 text-center">
              <Send className="h-6 w-6 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.sent.count}</p>
              <p className="text-xs text-slate-400">Sent faxes ({stats.sent.sizeMB} MB)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 text-center">
              <HardDrive className="h-6 w-6 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.totalSizeMB} MB</p>
              <p className="text-xs text-slate-400">Total storage ({stats.totalCount} files)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Global Retention */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Global Retention Policy</CardTitle>
          <p className="text-xs text-slate-400">Default auto-purge period for all fax PDFs. 0 = never delete.</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input type="number" className="w-32" value={globalDays} onChange={(e) => setGlobalDays(parseInt(e.target.value) || 0)} min={0} />
            <span className="text-sm text-slate-500">days ({Math.round(globalDays / 365 * 10) / 10} years)</span>
          </div>
        </CardContent>
      </Card>

      {/* Per-Customer Overrides */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Per-Customer Retention Overrides</CardTitle>
              <p className="text-xs text-slate-400">HIPAA: different BAA terms may require different retention periods.</p>
            </div>
            <Button variant="outline" size="sm" onClick={addOverride}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {overrides.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No per-customer overrides. Global policy applies to all.</p>
          )}
          {overrides.map((o, i) => (
            <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
              <Input placeholder="User ID or name" className="flex-1" value={o.displayName}
                onChange={(e) => { const n = [...overrides]; n[i].displayName = e.target.value; setOverrides(n); }} />
              <Input type="number" className="w-24" value={o.retentionDays} min={0}
                onChange={(e) => { const n = [...overrides]; n[i].retentionDays = parseInt(e.target.value) || 0; setOverrides(n); }} />
              <span className="text-xs text-slate-400 whitespace-nowrap">days</span>
              <Input placeholder="Reason" className="flex-1" value={o.reason}
                onChange={(e) => { const n = [...overrides]; n[i].reason = e.target.value; setOverrides(n); }} />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeOverride(i)}>
                <Trash2 className="h-4 w-4 text-slate-400" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Retention Settings"}
      </Button>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/admin/storage` shows storage stats + retention config
- Retention settings save to Cosmos DB

## Notes
- The actual Blob lifecycle policy is set in Bicep (task 06) at the Azure level
- These retention settings in Cosmos are for the application layer to respect when deciding whether to show/hide old faxes
- A scheduled cleanup job (task 52 or separate) should read these settings and delete blobs past retention
- Storage stats may be slow for large blob counts — consider caching or using Azure Monitor metrics instead
