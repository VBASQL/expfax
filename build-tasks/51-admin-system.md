# Task 51 — Admin: System Health Dashboard

## Goal
Build an admin system health page showing FaxBack connection status, queue stats, poller status, and environment info.

## Files to Create
- `src/app/(portal)/admin/system/page.tsx`
- `src/app/api/admin/system/health/route.ts`

## Dependencies
- `src/lib/faxback/session.ts` (task 20)
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Design
- FaxBack connection status (is supervisor session active, last refresh time)
- Queue poller status (last run, items polled)
- Cosmos DB reachable
- Storage reachable
- Environment variables present (masked)
- Next.js build info

## Implementation

### 1. Create `src/app/api/admin/system/health/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getSessionInfo } from "@/lib/faxback/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const checks: Record<string, { status: string; detail?: string }> = {};

  // 1. FaxBack session
  try {
    const info = getSessionInfo();
    checks.faxback = {
      status: info.isActive ? "ok" : "error",
      detail: info.isActive
        ? `Session active, last refreshed ${info.lastRefresh}`
        : "Session not active — will auto-refresh on next API call",
    };
  } catch (error: any) {
    checks.faxback = { status: "error", detail: error.message };
  }

  // 2. Cosmos DB
  try {
    const container = await containers.users();
    await container.items.query("SELECT TOP 1 c.id FROM c").fetchAll();
    checks.cosmosdb = { status: "ok", detail: "Connected" };
  } catch (error: any) {
    checks.cosmosdb = { status: "error", detail: error.message };
  }

  // 3. Storage
  try {
    const endpoint = process.env.STORAGE_BLOB_ENDPOINT;
    checks.storage = endpoint
      ? { status: "ok", detail: `Endpoint: ${endpoint}` }
      : { status: "warn", detail: "STORAGE_BLOB_ENDPOINT not configured" };
  } catch (error: any) {
    checks.storage = { status: "error", detail: error.message };
  }

  // 4. Environment variables (masked check)
  const envVars = [
    "FAXBACK_BASE_URL",
    "COSMOS_ENDPOINT",
    "STORAGE_BLOB_ENDPOINT",
    "AZURE_KEY_VAULT_URL",
    "NEXT_PUBLIC_APP_URL",
  ];
  const envStatus = envVars.map((v) => ({
    name: v,
    set: !!process.env[v],
    value: process.env[v] ? `${process.env[v]!.substring(0, 20)}...` : "NOT SET",
  }));

  // 5. Build info
  const buildInfo = {
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    platform: process.platform,
    uptime: `${Math.round(process.uptime())} seconds`,
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json({
    overall: allOk ? "healthy" : "degraded",
    checks,
    environment: envStatus,
    build: buildInfo,
  });
}
```

### 2. Create `src/app/(portal)/admin/system/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCcw, CheckCircle2, XCircle, AlertTriangle, Server, Database, HardDrive, Zap } from "lucide-react";

interface HealthData {
  overall: string;
  checks: Record<string, { status: string; detail?: string }>;
  environment: Array<{ name: string; set: boolean; value: string }>;
  build: Record<string, string>;
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/system/health").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    if (status === "warn") return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const checkIcons: Record<string, typeof Server> = {
    faxback: Zap,
    cosmosdb: Database,
    storage: HardDrive,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Health</h2>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {data && (
        <>
          {/* Overall */}
          <Card className={data.overall === "healthy" ? "border-emerald-200" : "border-amber-200"}>
            <CardContent className="p-6 text-center">
              {data.overall === "healthy" ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
              )}
              <p className="text-lg font-semibold capitalize">{data.overall}</p>
            </CardContent>
          </Card>

          {/* Service Checks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Service Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(data.checks).map(([name, check]) => {
                const Icon = checkIcons[name] || Server;
                return (
                  <div key={name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Icon className="h-5 w-5 text-slate-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize">{name.replace(/([A-Z])/g, " $1")}</p>
                      <p className="text-xs text-slate-400">{check.detail}</p>
                    </div>
                    {statusIcon(check.status)}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Environment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Environment Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {data.environment.map((env) => (
                  <div key={env.name} className="flex items-center justify-between py-1 text-sm">
                    <code className="text-xs font-mono text-slate-600">{env.name}</code>
                    <Badge variant={env.set ? "secondary" : "destructive"} className="text-[10px]">
                      {env.set ? "Set" : "Missing"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Build Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Build Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(data.build).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-slate-400 capitalize">{k.replace(/([A-Z])/g, " $1")}</p>
                    <p className="font-mono text-xs">{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/admin/system` shows live health checks for all services

## Notes
- `getSessionInfo()` is a sync helper exported from the faxback session module — returns cached state
- In local dev, Cosmos/Storage checks may fail — that's expected
