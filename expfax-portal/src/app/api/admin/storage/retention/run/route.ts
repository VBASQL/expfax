import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { runRetentionCleanup } from "@/lib/services/retention-cleanup";
import { audit } from "@/lib/audit/logger";

export const maxDuration = 300; // allow up to 5 minutes for large cleanups

/**
 * Manually trigger a retention cleanup run.
 * Admins only. Bypasses the daily lock.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runRetentionCleanup({
    force: true,
    runner: `manual:${user.id}`,
  });

  await audit({
    userId: user.id,
    action: "admin.retention_update",
    resourceType: "retention",
    resourceId: "manual-run",
    detail: {
      trigger: "manual",
      deletedFaxes: result.deletedFaxes,
      deletedBlobs: result.deletedBlobs,
      failedDeletes: result.failedDeletes,
      durationMs: result.durationMs,
    },
    request,
  });

  return NextResponse.json(result);
}
