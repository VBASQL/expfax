import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

// Dismiss a single notification (hides from bell, does not mark received fax as read).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxMessages();

  const { resource } = await container.item(id, user.id).read<{
    direction?: string;
  }>();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const path =
    resource.direction === "received" ? "/notificationDismissedAt" : "/notifiedAt";

  await container.item(id, user.id).patch([{ op: "add", path, value: now }]);

  return NextResponse.json({ success: true });
}
