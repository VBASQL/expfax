import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const container = await containers.users();
  const { resources } = await container.items
    .query("SELECT * FROM c WHERE NOT IS_DEFINED(c.type) AND (NOT IS_DEFINED(c.role) OR c.role != 'admin') ORDER BY c.displayName")
    .fetchAll();

  return NextResponse.json({ items: resources });
}
