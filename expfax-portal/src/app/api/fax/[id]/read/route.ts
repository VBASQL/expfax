import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getFaxWithAccess } from "@/lib/db/fax-access";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const container = await containers.faxMessages();
  await container.item(id, result.partitionKey).patch([
    { op: "set", path: "/isRead", value: true },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
