import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import sharp from "sharp";
import { imageToTiff } from "@/lib/documents/converter";
import path from "path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);

// 20 MB decoded limit — same as send limit
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * POST /api/fax/preview-document
 * Body: { name: string, contentBase64: string }
 *
 * For image files: runs the full fax conversion pipeline (→ grayscale TIFF 1728 px wide @ 200 DPI)
 * then converts the result back to PNG for browser display, so the user sees exactly what the
 * fax page will look like after conversion.
 *
 * For PDFs: echoes the content back as a PDF data URL (browser renders it natively).
 *
 * For RTF, Word, TXT, TIFF, DCX, etc.: returns type "unsupported" (no browser renderer available).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, contentBase64 } = await request.json() as {
    name?: string;
    contentBase64?: string;
  };

  if (!name || !contentBase64) {
    return NextResponse.json({ error: "name and contentBase64 required" }, { status: 400 });
  }

  const inputBuf = Buffer.from(contentBase64, "base64");
  if (inputBuf.length > MAX_BYTES) {
    return NextResponse.json({ type: "too_large", dataUrl: null });
  }

  const ext = path.extname(name).toLowerCase();

  // ── Images ── convert to fax TIFF, then back to PNG for display
  if (IMAGE_EXTENSIONS.has(ext)) {
    const tiffBuf = await imageToTiff(inputBuf);
    const pngBuf = await sharp(tiffBuf).png().toBuffer();
    return NextResponse.json({
      type: "image",
      dataUrl: `data:image/png;base64,${pngBuf.toString("base64")}`,
    });
  }

  // ── PDF ── return as-is; browser iframe renders it
  if (ext === ".pdf") {
    return NextResponse.json({
      type: "pdf",
      dataUrl: `data:application/pdf;base64,${contentBase64}`,
    });
  }

  // ── Everything else (RTF, DOCX, TXT, TIFF, DCX…) ── not renderable in browser
  return NextResponse.json({ type: "unsupported", dataUrl: null });
}
