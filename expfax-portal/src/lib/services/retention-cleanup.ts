/**
 * Retention cleanup service.
 *
 * Runs once per day. Reads the admin-configured retention policy
 * (globalRetentionDays + per-user overrides) and deletes:
 *  - The corresponding blobs (faxImagePath, sentDocumentPaths) from Storage
 *  - The faxMessages Cosmos doc
 *
 * for every fax whose `submitTime` is older than the user's effective
 * retention window.
 *
 * A single lock document in Cosmos guarantees that only ONE App Service
 * instance executes the run per 24h window, even when scaled out.
 */

import { containers } from "@/lib/db/cosmos";
import { deleteBlobsByPaths, deleteFaxPdf } from "@/lib/services/blob-storage";

const LOCK_DOC_ID = "retention-cleanup-lock";
const RETENTION_DOC_ID = "retention-config";
const MIN_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23h — accounts for slight clock skew

interface RetentionOverride {
  userId: string;
  retentionDays: number;
  reason?: string;
}

interface RetentionConfigDoc {
  id: string;
  userId: string;
  globalRetentionDays: number;
  overrides: RetentionOverride[];
  updatedAt: string;
}

interface LockDoc {
  id: string;
  userId: string; // partition key — must match id
  lastRunAt: string;
  lastRunBy: string;
  lastDeletedFaxes: number;
  lastDeletedBlobs: number;
  lastDurationMs: number;
}

export interface RetentionRunResult {
  ranAt: string;
  globalRetentionDays: number;
  overridesApplied: number;
  deletedFaxes: number;
  deletedBlobs: number;
  failedDeletes: number;
  durationMs: number;
  skipped?: "recently_ran" | "no_config";
}

async function loadConfig(): Promise<RetentionConfigDoc | null> {
  const usersContainer = await containers.users();
  const { resource } = await usersContainer
    .item(RETENTION_DOC_ID, RETENTION_DOC_ID)
    .read<RetentionConfigDoc>();
  return resource ?? null;
}

/**
 * Try to acquire the daily lock. Returns true if this caller "won" and
 * should perform the cleanup; false if another instance already ran
 * within the minimum interval.
 *
 * Uses Cosmos ETag-based optimistic concurrency to make acquisition
 * race-safe across multiple App Service instances.
 */
