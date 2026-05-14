import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getFaxWithAccess } from "@/lib/db/fax-access";
import { audit } from "@/lib/audit/logger";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(result.fax);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const patches: object[] = [
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ];

  if (Array.isArray(body.tags)) {
    // Sanitize: max 20 tags, each max 50 chars, trimmed, no duplicates, no empty strings
    const tags = [...new Set(
      (body.tags as unknown[])
        .map((t) => String(t).trim().slice(0, 50))
        .filter((t) => t.length > 0)
    )].slice(0, 20);
    patches.push({ op: "set", path: "/tags", value: tags });
  }

  const container = await containers.faxMessages();
  await container.item(id, result.partitionKey).patch(patches);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const container = await containers.faxMessages();
  await container.item(id, result.partitionKey).patch([
    { op: "set", path: "/isDeleted", value: true },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);
  await audit({ userId: user.id, action: "fax.delete", resourceType: "fax", resourceId: id, request: req });

  return NextResponse.json({ success: true });
}
