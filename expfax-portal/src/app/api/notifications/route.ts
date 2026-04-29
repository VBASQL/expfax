import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();

  // Unread received faxes
  const { resources: received } = await container.items
    .query({
      query: `SELECT c.id, c.senderFaxNumber, c.senderName, c.submitTime, c.documents
              FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false
              ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Recently completed/failed sent faxes (not yet notified)
  const { resources: sentUpdates } = await container.items
    .query({
      query: `SELECT c.id, c.subject, c.status, c.recipients, c.submitTime
              FROM c WHERE c.userId = @uid AND c.direction = 'sent'
              AND c.status IN ('sent', 'failed')
              AND (NOT IS_DEFINED(c.notifiedAt) OR c.notifiedAt = null)
              AND c.isDeleted = false
              ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Count total unread
  const { resources: countResult } = await container.items
    .query({
      query: `SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const notifications = [
    ...received.map((f: Record<string, unknown>) => ({
      id: f.id as string,
      type: "received" as const,
      message: `New fax from ${(f.senderName as string) || (f.senderFaxNumber as string)}`,
      detail: `${((f.documents as Array<{ pageCount?: number }>) || []).reduce((s: number, d) => s + (d.pageCount || 0), 0)} pages`,
      time: f.submitTime as string,
      href: `/inbox/${f.id as string}`,
    })),
    ...sentUpdates.map((f: Record<string, unknown>) => ({
      id: f.id as string,
      type: f.status === "sent" ? ("delivered" as const) : ("failed" as const),
      message: f.status === "sent"
        ? `Fax delivered to ${(f.recipients as Array<{ name?: string; faxNumber?: string }>)?.[0]?.name || (f.recipients as Array<{ name?: string; faxNumber?: string }>)?.[0]?.faxNumber || "recipient"}`
        : `Fax failed — ${(f.recipients as Array<{ name?: string; faxNumber?: string }>)?.[0]?.name || (f.recipients as Array<{ name?: string; faxNumber?: string }>)?.[0]?.faxNumber || "recipient"}`,
      detail: (f.subject as string) || "",
      time: f.submitTime as string,
      href: `/sent/${f.id as string}`,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 15);

  return NextResponse.json({
    notifications,
    unreadCount: (countResult[0] || 0) + sentUpdates.length,
  });
}
