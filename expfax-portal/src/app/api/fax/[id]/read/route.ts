import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxMessages();
  await container.item(id, user.id).patch([
    { op: "set", path: "/isRead", value: true },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
