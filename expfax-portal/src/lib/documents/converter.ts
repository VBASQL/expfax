/**
 * Server-side document preparation for FaxBack SendMessage.
 *
 * FaxBack natively handles: TIFF, PDF, RTF, plain text, HTML, Word (DOC/DOCX).
 * It does NOT natively render arbitrary raster images (PNG, JPEG, WEBP, BMP, GIF, DCX).
 *
 * This module converts unsupported image formats → single-page or multi-page TIFF
 * before they are base64-encoded and forwarded to FaxBack.
 */

import sharp from "sharp";
import path from "path";

// ─── FaxBack DocumentType numeric values ────────────────────────────────────
// 0 = auto-detect (FaxBack guesses from content)
// 1 = TIFF
// 2 = DCX (multi-page PCX, legacy fax)
// Other formats: FaxBack treats them as raw renderable documents when type=0
export const DOC_TYPE_AUTO = 0;
export const DOC_TYPE_TIFF = 1;
export const DOC_TYPE_DCX  = 2;

// Extensions FaxBack handles natively (pass through, type=auto)
const NATIVE_EXTENSIONS = new Set([
  ".pdf",
  ".tif", ".tiff",
  ".rtf",
  ".doc", ".docx",
  ".txt",
  ".html", ".htm",
  ".dcx",
]);

// Extensions that need raster→TIFF conversion
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg", ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
]);

// Max fax width in pixels at 200 DPI (standard A4/Letter = 1728 px)
const FAX_WIDTH_PX = 1728;

/**
 * Convert a raster image buffer to a fax-compatible TIFF buffer.
 * - White background (handles PNG/WEBP transparency)
 * - Grayscale (reduces size, fax-friendly)
 * - Resize to standard fax width preserving aspect ratio
 * - LZW compression (supported everywhere; FaxBack re-compresses for transmission)
 */
export async function imageToTiff(input: Buffer): Promise<Buffer> {
  return sharp(input)
    // Flatten transparent channels onto white background
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    // Convert to grayscale (fax standard is monochrome/grey)
    .grayscale()
    // Fit within standard fax width; do not upscale if already smaller
    .resize({ width: FAX_WIDTH_PX, withoutEnlargement: true, fit: "inside" })
    // Output as TIFF with LZW compression at 200 DPI
    .tiff({
      compression: "lzw",
      predictor: "none",
      xres: 200,
      yres: 200,
      resolutionUnit: "inch",
    })
    .toBuffer();
}

export interface PreparedDocument {
  name: string;
  contentBase64: string;
  documentType: number;
}

/**
 * Prepare a single document for sending via FaxBack SendMessage.
 * - Native formats (PDF, TIFF, RTF, DOCX, TXT, HTML, DCX) pass through unchanged.
 * - Image formats (PNG, JPEG, WEBP, BMP, GIF) are converted to TIFF.
 * Returns the document with the correct documentType and (possibly converted) base64.
 */
export async function prepareFaxDocument(
  name: string,
  contentBase64: string
): Promise<PreparedDocument> {
  const ext = path.extname(name).toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext)) {
    const inputBuf = Buffer.from(contentBase64, "base64");
    const tiffBuf  = await imageToTiff(inputBuf);
    const tiffName = name.replace(/\.[^.]+$/, ".tiff");
    return {
      name: tiffName,
      contentBase64: tiffBuf.toString("base64"),
      documentType: DOC_TYPE_TIFF,
    };
  }

  // Native or unknown → pass through, let FaxBack auto-detect
  const docType = ext === ".dcx" ? DOC_TYPE_DCX
                : NATIVE_EXTENSIONS.has(ext) ? DOC_TYPE_AUTO
                : DOC_TYPE_AUTO;

  return { name, contentBase64, documentType: docType };
}

/**
 * Classify an extension for display in the UI (client-safe, no server imports).
 */
export function fileCategory(filename: string): "pdf" | "word" | "image" | "tiff" | "text" | "other" {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf")                                    return "pdf";
  if (ext === ".tif" || ext === ".tiff" || ext === ".dcx") return "tiff";
  if (ext === ".doc" || ext === ".docx")                 return "word";
  if (ext === ".rtf" || ext === ".txt" || ext === ".html" || ext === ".htm") return "text";
  if (IMAGE_EXTENSIONS.has(ext))                         return "image";
  return "other";
}
