import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CostManagementClient } from "@azure/arm-costmanagement";
import { DefaultAzureCredential } from "@azure/identity";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;

  if (!subscriptionId || !resourceGroup) {
    return NextResponse.json({
      error: "Cost management not configured",
      hint: "Set AZURE_SUBSCRIPTION_ID and AZURE_RESOURCE_GROUP environment variables",
    }, { status: 503 });
  }

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];

  try {
    const tenantId = process.env.AZURE_TENANT_ID;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
    const client = new CostManagementClient(credential);
    const scope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;

    const result = await client.query.usage(scope, {
      type: "ActualCost",
      timeframe: "Custom",
      timePeriod: { from: new Date(fromStr), to: new Date(toStr) },
      dataset: {
        granularity: "None",
        aggregation: {
          totalCost: { name: "Cost", function: "Sum" },
        },
        grouping: [{ type: "Dimension", name: "ServiceName" }],
      },
    });

    const rows = result.rows ?? [];
    const columns = result.columns ?? [];
    const costIdx = columns.findIndex((c) => c.name === "Cost");
    const serviceIdx = columns.findIndex((c) => c.name === "ServiceName");
    const currencyIdx = columns.findIndex((c) => c.name === "Currency");

    let totalCost = 0;
    let currency = "USD";
    const serviceMap = new Map<string, number>();

    for (const row of rows) {
      const cost = Number(row[costIdx] ?? 0);
      const service = String(row[serviceIdx] ?? "Other");
      if (currencyIdx >= 0) currency = String(row[currencyIdx] ?? "USD");
      totalCost += cost;
      serviceMap.set(service, (serviceMap.get(service) ?? 0) + cost);
    }

    const costByService = [...serviceMap.entries()]
      .map(([serviceName, cost]) => ({ serviceName, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      totalCost: Math.round(totalCost * 100) / 100,
      currency,
      period: { from: fromStr, to: toStr },
      costByService,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuthError = message.includes("Authorization") || message.includes("RBAC") || message.includes("403");
    return NextResponse.json({
      error: "Failed to fetch cost data",
      hint: isAuthError
        ? "Ensure the app's managed identity has Cost Management Reader role on the subscription"
        : message,
    }, { status: 502 });
  }
}
