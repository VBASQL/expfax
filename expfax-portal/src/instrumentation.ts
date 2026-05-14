/**
 * Next.js instrumentation hook — runs once when the server boots.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * We use this to start the FaxBack queue pollers so incoming faxes
 * and outgoing fax status updates are synced into Cosmos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic import so the poller (with its Node-only dependencies) is
  // only loaded in the Node.js runtime.
  const { startQueuePollers } = await import("@/lib/services/queue-poller");
  startQueuePollers();

  // Daily retention cleanup — deletes blobs + Cosmos rows for faxes
  // older than the admin-configured per-user / global retention policy.
  const { startRetentionScheduler } = await import(
    "@/lib/services/retention-cleanup"
  );
  startRetentionScheduler();
}
