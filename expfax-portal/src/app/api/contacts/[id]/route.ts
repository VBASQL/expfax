import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { normalizePhone } from "@/lib/phone";
import { audit } from "@/lib/audit/logger";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.contacts();
  const { resource } = await container.item(id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(resource);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const container = await containers.contacts();

  const { resource: existing } = await container.item(id, user.id).read();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = {
    ...existing,
    name: body.name ?? existing.name,
    faxNumber: body.faxNumber !== undefined ? normalizePhone(body.faxNumber) : existing.faxNumber,
    company: body.company ?? existing.company,
    email: body.email ?? existing.email,
    notes: body.notes ?? existing.notes,
    updatedAt: new Date().toISOString(),
  };

  await container.item(id, user.id).replace(updated);
  await audit({ userId: user.id, action: "contact.update", resourceType: "contact", resourceId: id, detail: { name: updated.name }, request });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.contacts();
  await container.item(id, user.id).delete();
  await audit({ userId: user.id, action: "contact.delete", resourceType: "contact", resourceId: id });
  return NextResponse.json({ success: true });
}
