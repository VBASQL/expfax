import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.coverTemplates();

  const { resources } = await container.items
    .query({
      query: "SELECT c.id FROM c WHERE c.userId = @uid AND c.isDefault = true",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  for (const t of resources) {
    await container.item(t.id, user.id).patch([{ op: "set", path: "/isDefault", value: false }]);
  }

  await container.item(id, user.id).patch([{ op: "set", path: "/isDefault", value: true }]);

  return NextResponse.json({ success: true });
}
