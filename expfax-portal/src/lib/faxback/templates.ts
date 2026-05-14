import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";

export async function addTemplate(
  name: string,
  contentBase64: string,
  failIfExists = false,
  setAsDefault = false
): Promise<string> {
  // API endpoint is AddTemplateContent, body uses <NSX><Template>...</Template></NSX>
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Template>
    <TemplateName>${escapeXml(name)}</TemplateName>
    <ContentData>${contentBase64}</ContentData>
    <FailIfExists>${failIfExists ? "True" : "False"}</FailIfExists>
    <DefaultTemplate>${setAsDefault ? "True" : "False"}</DefaultTemplate>
  </Template>
</NSX>`;

  const res = await faxbackFetch("Accounts/AddTemplate", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AddTemplate failed: ${res.status} — ${errText}`);
  }

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed?.NSX?.TemplateGuid || parsed?.TemplateGuid || "";
}

export async function getTemplateContent(templateGuid: string): Promise<Buffer> {
  // GetTemplateContent returns the raw file (e.g., Content-Type: text/rtf)
  const res = await faxbackFetch(`Accounts/GetTemplateContent?TemplateGuid=${encodeURIComponent(templateGuid)}`);
  if (!res.ok) throw new Error(`GetTemplateContent failed: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function getTemplates(accountGuid?: string): Promise<Array<{
  templateGuid: string;
  templateName: string;
  templateSize: number;
  isDefault: boolean;
}>> {
  let url = "Accounts/GetTemplates";
  if (accountGuid) url += `&AccountGuid=${encodeURIComponent(accountGuid)}`;
  const res = await faxbackFetch(url);
  if (!res.ok) throw new Error(`GetTemplates failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const nsx = parsed?.NSX || parsed;
  const defaultName = nsx?.DefaultTemplate || "";
  const templates = nsx?.Templates?.Template;
  if (!templates) return [];
  const arr = Array.isArray(templates) ? templates : [templates];
  return arr.map((t: Record<string, string>) => ({
    templateGuid: t.TemplateGuid || "",
    templateName: t.TemplateName || "",
    templateSize: parseInt(t.TemplateSize || "0", 10),
    isDefault: t.TemplateName === defaultName,
  }));
}

export async function deleteTemplate(templateGuid: string): Promise<void> {
  const res = await faxbackFetch(`Accounts/DeleteTemplate?TemplateGuid=${encodeURIComponent(templateGuid)}`);
  if (!res.ok) throw new Error(`DeleteTemplate failed: ${res.status}`);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
