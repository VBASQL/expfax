import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getFaxViewUrl } from "@/lib/services/blob-storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxMessages();
  const { resource: fax } = await container.item(id, user.id).read();

  if (!fax || !fax.faxImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getFaxViewUrl(fax.faxImagePath);
  return NextResponse.json({ url });
}
