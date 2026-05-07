/**
 * Cover page HTML generator for one-time fax covers.
 *
 * Pure function — no Node.js or browser-only APIs.
 * Safe to import in both server API routes and client components.
 *
 * Based on real-world fax-render testing, FaxBack's HTML renderer:
 *   ✅ Tables, borders, system fonts (Arial, Times, Courier), inline styles
 *   ✅ CSS <style> blocks, nth-child selectors
 *   ✅ SVG data URIs and external HTTPS images
 *   ❌ Base64 PNG/JPEG data URIs (rendered as blank)
 *   ❌ Emoji (dropped silently)
 *
 * This generator uses only confirmed-working features so the preview iframe
 * and the transmitted document are byte-identical.
 */

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string, large = false): string {
  if (!value.trim()) return "";
  return `
    <tr>
      <td style="text-align:right;vertical-align:top;padding:3pt 14pt 3pt 0;font-size:8.5pt;font-weight:bold;color:#555;font-family:Arial,sans-serif;white-space:nowrap;width:1.3in;text-transform:uppercase;letter-spacing:0.5px;">${esc(label)}</td>
      <td style="vertical-align:top;padding:3pt 0;font-size:${large ? "14pt" : "11pt"};font-weight:${large ? "bold" : "normal"};font-family:Arial,sans-serif;">${esc(value)}</td>
    </tr>`;
}

export interface CoverHtmlOptions {
  senderName: string;
  senderCompany: string;
  senderFax: string;
  senderVoice: string;
  receiverName: string;
  receiverCompany: string;
  subject: string;
  message: string;
  /** Defaults to today in en-US long format */
  date?: string;
}

export function generateCoverHtml(opts: CoverHtmlOptions): string {
  const date =
    opts.date ??
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const toBlock = [
    row("TO", opts.receiverName, true),
    row("COMPANY", opts.receiverCompany),
  ].join("");

  const fromBlock = [
    row("FROM", opts.senderName, true),
    row("COMPANY", opts.senderCompany),
    row("FAX", opts.senderFax),
    row("VOICE", opts.senderVoice),
  ].join("");

  const subjectLine = opts.subject.trim()
    ? `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:11pt;">` +
      `<span style="font-size:9pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#555;">Subject:&nbsp;</span>` +
      `${esc(opts.subject)}</p>`
    : "";

  const messageBlock = opts.message.trim()
    ? `<p style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;margin:0;white-space:pre-wrap;">${esc(opts.message)}</p>`
    : "";

  const hasBody = opts.subject.trim() || opts.message.trim();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: letter; margin: 0; }
  html, body { width: 816px; }
  body {
    margin: 0.85in 1in 1in 1in;
    padding: 0;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
    box-sizing: border-box;
  }
  table { border-collapse: collapse; width: 100%; }
</style>
<script>
  /* Preview-only: scale the page to fit the iframe width. FaxBack ignores scripts. */
  function applyZoom() {
    var scale = window.innerWidth / 816;
    document.body.style.zoom = scale;
    document.body.style.width = '816px';
    document.body.style.transformOrigin = 'top left';
  }
  document.addEventListener('DOMContentLoaded', applyZoom);
  window.addEventListener('resize', applyZoom);
<\/script>
</head>
<body>

  <!-- ===== HEADER BANNER ===== -->
  <table style="width:100%;margin-bottom:4pt;">
    <tr>
      <td style="border-top:4px solid #000;border-bottom:4px solid #000;padding:10pt 0;text-align:center;">
        <span style="font-family:Arial,sans-serif;font-size:24pt;font-weight:bold;letter-spacing:4px;text-transform:uppercase;">Fax Transmission</span>
      </td>
    </tr>
  </table>

  <!-- ===== DATE ===== -->
  <p style="font-family:Arial,sans-serif;font-size:9pt;color:#555;text-align:right;margin:6pt 0 18pt;">
    ${esc(date)}
  </p>

  <!-- ===== TO / FROM ===== -->
  ${toBlock ? `<table style="width:100%;margin-bottom:14pt;">${toBlock}</table>` : ""}
  ${fromBlock ? `<table style="width:100%;margin-bottom:14pt;">${fromBlock}</table>` : ""}

  ${hasBody ? `<hr style="border:none;border-top:1px solid #999;margin:0 0 16pt;">` : ""}
  ${subjectLine}
  ${messageBlock}

</body>
</html>`;
}
