import { NextResponse } from "next/server";
import { runRetentionCleanup } from "@/lib/services/retention-cleanup";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Webhook trigger for the retention cleanup job.
 *
 * Authenticated by a shared secret (CRON_SECRET) provisioned via
 * Key Vault. Called by the Logic App on a daily schedule.
 *
 * The in-process scheduler also fires hourly as a fallback; both
 * paths are de-duped by the Cosmos lock in retention-cleanup.ts.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runRetentionCleanup({
    force: false, // Respect the daily lock — Logic App may retry on transient failures
    runner: "logic-app",
  });

  return NextResponse.json(result);
}
