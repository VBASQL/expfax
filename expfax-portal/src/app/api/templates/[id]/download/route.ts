import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getTemplateContent } from "@/lib/faxback/templates";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.coverTemplates();
  const { resource } = await container.item(id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await getTemplateContent(resource.templateGuid);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/rtf",
      "Content-Disposition": `attachment; filename="${resource.templateName}"`,
    },
  });
}
