import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { downloadFaxPdf } from "@/lib/services/blob-storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxMessages();
  const { resource: fax } = await container.item(id, user.id).read();

  if (!fax || !fax.faxImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await downloadFaxPdf(fax.faxImagePath);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fax-${id}.pdf"`,
    },
  });
}