async function tryAcquireLock(runner: string): Promise<boolean> {
  const usersContainer = await containers.users();
  const now = new Date();

  const { resource: existing, etag } = await usersContainer
    .item(LOCK_DOC_ID, LOCK_DOC_ID)
    .read<LockDoc>()
    .then((r) => ({ resource: r.resource, etag: r.etag }))
    .catch(() => ({ resource: null, etag: undefined }));

  if (existing?.lastRunAt) {
    const last = Date.parse(existing.lastRunAt);
    if (Number.isFinite(last) && now.getTime() - last < MIN_INTERVAL_MS) {
      return false;
    }
  }

  const next: LockDoc = {
    id: LOCK_DOC_ID,
    userId: LOCK_DOC_ID,
    lastRunAt: now.toISOString(),
    lastRunBy: runner,
    lastDeletedFaxes: existing?.lastDeletedFaxes ?? 0,
    lastDeletedBlobs: existing?.lastDeletedBlobs ?? 0,
    lastDurationMs: existing?.lastDurationMs ?? 0,
  };

  try {
    if (existing && etag) {
      // Conditional replace — fails (412) if another instance updated first
      await usersContainer.item(LOCK_DOC_ID, LOCK_DOC_ID).replace(next, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
    } else {
      // First-ever run: create. If two instances race, one will get 409.
      await usersContainer.items.create(next);
    }
    return true;
  } catch {
    return false;
  }
}

async function updateLockSummary(
  runner: string,
  result: { deletedFaxes: number; deletedBlobs: number; durationMs: number }
): Promise<void> {
  const usersContainer = await containers.users();
  try {
    await usersContainer.item(LOCK_DOC_ID, LOCK_DOC_ID).patch([
      { op: "set", path: "/lastDeletedFaxes", value: result.deletedFaxes },
      { op: "set", path: "/lastDeletedBlobs", value: result.deletedBlobs },
      { op: "set", path: "/lastDurationMs", value: result.durationMs },
      { op: "set", path: "/lastRunBy", value: runner },
    ]);
  } catch (err) {
    console.error("[retention-cleanup] failed to update lock summary:", err);
  }
}

/**
 * Core cleanup logic. Caller is responsible for lock acquisition.
 */
async function runCleanup(config: RetentionConfigDoc): Promise<{
  deletedFaxes: number;
  deletedBlobs: number;
  failedDeletes: number;
  overridesApplied: number;
}> {
  const overrideByUser = new Map<string, number>();
  for (const o of config.overrides ?? []) {
    if (o.userId && Number.isFinite(o.retentionDays) && o.retentionDays > 0) {
      overrideByUser.set(o.userId, Math.floor(o.retentionDays));
    }
  }

  const globalDays = Math.max(1, Math.floor(config.globalRetentionDays || 365));
  const now = Date.now();
  // Cutoff for users with no override = global policy.
  const globalCutoffIso = new Date(now - globalDays * 24 * 60 * 60 * 1000).toISOString();

  const faxContainer = await containers.faxMessages();

  let deletedFaxes = 0;
  let deletedBlobs = 0;
  let failedDeletes = 0;

  // -------- Pass 1: per-user overrides --------
  for (const [userId, days] of overrideByUser) {
    const cutoffIso = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

    const { resources } = await faxContainer.items
      .query({
        query:
          "SELECT c.id, c.userId, c.faxImagePath, c.sentDocumentPaths FROM c " +
          "WHERE c.userId = @uid AND c.submitTime < @cutoff",
        parameters: [
          { name: "@uid", value: userId },
          { name: "@cutoff", value: cutoffIso },
        ],
      })
      .fetchAll();

    const r = await deleteBatch(resources);
    deletedFaxes += r.deletedFaxes;
    deletedBlobs += r.deletedBlobs;
    failedDeletes += r.failedDeletes;
  }

  // -------- Pass 2: everyone else (global policy) --------
  // Exclude users that have an override so they aren't double-evaluated.
  // Cosmos NOT IN with parameter array works via ARRAY_CONTAINS negation.
  const overrideUserIds = Array.from(overrideByUser.keys());

  let query =
    "SELECT c.id, c.userId, c.faxImagePath, c.sentDocumentPaths FROM c " +
    "WHERE c.submitTime < @cutoff";
  const parameters: Array<{ name: string; value: unknown }> = [
    { name: "@cutoff", value: globalCutoffIso },
  ];
  if (overrideUserIds.length > 0) {
    query += " AND NOT ARRAY_CONTAINS(@overrideUsers, c.userId)";
    parameters.push({ name: "@overrideUsers", value: overrideUserIds });
  }

  // Cross-partition query — paginate to avoid loading everything into memory.
  const iterator = faxContainer.items.query(
    { query, parameters },
    { maxItemCount: 200 }
  );

  while (iterator.hasMoreResults) {
    const { resources } = await iterator.fetchNext();
    if (resources.length === 0) continue;
    const r = await deleteBatch(resources);
    deletedFaxes += r.deletedFaxes;
    deletedBlobs += r.deletedBlobs;
    failedDeletes += r.failedDeletes;
  }

  return {
    deletedFaxes,
    deletedBlobs,
    failedDeletes,
    overridesApplied: overrideByUser.size,
  };
}

interface FaxRow {
  id: string;
  userId: string;
  faxImagePath?: string;
  sentDocumentPaths?: string[];
}

async function deleteBatch(rows: FaxRow[]): Promise<{
  deletedFaxes: number;
  deletedBlobs: number;
  failedDeletes: number;
}> {
  const faxContainer = await containers.faxMessages();
  let deletedFaxes = 0;
  let deletedBlobs = 0;
  let failedDeletes = 0;

  for (const row of rows) {
    try {
      // Delete blobs first — if Cosmos delete fails afterwards we'd just
      // leave an orphan row that next run picks up again. The reverse
      // (Cosmos first) would orphan blobs forever.
      if (row.faxImagePath) {
        await deleteFaxPdf(row.faxImagePath).catch((err) => {
          console.warn(
            `[retention-cleanup] failed to delete blob ${row.faxImagePath}:`,
            err
          );
          throw err;
        });
        deletedBlobs += 1;
      }
      if (Array.isArray(row.sentDocumentPaths) && row.sentDocumentPaths.length > 0) {
        await deleteBlobsByPaths(row.sentDocumentPaths);
        deletedBlobs += row.sentDocumentPaths.length;
      }

      await faxContainer.item(row.id, row.userId).delete();
      deletedFaxes += 1;
    } catch (err) {
      failedDeletes += 1;
      console.error(`[retention-cleanup] failed to delete fax ${row.id}:`, err);
    }
  }

  return { deletedFaxes, deletedBlobs, failedDeletes };
}

/**
 * Public entry point.
 *
 * @param opts.force      Bypass the daily lock (admin manual trigger).
 * @param opts.runner     Identifier (instance hostname / "manual:<userId>")
 *                         recorded in the lock doc for observability.
 */
export async function runRetentionCleanup(opts: {
  force?: boolean;
  runner?: string;
} = {}): Promise<RetentionRunResult> {
  const runner =
    opts.runner ??
    process.env.WEBSITE_INSTANCE_ID ??
    process.env.HOSTNAME ??
    "scheduler";
  const startedAt = Date.now();

  if (!opts.force) {
    const acquired = await tryAcquireLock(runner);
    if (!acquired) {
      return {
        ranAt: new Date(startedAt).toISOString(),
        globalRetentionDays: 0,
        overridesApplied: 0,
        deletedFaxes: 0,
        deletedBlobs: 0,
        failedDeletes: 0,
        durationMs: 0,
        skipped: "recently_ran",
      };
    }
  } else {
    // Forced manual run still updates lastRunAt so the next scheduled run
    // backs off the normal interval.
    await tryAcquireLock(runner).catch(() => undefined);
  }

  const config = await loadConfig();
  if (!config) {
    return {
      ranAt: new Date(startedAt).toISOString(),
      globalRetentionDays: 0,
      overridesApplied: 0,
      deletedFaxes: 0,
      deletedBlobs: 0,
      failedDeletes: 0,
      durationMs: Date.now() - startedAt,
      skipped: "no_config",
    };
  }

  console.log(
    `[retention-cleanup] start (global=${config.globalRetentionDays}d, overrides=${config.overrides?.length ?? 0})`
  );
  const result = await runCleanup(config);
  const durationMs = Date.now() - startedAt;

  await updateLockSummary(runner, {
    deletedFaxes: result.deletedFaxes,
    deletedBlobs: result.deletedBlobs,
    durationMs,
  });

  console.log(
    `[retention-cleanup] done in ${durationMs}ms — deleted ${result.deletedFaxes} faxes / ${result.deletedBlobs} blobs (failed=${result.failedDeletes})`
  );

  return {
    ranAt: new Date(startedAt).toISOString(),
    globalRetentionDays: config.globalRetentionDays,
    overridesApplied: result.overridesApplied,
    deletedFaxes: result.deletedFaxes,
    deletedBlobs: result.deletedBlobs,
    failedDeletes: result.failedDeletes,
    durationMs,
  };
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the in-process scheduler. Wakes every hour and attempts a run;
 * the Cosmos lock guarantees only one execution per 24h window across
 * all instances.
 */
export function startRetentionScheduler(): void {
  if (schedulerTimer) return;

  const tick = () => {
    runRetentionCleanup().catch((err) =>
      console.error("[retention-cleanup] unhandled error:", err)
    );
  };

  // Wake every hour. (Lock prevents repeat runs within 23h.)
  schedulerTimer = setInterval(tick, 60 * 60 * 1000);

  // Stagger first run so we don't pile work onto cold start.
  setTimeout(tick, 5 * 60 * 1000);

  console.log("[retention-cleanup] scheduler started (hourly tick, 23h lock)");
}

export function stopRetentionScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
