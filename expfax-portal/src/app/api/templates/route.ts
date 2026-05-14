import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { CoverTemplate } from "@/types";
import { audit } from "@/lib/audit/logger";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const container = await containers.coverTemplates();
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @uid OR c.userId = null ORDER BY c.templateName",
        parameters: [{ name: "@uid", value: user.id }],
      })
      .fetchAll();

    return NextResponse.json({ items: resources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const MAX_IMAGE_BYTES = 512 * 1024; // 512 KB decoded

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, bodyText, headerImageBase64, headerImageType } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    if (headerImageBase64) {
      const decodedBytes = Math.ceil((headerImageBase64.length * 3) / 4);
      if (decodedBytes > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Header image must be under 512 KB" }, { status: 400 });
      }
    }

    // Templates are Cosmos-only. The actual cover page is generated as HTML at send
    // time via generateCoverHtml — same renderer the preview uses, so WYSIWYG.
    const now = new Date().toISOString();
    const template: CoverTemplate = {
      id: uuid(),
      userId: user.id,
      templateName: name.trim(),
      templateGuid: "",
      bodyText: bodyText || "",
      headerImageBase64: headerImageBase64 || undefined,
      headerImageType: headerImageType || undefined,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };

    const container = await containers.coverTemplates();
    await container.items.create(template);

    await audit({ userId: user.id, action: "template.upload", resourceType: "template", resourceId: template.id, request });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
