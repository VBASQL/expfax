import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { addTemplate } from "@/lib/faxback/templates";
import { generateTemplateRtf } from "@/lib/covers/rtf-generator";
import { v4 as uuid } from "uuid";
import type { CoverTemplate } from "@/types";

export async function GET() {
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
}

const MAX_IMAGE_BYTES = 512 * 1024; // 512 KB decoded

export async function POST(request: Request) {
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

  // Generate RTF with FaxBack $(FieldName) placeholders and upload
  const rtf = generateTemplateRtf({
    bodyText: bodyText || "",
    headerImageBase64: headerImageBase64 || undefined,
    headerImageType: headerImageType || undefined,
  });
  const contentBase64 = Buffer.from(rtf).toString("base64");
  const fbGuid = await addTemplate(name.trim(), contentBase64, false);

  const now = new Date().toISOString();
  const template: CoverTemplate = {
    id: uuid(),
    userId: user.id,
    templateName: name.trim(),
    templateGuid: fbGuid,
    bodyText: bodyText || "",
    headerImageBase64: headerImageBase64 || undefined,
    headerImageType: headerImageType || undefined,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };

  const container = await containers.coverTemplates();
  await container.items.create(template);

  return NextResponse.json(template, { status: 201 });
}
