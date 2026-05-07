/**
 * In-memory traffic metrics singleton.
 *
 * Tracks RPM via a sliding 60-second window and event loop lag via
 * perf_hooks monitorEventLoopDelay histogram.
 * Sessions/peaks are persisted to Cosmos by the traffic API route so they
 * survive server restarts. Memory is queried from Azure Monitor.
 */
import { monitorEventLoopDelay, type IntervalHistogram } from "perf_hooks";

const WINDOW_MS = 60_000; // 60-second sliding window for RPM

// B1 App Service limits
// Sessions: SSE now uses a shared poller (no per-user polling); limit raised to 150.
// Remaining per-user load is async Cosmos I/O + occasional fax ops — non-blocking.
export const LIMIT_SESSIONS = 150;
export const LIMIT_RPM = 1000;
export const LIMIT_MEMORY_MB = 1792; // 1.75 GB
// Event loop lag thresholds (ms): <10 healthy, 10-50 moderate, 50-100 high, >100 critical
export const LIMIT_EVENT_LOOP_LAG_MS = 100;

class TrafficMetrics {
  private _reqTimestamps: number[] = [];
  private _lagHistogram: IntervalHistogram;
  readonly startedAt = Date.now();

  constructor() {
    this._lagHistogram = monitorEventLoopDelay({ resolution: 20 });
    this._lagHistogram.enable();
  }

  private _pruneWindow() {
    const cutoff = Date.now() - WINDOW_MS;
    let i = 0;
    while (i < this._reqTimestamps.length && this._reqTimestamps[i] < cutoff) i++;
    if (i > 0) this._reqTimestamps.splice(0, i);
  }

  /** Record an incoming HTTP request. */
  hit() {
    this._reqTimestamps.push(Date.now());
    this._pruneWindow();
  }

  /** Current requests in the last 60 seconds. */
  get currentRpm(): number {
    this._pruneWindow();
    return this._reqTimestamps.length;
  }

  /** Mean event loop lag in ms since last reset (or process start). */
  get eventLoopLagMs(): number {
    // histogram values are in nanoseconds
    return Math.round(this._lagHistogram.mean / 1e6);
  }

  /** Reset the lag histogram (call after each snapshot write). */
  resetLag() {
    this._lagHistogram.reset();
  }

  get uptime(): number {
    return Math.floor(process.uptime());
  }

  get startedAtMs(): number {
    return this.startedAt;
  }

  get memoryMb(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  get rssMb(): number {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
  }
}

// Module-level singleton — one instance per Node.js process lifetime.
export const trafficMetrics = new TrafficMetrics();
