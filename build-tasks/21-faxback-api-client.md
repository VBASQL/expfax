# Task 21 — FaxBack Typed API Client

## Goal
Create typed wrapper functions for all FaxBack API endpoints used by the portal.

## Files to Create
- `src/lib/faxback/messages.ts`
- `src/lib/faxback/queues.ts`
- `src/lib/faxback/templates.ts`
- `src/lib/faxback/types.ts`

## Dependencies
- `src/lib/faxback/session.ts` (task 20) — `faxbackFetch()`
- `xml2js` (installed in task 00) — parse XML responses

## FaxBack API Mapping (from design doc section 6.2)

| Portal Action | FaxBack Endpoint |
|--------------|-----------------|
| Read queue | `ReadQueue?Queue={n}&AllUsers=1` |
| Read message details | `ReadMessage?Handle={handle}` |
| Read message block | `ReadMessageBlock?Handle={handle}` |
| Build fax image (PDF) | `BuildFaxImage?Handle={handle}&DocumentType=PDF` |
| Send message | `POST /SendMessage` (XML body) |
| Abort sending | `AbortMessage?Handle={handle}` |
| Delete message | `DeleteMessage?Handle={handle}` |
| Queue counts | `GetQueueCounts` |
| Add template | `POST /AddTemplate` (XML with base64 content) |
| Get template content | `GetTemplateContent?Name={name}` |
| Delete template | `DeleteTemplate?Name={name}` |

## Implementation

### 1. Create `src/lib/faxback/types.ts`

```typescript
// FaxBack API response types (parsed from XML)

export interface FaxBackQueueEntry {
  Handle: string;
  AccountGuid: string;
  AccountId: string;
  StatusNum: number;
  Queue: number;
}

export interface FaxBackMessageDetail {
  Handle: string;
  AccountGuid: string;
  AccountId: string;
  Subject: string;
  SenderName: string;
  SenderCompany: string;
  SenderFaxNumber: string;
  SenderVoiceNumber: string;
  CoverTemplate: string;
  AppInfo: string;
  BillingCode: string;
  Resolution: number;
  SubmitTime: string;
  ScheduleTime: string;
  StatusNum: number;
  Queue: number;
  Recipients: FaxBackRecipient[];
  Documents: FaxBackDocument[];
}

export interface FaxBackRecipient {
  RecipientGuid: string;
  Name: string;
  FaxNumber: string;
  OriginalAddress: string;
  Prefix: number;
  Status: string;
  Error: string;
  ErrorNumber: number;
  StartTime: string;
  DialSeconds: number;
  ConnectSeconds: number;
  TotalSeconds: number;
  PageCount: number;
  PagesTransferred: number;
  ConnectBPS: number;
  Retries: number;
  LocalCSID: string;
  RemoteCSID: string;
}

export interface FaxBackDocument {
  DocumentGuid: string;
  DocumentPart: number;
  Name: string;
  DocumentType: number;
  PageCount: number;
}

export interface FaxBackQueueCounts {
  Received: number;
  Send: number;
  Sending: number;
  Sent: number;
  Failed: number;
}

export interface SendMessageParams {
  accountGuid: string;
  subject?: string;
  senderName?: string;
  senderCompany?: string;
  senderFaxNumber?: string;
  senderVoiceNumber?: string;
  coverTemplate?: string;
  coverMessage?: string;
  billingCode?: string;
  resolution?: number;
  scheduleTime?: string;
  recipients: { name: string; faxNumber: string; prefix?: number }[];
  documents: { name: string; contentBase64: string; documentType?: number }[];
}
```

### 2. Create `src/lib/faxback/queues.ts`

```typescript
import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackQueueEntry, FaxBackQueueCounts } from "./types";

/**
 * Queue IDs: 1=Received, 2=Send, 3=Sending, 4=Sent
 */
export async function readQueue(queue: number): Promise<FaxBackQueueEntry[]> {
  const res = await faxbackFetch(`ReadQueue?Queue=${queue}&AllUsers=1`);
  if (!res.ok) throw new Error(`ReadQueue failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const messages = parsed?.Messages?.Message;
  if (!messages) return [];
  return Array.isArray(messages) ? messages : [messages];
}

export async function getQueueCounts(): Promise<FaxBackQueueCounts> {
  const res = await faxbackFetch("GetQueueCounts");
  if (!res.ok) throw new Error(`GetQueueCounts failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const counts = parsed?.QueueCounts || {};

  return {
    Received: parseInt(counts.Received || "0", 10),
    Send: parseInt(counts.Send || "0", 10),
    Sending: parseInt(counts.Sending || "0", 10),
    Sent: parseInt(counts.Sent || "0", 10),
    Failed: parseInt(counts.Failed || "0", 10),
  };
}
```

### 3. Create `src/lib/faxback/messages.ts`

```typescript
import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackMessageDetail, SendMessageParams } from "./types";

export async function readMessage(handle: string): Promise<FaxBackMessageDetail> {
  const res = await faxbackFetch(`ReadMessageBlock?Handle=${handle}`);
  if (!res.ok) throw new Error(`ReadMessageBlock failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed.Message as FaxBackMessageDetail;
}

export async function buildFaxImage(handle: string): Promise<Buffer> {
  const res = await faxbackFetch(`BuildFaxImage?Handle=${handle}&DocumentType=PDF`);
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

  const res = await faxbackFetch("SendMessage", {
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
  const res = await faxbackFetch(`AbortMessage?Handle=${handle}`);
  if (!res.ok) throw new Error(`AbortMessage failed: ${res.status}`);
}

export async function deleteMessage(handle: string): Promise<void> {
  const res = await faxbackFetch(`DeleteMessage?Handle=${handle}`);
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
```

### 4. Create `src/lib/faxback/templates.ts`

```typescript
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

  const res = await faxbackFetch("AddTemplate", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) throw new Error(`AddTemplate failed: ${res.status}`);
}

export async function getTemplateContent(name: string): Promise<string> {
  const res = await faxbackFetch(`GetTemplateContent?Name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`GetTemplateContent failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  return parsed?.Template?.Content || "";
}

export async function deleteTemplate(name: string): Promise<void> {
  const res = await faxbackFetch(`DeleteTemplate?Name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`DeleteTemplate failed: ${res.status}`);
}
```

## Verify
- `npm run build` — no type errors
- All functions are importable and type-safe

## Notes for Future Tasks
- `readQueue()` returns ALL users' messages — the portal filters by AccountGuid
- `sendMessage()` supports multiple recipients (task 31 multi-recipient form)
- `buildFaxImage()` returns raw PDF buffer — task 23 stores it in Blob Storage
