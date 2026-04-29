/**
 * RTF cover page generator for FaxBack.
 *
 * Template mode  – uses $(FieldName) placeholders that FaxBack substitutes
 *                  at send time. The RTF is uploaded to FaxBack as a named template.
 *
 * One-time mode  – fills actual values into the RTF and sends it as the first
 *                  document (cover page) without creating a FaxBack template.
 */

function rtfEscape(text: string): string {
  return (
    text
      // RTF special chars (preserve existing RTF escape sequences)
      .replace(/\\/g, "\\\\")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      // Newlines → paragraph breaks
      .replace(/\r?\n/g, "\\par\n")
  );
}

function imageRtf(base64: string, imageType: "png" | "jpeg"): string {
  const picType = imageType === "png" ? "\\pngblip" : "\\jpegblip";
  const buf = Buffer.from(base64, "base64");
  const hex = buf.toString("hex");
  // picwgoal / pichgoal are in twips (1440 twips = 1 inch).
  // 7920 ≈ 5.5 in wide, 1440 ≈ 1 in tall — reasonable letterhead proportions.
  return (
    `\\pard\\qc{\\pict${picType}\\picwgoal7920\\pichgoal1440\n${hex}}\\par\\par\n`
  );
}

function coverLayout(fields: {
  date: string;
  to: string;
  toCompany: string;
  from: string;
  fromCompany: string;
  fax: string;
  voice: string;
  subject: string;
  body: string;
  headerImageBase64?: string;
  headerImageType?: "png" | "jpeg";
}): string {
  const header =
    fields.headerImageBase64 && fields.headerImageType
      ? imageRtf(fields.headerImageBase64, fields.headerImageType)
      : "";

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440

${header}\\pard\\qc\\b\\f1\\fs28 FACSIMILE COVER PAGE\\b0\\f1\\fs20\\par
\\pard\\ql\\par
{\\b Date:} ${fields.date}\\par
\\par
{\\b To:} ${fields.to}\\par
{\\b Company:} ${fields.toCompany}\\par
\\par
{\\b From:} ${fields.from}\\par
{\\b Company:} ${fields.fromCompany}\\par
{\\b Fax:} ${fields.fax}\\par
{\\b Voice:} ${fields.voice}\\par
\\par
{\\b Subject:} ${fields.subject}\\par
\\par
\\pard\\ql\\brdrb\\brdrs\\brdrw10\\brsp20 \\par
\\par
${fields.body}\\par
}`;
}

/**
 * Generates an RTF template with $(FieldName) FaxBack placeholders.
 * Used when saving a named template to FaxBack.
 */
export function generateTemplateRtf(opts: {
  bodyText: string;
  headerImageBase64?: string;
  headerImageType?: "png" | "jpeg";
}): string {
  const body = opts.bodyText?.trim()
    ? rtfEscape(opts.bodyText)
    : "$(Comments)";

  return coverLayout({
    date: "$(Date)",
    to: "$(ReceiverName)",
    toCompany: "$(ReceiverCompany)",
    from: "$(SenderName)",
    fromCompany: "$(SenderCompany)",
    fax: "$(SenderFax)",
    voice: "$(SenderVoice)",
    subject: "$(Subject)",
    body,
    headerImageBase64: opts.headerImageBase64,
    headerImageType: opts.headerImageType,
  });
}

/**
 * Generates a fully-rendered RTF cover page with real values.
 * Used for one-time cover pages sent as the first document of a fax.
 */
export function generateOneTimeCoverRtf(opts: {
  senderName: string;
  senderCompany: string;
  senderFax: string;
  senderVoice: string;
  receiverName: string;
  receiverCompany: string;
  subject: string;
  message: string;
  headerImageBase64?: string;
  headerImageType?: "png" | "jpeg";
}): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return coverLayout({
    date: rtfEscape(date),
    to: rtfEscape(opts.receiverName),
    toCompany: rtfEscape(opts.receiverCompany),
    from: rtfEscape(opts.senderName),
    fromCompany: rtfEscape(opts.senderCompany),
    fax: rtfEscape(opts.senderFax),
    voice: rtfEscape(opts.senderVoice),
    subject: rtfEscape(opts.subject),
    body: rtfEscape(opts.message),
    headerImageBase64: opts.headerImageBase64,
    headerImageType: opts.headerImageType,
  });
}
