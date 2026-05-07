import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { trafficMetrics, LIMIT_SESSIONS, LIMIT_RPM, LIMIT_EVENT_LOOP_LAG_MS } from "@/lib/traffic/metrics";
import { getAppServiceMemory } from "@/lib/traffic/azure-monitor";

interface TrafficSnapshot {
  id: string;
  type: "trafficSnapshot";
  ts: string;         // ISO timestamp
  sessions: number;
  rpm: number;
  memoryMb: number;
  lagMs: number;
}

const SNAPSHOT_WINDOW_HOURS = 168; // 7 days for rolling averages

/** Write a minute-snapshot to Cosmos so history survives restarts. */
async function writeSnapshot(sessions: number, rpm: number, memoryMb: number, lagMs: number) {
  try {
    const container = await containers.trafficSnapshots();
    const doc: TrafficSnapshot = {
      id: uuidv4(),
      type: "trafficSnapshot",
      ts: new Date().toISOString(),
      sessions,
      rpm,
      memoryMb,
      lagMs,
    };
    await container.items.create(doc);
  } catch {
    // Non-fatal — container may not exist yet in dev
  }
}

/** Read last N hours of snapshots from Cosmos. */
async function readSnapshots(hours: number): Promise<TrafficSnapshot[]> {
  try {
    const container = await containers.trafficSnapshots();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { resources } = await container.items
      .query<TrafficSnapshot>(
        {
          query: "SELECT * FROM c WHERE c.ts >= @since ORDER BY c.ts ASC",
          parameters: [{ name: "@since", value: since }],
        }
      )
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

interface AllTimePeaks { sessions: number | null; rpm: number | null; memoryMb: number | null; lagMs: number | null; }

/** Query all-time MAX values — no time window. */
async function readAllTimePeaks(): Promise<AllTimePeaks> {
  try {
    const container = await containers.trafficSnapshots();
    const { resources } = await container.items
      .query<AllTimePeaks>(
        { query: "SELECT MAX(c.sessions) AS sessions, MAX(c.rpm) AS rpm, MAX(c.memoryMb) AS memoryMb, MAX(c.lagMs) AS lagMs FROM c" }
      )
      .fetchAll();
    const row = resources[0];
    return {
      sessions: row?.sessions ?? null,
      rpm: row?.rpm ?? null,
      memoryMb: row?.memoryMb ?? null,
      lagMs: row?.lagMs ?? null,
    };
  } catch {
    return { sessions: null, rpm: null, memoryMb: null, lagMs: null };
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  trafficMetrics.hit();

  const now = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Run Cosmos queries in parallel
  const [sessionCountResult, faxCountResult, history, allTimePeaks] = await Promise.all([
    containers.sessions().then((c) =>
      c.items
        .query<number>({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.expiresAt > @now",
          parameters: [{ name: "@now", value: now }],
        })
        .fetchAll()
    ),
    containers.faxMessages().then((c) =>
      c.items
        .query<number>({
          query: "SELECT VALUE COUNT(1) FROM c WHERE c.createdAt >= @today",
          parameters: [{ name: "@today", value: todayStart.toISOString() }],
        })
        .fetchAll()
    ),
    readSnapshots(SNAPSHOT_WINDOW_HOURS),
    readAllTimePeaks(),
  ]);

  const activeSessions: number = sessionCountResult.resources[0] ?? 0;
  const faxesToday: number = faxCountResult.resources[0] ?? 0;
  const currentRpm = trafficMetrics.currentRpm;
  const currentLagMs = trafficMetrics.eventLoopLagMs;

  // Memory from Azure Monitor (falls back to process RSS if not configured)
  const memoryMetrics = await getAppServiceMemory(trafficMetrics.rssMb);

  // Rolling averages from windowed history (null when no history yet)
  const sessionValues = history.map((s) => s.sessions);
  const rpmValues = history.map((s) => s.rpm);
  const memoryValues = history.map((s) => s.memoryMb);
  const lagValues = history.map((s) => s.lagMs ?? 0).filter((v) => v > 0);

  const avgSessions =
    sessionValues.length > 0
      ? Math.round(sessionValues.reduce((a, b) => a + b, 0) / sessionValues.length)
      : null;
  const avgRpm =
    rpmValues.length > 0
      ? Math.round(rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length)
      : null;
  const avgMemory =
    memoryValues.length > 0
      ? Math.round(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length)
      : (!memoryMetrics.available ? null : memoryMetrics.average);
  const avgLag =
    lagValues.length > 0
      ? Math.round(lagValues.reduce((a, b) => a + b, 0) / lagValues.length)
      : null;

  // All-time peaks from Cosmos (null when no history yet)
  const peakSessions = allTimePeaks.sessions;
  const peakRpm = allTimePeaks.rpm;
  const peakMemory = allTimePeaks.memoryMb ?? (memoryMetrics.available ? memoryMetrics.peak : null);
  const peakLag = allTimePeaks.lagMs;

  // Write snapshot for this poll (throttle: only if last snapshot was >50s ago)
  const lastSnap = history[history.length - 1];
  const lastSnapAge = lastSnap ? Date.now() - new Date(lastSnap.ts).getTime() : Infinity;
  if (lastSnapAge > 50_000) {
    void writeSnapshot(activeSessions, currentRpm, memoryMetrics.current, currentLagMs);
    trafficMetrics.resetLag();
  }

  // Build time-series for chart (downsample to max 48 points for readability)
  const MAX_CHART_POINTS = 48;
  let chartData = history.map((s) => ({
    ts: s.ts,
    sessions: s.sessions,
    rpm: s.rpm,
    memoryMb: s.memoryMb,
    lagMs: s.lagMs ?? 0,
  }));
  if (chartData.length > MAX_CHART_POINTS) {
    const step = Math.ceil(chartData.length / MAX_CHART_POINTS);
    chartData = chartData.filter((_, i) => i % step === 0);
  }

  return NextResponse.json({
    sessions: {
      current: activeSessions,
      average: avgSessions,
      peak: peakSessions,
      limit: LIMIT_SESSIONS,
    },
    rpm: {
      current: currentRpm,
      average: avgRpm,
      peak: peakRpm,
      limit: LIMIT_RPM,
    },
    eventLoopLag: {
      current: currentLagMs,
      average: avgLag,
      peak: peakLag,
      limit: LIMIT_EVENT_LOOP_LAG_MS,
    },
    memory: {
      current: memoryMetrics.current,
      average: avgMemory,
      peak: peakMemory,
      rss: memoryMetrics.rss,
      limit: memoryMetrics.limit,
      available: memoryMetrics.available,
    },
    faxesToday,
    uptime: trafficMetrics.uptime,
    startedAt: trafficMetrics.startedAtMs,
    historyHours: SNAPSHOT_WINDOW_HOURS,
    chartData,
  });
}
