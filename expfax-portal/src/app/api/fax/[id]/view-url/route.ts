import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getFaxWithAccess } from "@/lib/db/fax-access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { fax } = result;

  // Return the portal download route so the browser streams the PDF through our
  // authenticated API. This avoids generating SAS URLs (which require account-key
  // credentials and don't work with DefaultAzureCredential / managed identity).
  if (fax.faxImagePath) {
    return NextResponse.json({ url: `/api/fax/${id}/download?inline=1` });
  }

  // Fallback for sent faxes: the rendered fax PDF is only available after the queue
  // poller processes queue 4/5. While the fax is still in transit (or the PDF download
  // hasn't run yet), serve the first uploaded document from sentDocumentPaths as a
  // preview — but only if it is a PDF (browsers can't inline TIFF/RTF).
  const sentPaths: string[] = Array.isArray(fax.sentDocumentPaths) ? fax.sentDocumentPaths : [];
  const pdfIdx = sentPaths.findIndex((p: string) => p.toLowerCase().endsWith(".pdf"));
  if (pdfIdx !== -1) {
    return NextResponse.json({ url: `/api/fax/${id}/download?inline=1&sentdoc=${pdfIdx}` });
  }

  return NextResponse.json({ error: "Preview not available" }, { status: 404 });
}
