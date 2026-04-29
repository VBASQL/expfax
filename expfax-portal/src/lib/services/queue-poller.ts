import { readQueue } from "@/lib/faxback/queues";
import { readMessage, buildFaxImage, deleteMessage } from "@/lib/faxback/messages";
import { containers } from "@/lib/db/cosmos";
import { uploadFaxPdf, deleteBlobsByPaths } from "@/lib/services/blob-storage";
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
    const newStatus = mapStatus(queue, statusNum);
    const patches: object[] = [];

    if (doc.statusNum !== statusNum) {
      patches.push(
        { op: "set", path: "/statusNum", value: statusNum },
        { op: "set", path: "/status", value: newStatus },
        { op: "set", path: "/updatedAt", value: new Date().toISOString() }
      );
    }

    // Fax just finished — download the rendered PDF from FaxBack
    if (queue === 4 && !doc.faxImagePath) {
      try {
        const pdfBuffer = await buildFaxImage(handle);
        const faxImagePath = await uploadFaxPdf("sent", doc.userId, doc.id, pdfBuffer);
        patches.push({ op: "set", path: "/faxImagePath", value: faxImagePath });

        // Clean up the temporary sent-documents blobs
        if (Array.isArray(doc.sentDocumentPaths) && doc.sentDocumentPaths.length > 0) {
          deleteBlobsByPaths(doc.sentDocumentPaths).catch((err) =>
            console.error(`Failed to delete temp sent-documents for ${doc.id}:`, err)
          );
          patches.push({ op: "set", path: "/sentDocumentPaths", value: [] });
        }

        // Delete from FaxBack now that we have the PDF
        deleteMessage(handle).catch((err) =>
          console.error(`Failed to delete FaxBack message ${handle}:`, err)
        );
      } catch (err) {
        console.error(`Failed to download rendered PDF for sent fax ${handle}:`, err);
      }
    }

    if (patches.length > 0) {
      await faxContainer.item(doc.id, doc.userId).patch(patches);
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
    sentDocumentPaths: [],
    recipients,
    documents,
    createdAt: now,
    updatedAt: now,
  };

  await faxContainer.items.create(faxMessage);

  // Delete from FaxBack after successful storage (received + completed sent)
  if (direction === "received" || queue === 4) {
    try {
      await deleteMessage(handle);
    } catch (err) {
      console.error(`Failed to delete FaxBack message ${handle}:`, err);
    }
  }
}

function mapStatus(queue: number, _statusNum: number): FaxMessage["status"] {
  switch (queue) {
    case 1: return "received";
    case 2: return "queued";
    case 3: return "sending";
    case 4: return "sent";
    default: return "queued";
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
