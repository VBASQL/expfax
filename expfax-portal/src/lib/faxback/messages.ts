import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackMessageDetail, SendMessageParams } from "./types";

export async function readMessage(handle: string): Promise<FaxBackMessageDetail> {
  const res = await faxbackFetch(`Messages/ReadMessageBlock?Handle=${handle}`);
  if (!res.ok) throw new Error(`ReadMessageBlock failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed.Message as FaxBackMessageDetail;
}

export async function buildFaxImage(handle: string): Promise<Buffer> {
  const res = await faxbackFetch(`Messages/BuildFaxImage?Handle=${handle}&DocumentType=PDF`);
  if (!res.ok) throw new Error(`BuildFaxImage failed: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function sendMessage(params: SendMessageParams): Promise<string> {
  const recipientXml = params.recipients
    .map(
      (r) => `<Recipient>
      <Name>${escapeXml(r.name)}</Name>
      <FaxNumber>${escapeXml(r.faxNumber)}</FaxNumber>
      <Prefix>${r.prefix ?? 0}</Prefix>
    </Recipient>`
    )
    .join("\n");

  const documentXml = params.documents
    .map(
      (d) => `<Document>
      <Name>${escapeXml(d.name)}</Name>
      <Content>${d.contentBase64}</Content>
      <DocumentType>${d.documentType ?? 1}</DocumentType>
    </Document>`
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="utf-8"?>
<SendMessage>
  <AccountGuid>${params.accountGuid}</AccountGuid>
  ${params.subject ? `<Subject>${escapeXml(params.subject)}</Subject>` : ""}
  ${params.senderName ? `<SenderName>${escapeXml(params.senderName)}</SenderName>` : ""}
  ${params.senderCompany ? `<SenderCompany>${escapeXml(params.senderCompany)}</SenderCompany>` : ""}
  ${params.coverTemplate ? `<CoverTemplate>${escapeXml(params.coverTemplate)}</CoverTemplate>` : ""}
  ${params.coverMessage ? `<Cover>${escapeXml(params.coverMessage)}</Cover>` : ""}
  ${params.billingCode ? `<BillingCode>${escapeXml(params.billingCode)}</BillingCode>` : ""}
  ${params.scheduleTime ? `<ScheduleTime>${params.scheduleTime}</ScheduleTime>` : ""}
  <Recipients>${recipientXml}</Recipients>
  <Documents>${documentXml}</Documents>
</SendMessage>`;

  const res = await faxbackFetch("Messages/SendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendMessage failed: ${res.status} — ${errText}`);
  }

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed?.SendMessage?.Handle || parsed?.Handle || "";
}

export async function abortMessage(handle: string): Promise<void> {
  const res = await faxbackFetch(`Messages/AbortMessage?Handle=${handle}`);
  if (!res.ok) throw new Error(`AbortMessage failed: ${res.status}`);
}

export async function deleteMessage(handle: string): Promise<void> {
  const res = await faxbackFetch(`Messages/DeleteMessage?Handle=${handle}`);
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
