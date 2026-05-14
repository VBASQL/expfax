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
    `\\pard\\qc{\\pict${picType}\\picwgoal7920\\pichgoal1440 ${hex}}\\par\\par\n`
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

  // Table row: right-aligned gray uppercase label | bold value. Skipped if value is empty.
  // cellx2520 ≈ 1.75" label col; cellx9360 = full text width (8.5" − 2×1" margins)
  function tRow(label: string, value: string, larger = false): string {
    if (!value.trim()) return "";
    const fs = larger ? "\\fs26" : "\\fs20";
    return (
      `\\trowd\\trgaph108\n` +
      `\\clbrdrl\\brdrnone\\clbrdrt\\brdrnone\\clbrdrb\\brdrnone\\clbrdrr\\brdrnone\\cellx2520\n` +
      `\\clbrdrl\\brdrnone\\clbrdrt\\brdrnone\\clbrdrb\\brdrnone\\clbrdrr\\brdrnone\\cellx9360\n` +
      `\\pard\\intbl\\qr\\b0\\f1\\fs16\\cf2 ${label}\\cell\n` +
      `\\pard\\intbl\\ql\\b\\f1${fs} ${value}\\b0\\cell\\row\n`
    );
  }

  const thickRule = `\\pard\\brdrb\\brdrs\\brdrw30\\brdrsp40\\f1\\fs4  \\par\n`;
  const thinRule  = `\\pard\\brdrb\\brdrs\\brdrw15\\brdrsp40\\f1\\fs4  \\par\n`;
  const spacer    = `\\pard\\par\n`;

  const toBlock =
    tRow("TO", fields.to, true) +
    tRow("COMPANY", fields.toCompany);

  const fromBlock =
    tRow("FROM", fields.from, true) +
    tRow("COMPANY", fields.fromCompany) +
    tRow("FAX", fields.fax) +
    tRow("VOICE", fields.voice);

  const subjectLine = fields.subject.trim()
    ? `\\pard\\ql\\b\\f1\\fs20\\cf2 SUBJECT\\b0\\cf1\\f1\\fs20   ${fields.subject}\\par\n`
    : "";

  const bodyText = fields.body.trim()
    ? `\\pard\\ql\\f0\\fs22 ${fields.body}\\par\n`
    : "";

  return (
    `{\\rtf1\\ansi\\deff0\n` +
    `{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}\n` +
    `{\\colortbl;\\red0\\green0\\blue0;\\red100\\green100\\blue100;}\n` +
    `\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\n\n` +
    header +
    thickRule +
    `\\pard\\qc\\b\\f1\\fs52 FAX TRANSMISSION\\b0\\par\n` +
    thickRule +
    spacer +
    `\\pard\\qr\\f1\\fs18\\cf2 ${fields.date}\\cf1\\par\n` +
    spacer +
    toBlock +
    (toBlock && fromBlock ? spacer : "") +
    fromBlock +
    spacer +
    thinRule +
    subjectLine +
    spacer +
    bodyText +
    `}`
  );
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
  // $(Cover) is the FaxBack field substituted with the sender's per-fax message.
  // It must always appear in the template. The user's bodyText is static preamble text
  // that appears above it. If the user manually placed $(Cover) in their text, respect
  // that position; otherwise auto-append it so the message always shows.
  const staticText = opts.bodyText?.trim();
  let body: string;
  if (!staticText) {
    body = "$(Cover)";
  } else if (staticText.includes("$(Cover)")) {
    body = rtfEscape(staticText); // user placed $(Cover) themselves — use as-is
  } else {
    body = rtfEscape(staticText) + "\\par\n$(Cover)"; // static preamble + message
  }

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
