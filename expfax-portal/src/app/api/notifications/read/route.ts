import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const now = new Date().toISOString();

  // Dismiss received fax notifications (keeps isRead = false so they remain unread in inbox)
  const { resources: receivedPending } = await container.items
    .query({
      query: `SELECT c.id FROM c WHERE c.userId = @uid AND c.direction = 'received'
              AND c.isRead = false AND c.isDeleted = false
              AND (NOT IS_DEFINED(c.notificationDismissedAt) OR c.notificationDismissedAt = null)`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  for (const item of receivedPending) {
    await container.item(item.id, user.id).patch([
      { op: "add", path: "/notificationDismissedAt", value: now },
    ]);
  }

  // Mark all un-notified sent completions as notified
  const { resources: pending } = await container.items
    .query({
      query: `SELECT c.id FROM c WHERE c.userId = @uid AND c.direction = 'sent'
              AND c.status IN ('sent', 'failed')
              AND (NOT IS_DEFINED(c.notifiedAt) OR c.notifiedAt = null)
              AND c.isDeleted = false`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  for (const item of pending) {
    await container.item(item.id, user.id).patch([
      { op: "set", path: "/notifiedAt", value: now },
    ]);
  }

  return NextResponse.json({ success: true, marked: pending.length + receivedPending.length });
}
