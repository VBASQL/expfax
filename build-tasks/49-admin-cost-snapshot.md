# Task 49 — Admin: Azure Cost Snapshot Dashboard

## Goal
Build an internal admin dashboard panel showing Azure resource costs for ExpFax — storage, compute, Cosmos DB usage.

## ⚠️ NEW FEATURE — Not in original design doc

## Files to Create
- `src/app/(portal)/admin/costs/page.tsx`
- `src/app/api/admin/costs/route.ts`

## Dependencies
- `@azure/arm-costmanagement` — **INSTALL THIS** (`npm install @azure/arm-costmanagement`)
- `@azure/arm-monitor` — **INSTALL THIS** (`npm install @azure/arm-monitor`)
- `@azure/identity` (already installed)
- `src/lib/auth/session.ts` (task 13)

## Feature Details
- Internal admin only — shows total Azure spend for ExpFax resources
- Cost breakdown by resource type (App Service, Cosmos DB, Storage)
- Time range: last 7 days, 30 days, 90 days
- Uses Azure Cost Management API (requires `Cost Management Reader` RBAC role on the subscription)
- Also shows Cosmos DB RU consumption and Storage metrics via Azure Monitor

## RBAC Requirement
The App Service managed identity needs:
- `Cost Management Reader` role on the resource group (for cost data)
- `Monitoring Reader` role on the resource group (for metrics)

Add these to the Bicep in task 05 (main.bicep).

## Implementation

### 1. Install dependencies
```powershell
npm install @azure/arm-costmanagement @azure/arm-monitor
```

### 2. Create `src/app/api/admin/costs/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DefaultAzureCredential } from "@azure/identity";
import { CostManagementClient } from "@azure/arm-costmanagement";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroupName = process.env.AZURE_RESOURCE_GROUP;

  if (!subscriptionId || !resourceGroupName) {
    return NextResponse.json({ error: "Azure subscription/RG not configured" }, { status: 500 });
  }

  const days = parseInt(request.nextUrl.searchParams.get("days") || "30", 10);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  try {
    const credential = new DefaultAzureCredential();
    const client = new CostManagementClient(credential);

    const scope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;

    // Query cost by service
    const result = await client.query.usage(scope, {
      type: "ActualCost",
      timeframe: "Custom",
      timePeriod: {
        from: startDate,
        to: endDate,
      },
      dataset: {
        granularity: "None",
        aggregation: {
          totalCost: { name: "Cost", function: "Sum" },
        },
        grouping: [
          { type: "Dimension", name: "ServiceName" },
        ],
      },
    });

    // Parse results
    const costByService: Array<{ service: string; cost: number; currency: string }> = [];
    let totalCost = 0;
    let currency = "USD";

    if (result.rows) {
      for (const row of result.rows) {
        const cost = Number(row[0]) || 0;
        const serviceName = String(row[1]) || "Unknown";
        currency = String(row[2]) || "USD";
        totalCost += cost;
        costByService.push({ service: serviceName, cost: Math.round(cost * 100) / 100, currency });
      }
    }

    return NextResponse.json({
      totalCost: Math.round(totalCost * 100) / 100,
      currency,
      period: { from: formatDate(startDate), to: formatDate(endDate), days },
      costByService: costByService.sort((a, b) => b.cost - a.cost),
    });
  } catch (error: any) {
    console.error("Cost query error:", error);
    return NextResponse.json({
      error: error.message || "Failed to fetch cost data",
      hint: "Ensure the App Service identity has 'Cost Management Reader' role on the resource group.",
    }, { status: 500 });
  }
}
```

### 3. Create `src/app/(portal)/admin/costs/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Database, HardDrive, Server, RefreshCcw } from "lucide-react";

interface CostData {
  totalCost: number;
  currency: string;
  period: { from: string; to: string; days: number };
  costByService: Array<{ service: string; cost: number; currency: string }>;
  error?: string;
}

export default function CostSnapshotPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  function load() {
    setLoading(true);
    fetch(`/api/admin/costs?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [days]);

  const serviceIcons: Record<string, typeof DollarSign> = {
    "Azure Cosmos DB": Database,
    "Storage": HardDrive,
    "Azure App Service": Server,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Azure Cost Snapshot</h2>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {data?.error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-600">{data.error}</p>
            {data.hint && <p className="text-xs text-slate-400 mt-2">{data.hint}</p>}
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* Total */}
          <Card>
            <CardContent className="p-6 text-center">
              <DollarSign className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-4xl font-bold tracking-tight">
                ${data.totalCost.toFixed(2)}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Total cost — {data.period.from} to {data.period.to}
              </p>
            </CardContent>
          </Card>

          {/* Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cost by Service</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.costByService.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No cost data available for this period</p>
              )}
              {data.costByService.map((item) => {
                const Icon = serviceIcons[item.service] || DollarSign;
                const pct = data.totalCost > 0 ? Math.round((item.cost / data.totalCost) * 100) : 0;
                return (
                  <div key={item.service} className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-slate-400 shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{item.service}</span>
                        <span className="font-semibold">${item.cost.toFixed(2)}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="p-8 text-center text-sm text-slate-400">Loading cost data...</CardContent></Card>
      )}
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/admin/costs` shows total cost + per-service breakdown

## Notes
- Requires RBAC: App Service identity needs `Cost Management Reader` on the resource group
- Add to Bicep main.bicep (task 05): `Microsoft.Authorization/roleAssignments` for the cost reader role
- Cost data may be delayed 24-48 hours in Azure — this is normal
- For local dev, this will fail gracefully (no Azure credentials) — that's OK
