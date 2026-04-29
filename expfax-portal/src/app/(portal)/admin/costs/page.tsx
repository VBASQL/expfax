"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertTriangle } from "lucide-react";

interface CostData {
  totalCost?: number;
  currency?: string;
  period?: { from: string; to: string };
  costByService?: Array<{ serviceName: string; cost: number }>;
  error?: string;
  hint?: string;
}

export default function CostSnapshotPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/costs?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const maxCost = data?.costByService?.[0]?.cost ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cost Snapshot</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading cost data...</p>
      ) : data?.error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">{data.error}</p>
                {data.hint && <p className="text-xs text-amber-600 mt-1">{data.hint}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-1">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-slate-600">Total Cost</span>
              </div>
              <p className="text-3xl font-bold">
                {data?.currency === "USD" ? "$" : ""}{data?.totalCost?.toFixed(2)}{" "}
                <span className="text-sm text-slate-400">{data?.currency}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {data?.period?.from} – {data?.period?.to}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-medium text-sm text-slate-700 mb-4">Cost by Service</h3>
              {!data?.costByService?.length ? (
                <p className="text-sm text-slate-400">No cost data available</p>
              ) : (
                <div className="space-y-4">
                  {data.costByService.map((item) => (
                    <div key={item.serviceName}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-600">{item.serviceName}</span>
                        <span className="text-sm font-mono">
                          {data.currency === "USD" ? "$" : ""}{item.cost.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          style={{ width: `${(item.cost / maxCost) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
