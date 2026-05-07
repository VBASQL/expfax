/**
 * Query Azure Monitor for App Service memory metrics.
 * Uses @azure/arm-monitor (already in dependencies).
 *
 * Requires env vars:
 *   AZURE_SUBSCRIPTION_ID
 *   AZURE_RESOURCE_GROUP
 *   AZURE_APP_SERVICE_NAME
 */
import { MonitorClient } from "@azure/arm-monitor";
import { DefaultAzureCredential } from "@azure/identity";
import { getConfig } from "@/lib/config";
import { LIMIT_MEMORY_MB } from "./metrics";

export interface MemoryMetrics {
  current: number;    // latest sample in MB
  average: number;    // 1-hour average in MB
  peak: number;       // 1-hour max in MB
  limit: number;      // B1 limit in MB
  rss: number;        // process RSS from Node
  available: boolean; // false if Azure Monitor is not configured
}

let _monitorClient: MonitorClient | null = null;

function getMonitorClient(subscriptionId: string): MonitorClient {
  if (!_monitorClient) {
    const tenantId = process.env.AZURE_TENANT_ID;
    const credential = new DefaultAzureCredential(tenantId ? { tenantId } : undefined);
    _monitorClient = new MonitorClient(credential, subscriptionId);
  }
  return _monitorClient;
}

export async function getAppServiceMemory(rssMb: number): Promise<MemoryMetrics> {
  const config = await getConfig();
  const { azureSubscriptionId, azureResourceGroup, azureAppServiceName } = config;

  const notConfigured: MemoryMetrics = {
    current: rssMb,
    average: rssMb,
    peak: rssMb,
    limit: LIMIT_MEMORY_MB,
    rss: rssMb,
    available: false,
  };

  if (!azureSubscriptionId || !azureResourceGroup || !azureAppServiceName) {
    return notConfigured;
  }

  try {
    const client = getMonitorClient(azureSubscriptionId);
    const resourceUri = `/subscriptions/${azureSubscriptionId}/resourceGroups/${azureResourceGroup}/providers/Microsoft.Web/sites/${azureAppServiceName}`;

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const result = await client.metrics.list(resourceUri, {
      timespan: `${oneHourAgo.toISOString()}/${now.toISOString()}`,
      interval: "PT5M",
      metricnames: "MemoryWorkingSet",
      aggregation: "Average,Maximum",
    });

    const series = result.value?.[0]?.timeseries?.[0]?.data ?? [];
    const values = series.map((d) => Math.round((d.average ?? 0) / 1024 / 1024));
    const maxValues = series.map((d) => Math.round((d.maximum ?? 0) / 1024 / 1024));

    const nonZero = values.filter((v) => v > 0);
    const current = nonZero.length > 0 ? nonZero[nonZero.length - 1] : rssMb;
    const average = nonZero.length > 0 ? Math.round(nonZero.reduce((s, v) => s + v, 0) / nonZero.length) : rssMb;
    const peak = maxValues.length > 0 ? Math.max(...maxValues) : rssMb;

    return { current, average, peak, limit: LIMIT_MEMORY_MB, rss: rssMb, available: true };
  } catch {
    return notConfigured;
  }
}
