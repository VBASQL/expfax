import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackMessageDetail, SendMessageParams } from "./types";

export async function readMessage(handle: string): Promise<FaxBackMessageDetail> {
  const res = await faxbackFetch(`Messages/ReadMessage?MessageHandle=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`ReadMessage failed: ${res.status}`);

  const text = await res.text();

  // Server returns JSON for GET requests
  try {
    const json = JSON.parse(text);
    const msg = json?.NSX?.Message ?? json?.Message ?? json;
    if (msg && typeof msg === "object") return msg as FaxBackMessageDetail;
  } catch {
    // not JSON — fall through to XML
  }

  // XML fallback
  const parsed = await parseStringPromise(text, { explicitArray: false });
  const msg = parsed?.NSX?.Message || parsed?.Message;
  return msg as FaxBackMessageDetail;
}

export async function readMessageBlock(
  handles: string[],
  actionType?: string
): Promise<FaxBackMessageDetail[]> {
  const cleanHandles = handles.map((h) => h.trim()).filter((h) => h.length > 0);
  if (cleanHandles.length === 0) return [];

  // Doc: pass the same ActionType to ReadMessageBlock that was used in ReadQueue
  const actionParam = actionType ? `&ActionType=${encodeURIComponent(actionType)}` : "";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <MessageHandles>${cleanHandles.map((h) => escapeXml(h)).join(",")}</MessageHandles>
</NSX>`;

  const res = await faxbackFetch(`Messages/ReadMessageBlock?NonBrowser=1${actionParam}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `ReadMessageBlock failed: ${res.status} (handles=${cleanHandles.length}, sample=${cleanHandles[0]?.slice(0, 40)}) ${errBody.slice(0, 400)}`
    );
  }

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const messages = parsed?.NSX?.Message || parsed?.Message;
  if (!messages) return [];
  return Array.isArray(messages) ? messages : [messages];
}

export async function buildFaxImage(handle: string): Promise<Buffer> {
  const res = await faxbackFetch(`Messages/BuildFaxImage?MessageHandle=${encodeURIComponent(handle)}&DocumentType=PDF`);
  if (!res.ok) throw new Error(`BuildFaxImage failed: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendMessage(params: SendMessageParams): Promise<string> {
  // Build per-recipient XML — API uses <Address> for the fax number
  const recipientXml = params.recipients
    .map(
      (r) => `    <Recipient>
      <Name>${escapeXml(r.name)}</Name>
      <Address>${escapeXml(r.faxNumber)}</Address>
      <Prefix>${r.prefix ?? 0}</Prefix>
    </Recipient>`
    )
    .join("\n");

  // Build per-document XML — API uses <ContentData> for base64 content
  const documentXml = params.documents
    .map(
      (d) => `    <Document>
      <DocumentPart>1</DocumentPart>
      <Name>${escapeXml(d.name)}</Name>
      <ContentData>${d.contentBase64}</ContentData>
      <DocumentType>${d.documentType ?? 0}</DocumentType>
    </Document>`
    )
    .join("\n");

  // If there's an inline cover message, prepend it as a DocumentPart=0 document
  const coverDocXml = params.coverMessage
    ? `    <Document>
      <DocumentPart>0</DocumentPart>
      <ContentText>${escapeXml(params.coverMessage)}</ContentText>
    </Document>\n`
    : "";

  // FaxBack NSX REST API requires <NSX> as the root wrapper.
  // Each <Recipient> and <Document> is a direct child of <SendMessage> (no wrapper elements).
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <SendMessage>
    <AccountGuid>${params.accountGuid}</AccountGuid>
    ${params.subject ? `<Subject>${escapeXml(params.subject)}</Subject>` : ""}
    ${params.senderName ? `<SenderName>${escapeXml(params.senderName)}</SenderName>` : ""}
    ${params.senderCompany ? `<SenderCompany>${escapeXml(params.senderCompany)}</SenderCompany>` : ""}
    ${params.senderFaxNumber ? `<SenderFaxNumber>${escapeXml(params.senderFaxNumber)}</SenderFaxNumber>` : ""}
    ${params.senderVoiceNumber ? `<SenderVoiceNumber>${escapeXml(params.senderVoiceNumber)}</SenderVoiceNumber>` : ""}
    ${params.coverTemplate ? `<CoverTemplate>${escapeXml(params.coverTemplate)}</CoverTemplate>` : ""}
    ${params.billingCode ? `<MessageBillingCode>${escapeXml(params.billingCode)}</MessageBillingCode>` : ""}
    ${params.scheduleTime ? `<Schedule>${params.scheduleTime}</Schedule>` : ""}
    ${params.resolution ? `<Resolution>${params.resolution}</Resolution>` : ""}
${recipientXml}
${coverDocXml}${documentXml}
  </SendMessage>
</NSX>`;

  const res = await faxbackFetch("Messages/SendMessage", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendMessage failed: ${res.status} — ${errText}`);
  }

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  // API returns <MessageHandle>S-xxxx</MessageHandle>
  return parsed?.NSX?.MessageHandle || parsed?.MessageHandle || parsed?.SendMessage?.Handle || parsed?.Handle || "";
}

export async function abortMessage(handle: string): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Message>
    <MessageHandle>${escapeXml(handle)}</MessageHandle>
  </Message>
</NSX>`;

  const res = await faxbackFetch("Messages/AbortMessage", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });
  if (!res.ok) throw new Error(`AbortMessage failed: ${res.status}`);
}

export async function deleteMessage(handle: string): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Message>
    <MessageHandle>${escapeXml(handle)}</MessageHandle>
  </Message>
</NSX>`;

  const res = await faxbackFetch("Messages/DeleteMessage", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });
  if (!res.ok) throw new Error(`DeleteMessage failed: ${res.status}`);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
