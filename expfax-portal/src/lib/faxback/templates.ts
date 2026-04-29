import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";

export async function addTemplate(
  name: string,
  contentBase64: string,
  failIfExists = false
): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<AddTemplate>
  <Name>${name}</Name>
  <Content>${contentBase64}</Content>
  <FailIfExists>${failIfExists}</FailIfExists>
</AddTemplate>`;

  const res = await faxbackFetch("Accounts/AddTemplate", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) throw new Error(`AddTemplate failed: ${res.status}`);
}

export async function getTemplateContent(name: string): Promise<string> {
  const res = await faxbackFetch(`Accounts/GetTemplateContent?Name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`GetTemplateContent failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed?.Template?.Content || "";
}

export async function deleteTemplate(name: string): Promise<void> {
  const res = await faxbackFetch(`Accounts/DeleteTemplate?Name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`DeleteTemplate failed: ${res.status}`);
}
