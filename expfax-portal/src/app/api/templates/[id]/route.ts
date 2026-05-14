import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import type { CoverTemplate } from "@/types";
import { audit } from "@/lib/audit/logger";

const MAX_IMAGE_BYTES = 512 * 1024;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { name, bodyText, headerImageBase64, headerImageType } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });

    if (headerImageBase64) {
      const decodedBytes = Math.ceil((headerImageBase64.length * 3) / 4);
      if (decodedBytes > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Header image must be under 512 KB" }, { status: 400 });
      }
    }

    const container = await containers.coverTemplates();
    const { resource } = await container.item(id, user.id).read<CoverTemplate>();
    if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Templates are Cosmos-only — rendered as HTML at send time via generateCoverHtml.
    const updated: CoverTemplate = {
      ...resource,
      templateName: name.trim(),
      bodyText: bodyText || "",
      headerImageBase64: headerImageBase64 || undefined,
      headerImageType: headerImageType || undefined,
      updatedAt: new Date().toISOString(),
    };
    await container.item(id, user.id).replace(updated);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/templates/:id]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.coverTemplates();
  const { resource } = await container.item(id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await container.item(id, user.id).delete();
  await audit({ userId: user.id, action: "template.delete", resourceType: "template", resourceId: id });

  return NextResponse.json({ success: true });
}
