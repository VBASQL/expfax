import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { downloadFaxPdf } from "@/lib/services/blob-storage";
import { getFaxWithAccess } from "@/lib/db/fax-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { fax } = result;

  const inline = _req.nextUrl.searchParams.get("inline") === "1";
  const sentDocParam = _req.nextUrl.searchParams.get("sentdoc");

  // Serve a specific sentDocument blob when requested.
  // Used as a fallback preview while the rendered fax PDF is not yet available.
  if (sentDocParam !== null) {
    const idx = parseInt(sentDocParam, 10);
    const sentPaths: string[] = Array.isArray(fax.sentDocumentPaths) ? fax.sentDocumentPaths : [];
    const blobPath = sentPaths[idx];
    if (!blobPath) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buf = await downloadFaxPdf(blobPath);
    const ext = blobPath.split(".").pop()?.toLowerCase() ?? "pdf";
    const contentType =
      ext === "pdf" ? "application/pdf" :
      ext === "tiff" || ext === "tif" ? "image/tiff" :
      "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="fax-doc-${id}.${ext}"`,
      },
    });
  }

  if (!fax.faxImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await downloadFaxPdf(fax.faxImagePath);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="fax-${id}.pdf"`,
    },
  });
}
