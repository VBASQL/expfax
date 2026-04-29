# Task 22 — Background Queue Polling Service

## Goal
Create a background service that polls FaxBack queues at regular intervals and syncs new/updated messages to Cosmos DB.

## Files to Create
- `src/lib/services/queue-poller.ts`

## Dependencies
- `src/lib/faxback/queues.ts` (task 21) — `readQueue()`
- `src/lib/faxback/messages.ts` (task 21) — `readMessage()`, `buildFaxImage()`, `deleteMessage()`
- `src/lib/db/cosmos.ts` (task 11) — `containers.faxMessages()`
- `src/lib/services/blob-storage.ts` (task 23) — `uploadFaxPdf()`
- `src/types/index.ts` (task 12)

## Poll Intervals (from design doc section 12)
| Queue | ID | Interval | Purpose |
|-------|----|----------|---------|
| Received | 1 | 15 seconds | New incoming faxes |
| Send/Sending | 2,3 | 10 seconds | Active outbound status |
| Sent | 4 | 30 seconds | Completed sends |

## Implementation

### Create `src/lib/services/queue-poller.ts`

```typescript
import { readQueue } from "@/lib/faxback/queues";
import { readMessage, buildFaxImage, deleteMessage } from "@/lib/faxback/messages";
import { containers } from "@/lib/db/cosmos";
import { uploadFaxPdf } from "@/lib/services/blob-storage";
import { v4 as uuid } from "uuid";
import type { FaxMessage, FaxRecipient, FaxDocument } from "@/types";

let pollerTimers: ReturnType<typeof setInterval>[] = [];

/**
 * Process a single FaxBack queue entry:
 * 1. Check if we already have it in Cosmos
 * 2. If new: fetch details, download image, store in Cosmos + Blob
 * 3. If exists: update status
 */
async function processQueueEntry(
  handle: string,
  accountGuid: string,
  direction: "sent" | "received",
  queue: number,
  statusNum: number
): Promise<void> {
  const faxContainer = await containers.faxMessages();

  // Check if message already exists
  const { resources: existing } = await faxContainer.items
    .query({
      query: "SELECT c.id, c.userId, c.status, c.statusNum FROM c WHERE c.messageHandle = @handle",
      parameters: [{ name: "@handle", value: handle }],
    })
    .fetchAll();

  if (existing.length > 0) {
    const doc = existing[0];
    // Update status if changed
    if (doc.statusNum !== statusNum) {
      await faxContainer.item(doc.id, doc.userId).patch([
        { op: "set", path: "/statusNum", value: statusNum },
        { op: "set", path: "/status", value: mapStatus(queue, statusNum) },
        { op: "set", path: "/updatedAt", value: new Date().toISOString() },
      ]);
    }
    return;
  }

  // New message — fetch full details
  const detail = await readMessage(handle);

  // Find portal user by accountGuid
  const usersContainer = await containers.users();
  const { resources: users } = await usersContainer.items
    .query({
      query: "SELECT c.id FROM c WHERE c.faxbackAccountGuid = @guid",
      parameters: [{ name: "@guid", value: accountGuid }],
    })
    .fetchAll();

  if (users.length === 0) {
    console.warn(`No portal user for FaxBack account ${accountGuid}, skipping handle ${handle}`);
    return;
  }

  const userId = users[0].id;
  const messageId = uuid();

  // Download fax image as PDF
  let faxImagePath = "";
  try {
    const pdfBuffer = await buildFaxImage(handle);
    faxImagePath = await uploadFaxPdf(
      direction === "received" ? "received" : "sent",
      userId,
      messageId,
      pdfBuffer
    );
  } catch (err) {
    console.error(`Failed to download fax image for ${handle}:`, err);
  }

  // Map recipients
  const recipients: FaxRecipient[] = (
    Array.isArray(detail.Recipients) ? detail.Recipients : [detail.Recipients]
  )
    .filter(Boolean)
    .map((r) => ({
      recipientGuid: r.RecipientGuid || "",
      name: r.Name || "",
      faxNumber: r.FaxNumber || "",
      originalAddress: r.OriginalAddress || "",
      prefix: Number(r.Prefix) as 0 | 1 | 2,
      status: r.Status || "",
      error: r.Error || "",
      errorNumber: Number(r.ErrorNumber) || 0,
      startTime: r.StartTime || "",
      dialSeconds: Number(r.DialSeconds) || 0,
      connectSeconds: Number(r.ConnectSeconds) || 0,
      totalSeconds: Number(r.TotalSeconds) || 0,
      pageCount: Number(r.PageCount) || 0,
      pagesTransferred: Number(r.PagesTransferred) || 0,
      connectBps: Number(r.ConnectBPS) || 0,
      retries: Number(r.Retries) || 0,
      localCsid: r.LocalCSID || "",
      remoteCsid: r.RemoteCSID || "",
    }));

  // Map documents
  const documents: FaxDocument[] = (
    Array.isArray(detail.Documents) ? detail.Documents : [detail.Documents]
  )
    .filter(Boolean)
    .map((d) => ({
      documentGuid: d.DocumentGuid || "",
      documentPart: Number(d.DocumentPart) as 0 | 1,
      name: d.Name || "",
      documentType: Number(d.DocumentType) || 0,
      pageCount: Number(d.PageCount) || 0,
    }));

  const now = new Date().toISOString();

  const faxMessage: FaxMessage = {
    id: messageId,
    userId,
    messageHandle: handle,
    direction,
    status: mapStatus(queue, statusNum),
    statusNum: Number(detail.StatusNum),
    queue,
    subject: detail.Subject || "",
    senderName: detail.SenderName || "",
    senderCompany: detail.SenderCompany || "",
    senderFaxNumber: detail.SenderFaxNumber || "",
    coverTemplate: detail.CoverTemplate || "",
    appInfo: detail.AppInfo || "",
    billingCode: detail.BillingCode || "",
    resolution: Number(detail.Resolution) || 0,
    submitTime: detail.SubmitTime || now,
    scheduleTime: detail.ScheduleTime || null,
    isRead: false,
    isDeleted: false,
    faxImagePath,
    recipients,
    documents,
    createdAt: now,
    updatedAt: now,
  };

  await faxContainer.items.create(faxMessage);

  // Delete from FaxBack after successful storage (received + sent only)
  if (direction === "received" || queue === 4) {
    try {
      await deleteMessage(handle);
    } catch (err) {
      console.error(`Failed to delete FaxBack message ${handle}:`, err);
    }
  }
}

function mapStatus(queue: number, _statusNum: number): string {
  switch (queue) {
    case 1: return "received";
    case 2: return "queued";
    case 3: return "sending";
    case 4: return "sent";
    default: return "unknown";
  }
}

async function pollQueue(queueId: number, direction: "sent" | "received"): Promise<void> {
  try {
    const entries = await readQueue(queueId);
    for (const entry of entries) {
      await processQueueEntry(
        entry.Handle,
        entry.AccountGuid,
        direction,
        queueId,
        entry.StatusNum
      );
    }
  } catch (error) {
    console.error(`Queue poll error (queue ${queueId}):`, error);
  }
}

/**
 * Start all queue pollers. Call once at app startup.
 */
export function startQueuePollers(): void {
  if (pollerTimers.length > 0) return; // Already running

  // Received queue — every 15 seconds
  pollerTimers.push(setInterval(() => pollQueue(1, "received"), 15_000));

  // Send + Sending queues — every 10 seconds
  pollerTimers.push(setInterval(() => pollQueue(2, "sent"), 10_000));
  pollerTimers.push(setInterval(() => pollQueue(3, "sent"), 10_000));

  // Sent queue — every 30 seconds
  pollerTimers.push(setInterval(() => pollQueue(4, "sent"), 30_000));

  // Run once immediately
  pollQueue(1, "received");
  pollQueue(2, "sent");
  pollQueue(3, "sent");
  pollQueue(4, "sent");

  console.log("Queue pollers started.");
}

/**
 * Stop all pollers (graceful shutdown).
 */
export function stopQueuePollers(): void {
  pollerTimers.forEach(clearInterval);
  pollerTimers = [];
}
```

## Verify
- `npm run build` — no type errors
- NOTE: This task depends on task 23 (blob-storage). Build may warn about missing import until task 23 is done. That's OK.

## Notes
- Pollers run in the Node.js process (not edge/serverless)
- For App Service deployment, the app must use `alwaysOn: true` (set in Bicep task 01)
- SSE status updates (task 45) will hook into this poller
