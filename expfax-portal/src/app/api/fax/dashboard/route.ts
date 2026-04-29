import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getQueueCounts } from "@/lib/faxback/queues";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const faxContainer = await containers.faxMessages();

  // Unread received count
  const { resources: unreadResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Currently sending count
  const { resources: sendingResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.status IN ('queued', 'sending')",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Recent activity (last 10)
  const { resources: recentActivity } = await faxContainer.items
    .query({
      query: "SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.isRead FROM c WHERE c.userId = @uid AND c.isDeleted = false ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Total sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { resources: sentTodayResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'sent' AND c.submitTime >= @today",
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@today", value: today.toISOString() },
      ],
    })
    .fetchAll();

  // FaxBack queue counts (from live server)
  let queueCounts = null;
  try {
    queueCounts = await getQueueCounts();
  } catch (err) {
    console.error("Failed to get queue counts:", err);
  }

  return NextResponse.json({
    unreadCount: unreadResult[0] || 0,
    sendingCount: sendingResult[0] || 0,
    sentToday: sentTodayResult[0] || 0,
    recentActivity,
    queueCounts,
  });
}
