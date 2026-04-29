"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded";
  message: string;
}

interface EnvVar {
  name: string;
  set: boolean;
}

interface HealthData {
  overall: "healthy" | "degraded";
  checks: HealthCheck[];
  environment: EnvVar[];
  build: { buildTime: string; nodeVersion: string };
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/admin/system/health")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Health</h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!data ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          <Card className={data.overall === "healthy" ? "border-emerald-200" : "border-amber-200"}>
            <CardContent className="p-5 flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  data.overall === "healthy" ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
              <div>
                <p className="font-semibold capitalize">{data.overall}</p>
                <p className="text-xs text-slate-400">
                  {data.checks.filter((c) => c.status === "healthy").length} / {data.checks.length}{" "}
                  services healthy
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-medium text-sm text-slate-700 mb-4">Service Checks</h3>
              <div className="space-y-3">
                {data.checks.map((check) => (
                  <div
                    key={check.name}
                    className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                  >
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                        check.status === "healthy" ? "bg-emerald-500" : "bg-amber-400"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium capitalize">{check.name}</p>
                      <p className="text-xs text-slate-400">{check.message}</p>
                    </div>
                    <Badge
                      className={`ml-auto text-[10px] ${
                        check.status === "healthy"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {check.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-medium text-sm text-slate-700 mb-4">Environment Variables</h3>
              <div className="space-y-2">
                {data.environment.map((ev) => (
                  <div
                    key={ev.name}
                    className="flex items-center justify-between py-1 border-b last:border-0"
                  >
                    <span className="text-sm font-mono text-slate-600">{ev.name}</span>
                    {ev.set ? (
                      <Badge className="text-[10px] bg-emerald-50 text-emerald-700">Set</Badge>
                    ) : (
                      <Badge className="text-[10px] bg-red-50 text-red-700">Missing</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-medium text-sm text-slate-700 mb-4">Build Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Build Time</p>
                  <p className="font-mono">{new Date(data.build.buildTime).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Node Version</p>
                  <p className="font-mono">{data.build.nodeVersion}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
