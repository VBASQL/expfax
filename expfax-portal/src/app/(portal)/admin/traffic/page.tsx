"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users, Zap, MemoryStick, FileText, Clock, Activity } from "lucide-react";

interface ChartPoint {
  ts: string;
  sessions: number;
  rpm: number;
  memoryMb: number;
  lagMs: number;
}

interface TrafficData {
  sessions: { current: number; average: number | null; peak: number | null; limit: number };
  rpm: { current: number; average: number | null; peak: number | null; limit: number };
  eventLoopLag: { current: number; average: number | null; peak: number | null; limit: number };
  memory: { current: number; average: number | null; peak: number | null; rss: number; limit: number; available: boolean };
  faxesToday: number;
  uptime: number;
  startedAt: number;
  historyHours: number;
  chartData: ChartPoint[];
}

type ColorKey = "emerald" | "yellow" | "orange" | "red";

const COLORS: Record<ColorKey, { dot: string; bar: string; badge: string; text: string }> = {
  emerald: { dot: "bg-emerald-500", bar: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-600" },
  yellow:  { dot: "bg-yellow-400",  bar: "bg-yellow-400",  badge: "bg-yellow-50 text-yellow-700 border-yellow-200",   text: "text-yellow-600"  },
  orange:  { dot: "bg-orange-400",  bar: "bg-orange-400",  badge: "bg-orange-50 text-orange-700 border-orange-200",   text: "text-orange-600"  },
  red:     { dot: "bg-red-500",     bar: "bg-red-400",     badge: "bg-red-50 text-red-700 border-red-200",            text: "text-red-600"     },
};

function kpiColor(pct: number): ColorKey {
  if (pct < 35) return "emerald";
  if (pct < 65) return "yellow";
  if (pct < 85) return "orange";
  return "red";
}
function kpiLabel(pct: number) {
  if (pct < 35) return "Healthy";
  if (pct < 65) return "Moderate";
  if (pct < 85) return "High";
  return "Critical";
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface KpiCardProps {
  title: string;
  icon: React.ReactNode;
  current: number;
  average: number | null;
  peak: number | null;
  limit: number;
  unit?: string;
}

function KpiCard({ title, icon, current, average, peak, limit, unit = "" }: KpiCardProps) {
  const pct = Math.min(100, Math.round(((current ?? 0) / limit) * 100));
  const peakPct = peak != null ? Math.min(100, Math.round((peak / limit) * 100)) : null;
  const color = kpiColor(pct);
  const c = COLORS[color];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-600">
            {icon}
            <span className="text-sm font-medium">{title}</span>
          </div>
          <Badge className={`text-[10px] border ${c.badge}`}>{kpiLabel(pct)}</Badge>
        </div>
        <div className="flex items-end gap-2 mb-1">
          <span className={`text-3xl font-bold ${c.text}`}>{(current ?? 0).toLocaleString()}</span>
          <span className="text-xs text-slate-400 mb-1.5">{unit} / {limit.toLocaleString()} limit</span>
        </div>
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${c.bar}`} style={{ width: `${pct}%` }} />
          {peakPct != null && (
            <div className="absolute top-0 h-full w-0.5 bg-slate-400 opacity-60" style={{ left: `${peakPct}%` }} />
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          <Stat label="Current" value={`${(current ?? 0).toLocaleString()}${unit}`} color={c.text} />
          <Stat label="Avg (7d)" value={average != null ? `${average.toLocaleString()}${unit}` : "—"} />
          <Stat label="Peak (all-time)" value={peak != null ? `${peak.toLocaleString()}${unit}` : "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-semibold ${color ?? "text-slate-700"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

function InfoCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">{icon}</div>
        <div>
          <p className="text-lg font-semibold text-slate-800">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const CHART_COLORS = {
  sessions: "#6366f1",
  rpm: "#f59e0b",
  memoryMb: "#10b981",
  lagMs: "#ef4444",
};

const REFRESH_INTERVAL = 30_000;

export default function TrafficPage() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/traffic")
      .then((r) => r.json())
      .then((d) => { setData(d); setLastRefresh(new Date()); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  // Format chart data — label by time
  const chartData = (data?.chartData ?? []).map((p) => ({ ...p, label: fmtTime(p.ts) }));
  const hasHistory = chartData.length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Traffic Monitor</h2>
          {lastRefresh && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30s
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!data ? (
        <p className="text-sm text-slate-400">{loading ? "Loading..." : "No data"}</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard title="Active Sessions" icon={<Users className="h-4 w-4" />}
              current={data.sessions.current} average={data.sessions.average}
              peak={data.sessions.peak} limit={data.sessions.limit} />
            <KpiCard title="Request Rate" icon={<Zap className="h-4 w-4" />}
              current={data.rpm.current} average={data.rpm.average}
              peak={data.rpm.peak} limit={data.rpm.limit} unit=" rpm" />
            <KpiCard title="Event Loop Lag" icon={<Activity className="h-4 w-4" />}
              current={data.eventLoopLag.current} average={data.eventLoopLag.average}
              peak={data.eventLoopLag.peak} limit={data.eventLoopLag.limit} unit=" ms" />
            <KpiCard title="Memory (Heap)" icon={<MemoryStick className="h-4 w-4" />}
              current={data.memory.current} average={data.memory.average}
              peak={data.memory.peak} limit={data.memory.limit} unit=" MB" />
          </div>

          {/* Time-series chart */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-sm text-slate-700">
                  Usage over time
                  <span className="ml-2 text-[10px] font-normal text-slate-400">
                    last {data.historyHours}h · {chartData.length} samples
                  </span>
                </h3>
                {!data.memory.available && (
                  <Badge className="text-[10px] border bg-slate-50 text-slate-500 border-slate-200">
                    Memory from process (Azure Monitor not configured)
                  </Badge>
                )}
              </div>

              {!hasHistory ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  No history yet — data accumulates every poll (30 s).
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.sessions} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={CHART_COLORS.sessions} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRpm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.rpm} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={CHART_COLORS.rpm} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.memoryMb} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={CHART_COLORS.memoryMb} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gLag" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.lagMs} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={CHART_COLORS.lagMs} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    {/* Left axis: sessions + RPM */}
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={36} />
                    {/* Right axis: memory MB */}
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: CHART_COLORS.memoryMb }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}MB`} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Area yAxisId="left" type="monotone" dataKey="sessions" name="Sessions" stroke={CHART_COLORS.sessions} fill="url(#gSessions)" strokeWidth={2} dot={false} />
                    <Area yAxisId="left" type="monotone" dataKey="rpm" name="RPM" stroke={CHART_COLORS.rpm} fill="url(#gRpm)" strokeWidth={2} dot={false} />
                    <Area yAxisId="left" type="monotone" dataKey="lagMs" name="Lag (ms)" stroke={CHART_COLORS.lagMs} fill="url(#gLag)" strokeWidth={2} dot={false} />
                    <Area yAxisId="right" type="monotone" dataKey="memoryMb" name="Memory (MB)" stroke={CHART_COLORS.memoryMb} fill="url(#gMem)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Info row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard icon={<FileText className="h-4 w-4 text-slate-500" />} label="Faxes Today" value={data.faxesToday.toLocaleString()} />
            <InfoCard icon={<Clock className="h-4 w-4 text-slate-500" />} label="Process Uptime" value={fmtUptime(data.uptime)} />
            <InfoCard icon={<MemoryStick className="h-4 w-4 text-slate-500" />} label="RSS Memory"
              value={`${data.memory.rss} MB`} sub={`Heap limit: ${data.memory.limit} MB (B1)`} />
          </div>
        </>
      )}
    </div>
  );
}

