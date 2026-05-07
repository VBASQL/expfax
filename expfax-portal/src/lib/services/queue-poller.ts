import { readQueue } from "@/lib/faxback/queues";
import { readMessageBlock, buildFaxImage, deleteMessage } from "@/lib/faxback/messages";
import { containers } from "@/lib/db/cosmos";
import { uploadFaxPdf, deleteBlobsByPaths } from "@/lib/services/blob-storage";
import type { FaxMessage, FaxRecipient, FaxDocument } from "@/types";

let pollerTimers: ReturnType<typeof setInterval>[] = [];

// Handles already stored in Cosmos — skip Cosmos lookup on repeat polls
const processedHandles = new Set<string>();
// FaxBack account GUIDs with no portal user — skip user lookup until restart
const orphanedAccounts = new Set<string>();
// Handles currently being processed — prevents duplicate processing when
// concurrent poll intervals overlap for the same handle.
const inFlight = new Set<string>();

/** Cosmos IDs cannot contain /, \, #, or ? — sanitize the FaxBack handle.
 *  Also lowercase: FaxBack returns the handle in different cases between
 *  Messages/SendMessage and Messages/ReadQueue, and Cosmos id/queries are
 *  case-sensitive — without normalization we end up with duplicate rows. */
function handleToId(handle: string): string {
  return handle.replace(/[\/\\#?]/g, "_").toLowerCase();
}

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
  statusNum: number,
  detail: FaxBackMessageDetail
): Promise<void> {
  // Skip handles and orphaned accounts we've already dealt with this session
  if (processedHandles.has(handle)) return;
  if (orphanedAccounts.has(accountGuid)) return;
  // Prevent a concurrent poll interval from processing the same handle twice
  if (inFlight.has(handle)) return;
  inFlight.add(handle);

  const faxContainer = await containers.faxMessages();

  // Check if message already exists
  const { resources: existing } = await faxContainer.items
    .query({
      query: "SELECT c.id, c.userId, c.status, c.statusNum, c.faxImagePath, c.sentDocumentPaths FROM c WHERE c.messageHandle = @handle",
      parameters: [{ name: "@handle", value: handle }],
    })
    .fetchAll();

  if (existing.length > 0) {
    const doc = existing[0];
    const newStatus = mapStatus(queue, statusNum);
    const patches: object[] = [];

    if (doc.statusNum !== statusNum || doc.status !== newStatus) {
      patches.push(
        { op: "set", path: "/statusNum", value: statusNum },
        { op: "set", path: "/status", value: newStatus },
        { op: "set", path: "/updatedAt", value: new Date().toISOString() }
      );
    }

    // Fax just finished — update recipients/documents with final page counts and download PDF
    if (queue === 4 || queue === 5) {
      // Update recipients with final pageCount / totalSeconds from ReadMessageBlock response
      const rawRecipients = (detail as Record<string, unknown>).Recipient ?? detail.Recipients;
      const updatedRecipients = (
        Array.isArray(rawRecipients) ? rawRecipients : rawRecipients ? [rawRecipients] : []
      ).filter(Boolean).map((r: Record<string, string>) => ({
        recipientGuid: r.RecipientGuid || "",
        name: r.Name || "",
        faxNumber: r.Address || r.FaxNumber || "",
        originalAddress: r.OriginalAddress || r.Address || "",
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
      if (updatedRecipients.length > 0) {
        patches.push({ op: "set", path: "/recipients", value: updatedRecipients });
      }

      const rawDocuments = (detail as Record<string, unknown>).Document ?? detail.Documents;
      const updatedDocuments = (
        Array.isArray(rawDocuments) ? rawDocuments : rawDocuments ? [rawDocuments] : []
      ).filter(Boolean).map((d: Record<string, string>) => ({
        documentGuid: d.DocumentGuid || "",
        documentPart: Number(d.DocumentPart) as 0 | 1,
        name: d.Name || "",
        documentType: Number(d.DocumentType) || 0,
        pageCount: Number(d.PageCount) || 0,
      }));
      if (updatedDocuments.length > 0) {
        patches.push({ op: "set", path: "/documents", value: updatedDocuments });
      }

      // Download the rendered PDF for successful sends only — failed faxes have no image.
      // For failed faxes (statusNum !== 0) we still delete from FaxBack to clear the queue.
      if (!doc.faxImagePath && statusNum === 0) {
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
      } else if (statusNum !== 0 && !doc.faxImagePath) {
        // Failed fax: no PDF to download; delete from FaxBack to clear the Sent queue
        deleteMessage(handle).catch((err) =>
          console.error(`Failed to delete failed FaxBack message ${handle}:`, err)
        );
      }
    }

    if (patches.length > 0) {
      await faxContainer.item(doc.id, doc.userId).patch(patches);
    }
    inFlight.delete(handle);
    return;
  }

  // New message — use the detail already fetched by readMessageBlock

  // Find portal user by accountGuid — check both legacy primary field and faxbackAccounts array
  const usersContainer = await containers.users();
  const { resources: users } = await usersContainer.items
    .query({
      query: "SELECT c.id FROM c WHERE c.faxbackAccountGuid = @guid OR EXISTS(SELECT VALUE a FROM a IN c.faxbackAccounts WHERE a.accountGuid = @guid)",
      parameters: [{ name: "@guid", value: accountGuid }],
    })
    .fetchAll();

  if (users.length === 0) {
    console.warn(`No portal user for FaxBack account ${accountGuid}, skipping handle ${handle}`);
    orphanedAccounts.add(accountGuid);
    inFlight.delete(handle);
    return;
  }

  const userId = users[0].id;
  // Deterministic id derived from the handle so concurrent pollers and the
  // send-route's optimistic write all converge on the same Cosmos document.
  const messageId = handleToId(handle);

  // Download fax image as PDF — skip for failed sent faxes (no rendered image exists)
  let faxImagePath = "";
  const isFailed = (queue === 4 || queue === 5) && statusNum !== 0;
  if (!isFailed) {
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
  }

  // Map recipients — API returns "Recipient" (singular), may be object or array
  // Recipient fax number is in "Address" field per API doc
  const rawRecipients = (detail as Record<string, unknown>).Recipient ?? detail.Recipients;
  const recipients: FaxRecipient[] = (
    Array.isArray(rawRecipients) ? rawRecipients : rawRecipients ? [rawRecipients] : []
  )
    .filter(Boolean)
    .map((r: Record<string, string>) => ({
      recipientGuid: r.RecipientGuid || "",
      name: r.Name || "",
      faxNumber: r.Address || r.FaxNumber || "",  // API uses Address field
      originalAddress: r.OriginalAddress || r.Address || "",
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

  // Map documents — API returns "Document" (singular), may be object or array
  const rawDocuments = (detail as Record<string, unknown>).Document ?? detail.Documents;
  const documents: FaxDocument[] = (
    Array.isArray(rawDocuments) ? rawDocuments : rawDocuments ? [rawDocuments] : []
  )
    .filter(Boolean)
    .map((d: Record<string, string>) => ({
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
    // For received faxes, SenderFaxNumber may be empty if the remote machine didn't
    // provide a CallerID; fall back to the RemoteCSID transmitted by the sender.
    senderFaxNumber: detail.SenderFaxNumber || (direction === "received" ? recipients[0]?.remoteCsid || "" : ""),
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
    // Store the account guid so shared-account users can also see this fax
    ...(direction === "received" ? {
      receivedToAccountGuid: accountGuid,
      receivedToAccountId: detail.AccountId || "",
      // Local DID fax number = Address of the Recipient for received messages
      receivedToFaxNumber: recipients[0]?.faxNumber || "",
    } : { sentFromAccountGuid: accountGuid }),
    recipients,
    documents,
    createdAt: now,
    updatedAt: now,
  };

  // upsert instead of create: if the send route already wrote this handle
  // (or two poll intervals raced), we overwrite with canonical FaxBack data
  // rather than creating a duplicate.
  await faxContainer.items.upsert(faxMessage);

  // Only mark as permanently processed (skip on future polls) for final-state messages.
  // Transitional queues (2=queued, 3=sending) must NOT be added here — when the fax
  // moves to queue 4/5, the poller needs to be able to update the status to "sent".
  if (direction === "received" || queue === 4 || queue === 5) {
    processedHandles.add(handle);
  }

  inFlight.delete(handle);

  // Delete from FaxBack after successful storage (received + completed sent)
  if (direction === "received" || queue === 4) {
    try {
      await deleteMessage(handle);
    } catch (err) {
      console.error(`Failed to delete FaxBack message ${handle}:`, err);
    }
  }
}

function mapStatus(queue: number, statusNum: number): FaxMessage["status"] {
  switch (queue) {
    case 1: return "received";
    case 2: return "queued";
    case 3: return "sending";
    // Queues 4 (Sent) and 5 (SentPendingDeletion): non-zero statusNum means all
    // recipients failed (FaxBack error code). Zero = successful delivery.
    case 4:
    case 5: return statusNum !== 0 ? "failed" : "sent";
    case 7: return "received"; // ReceivedPendingDeletion — received, awaiting FaxBack cleanup
    default: return "queued";
  }
}

async function pollQueue(queueId: number, direction: "sent" | "received"): Promise<void> {
  try {
    const handles = await readQueue(queueId);
    if (handles.length === 0) return;

    // Do NOT pass ActionType to ReadMessageBlock — the server returns empty <Message />
    // when ActionType is specified but doesn't match the message's routing state.
    // Since ReadQueue is called without ActionType (using server defaults), ReadMessageBlock
    // must also be called without it.
    const CHUNK_SIZE = 50;
    for (let i = 0; i < handles.length; i += CHUNK_SIZE) {
      const chunk = handles.slice(i, i + CHUNK_SIZE);
      const details = await readMessageBlock(chunk);

      for (const detail of details) {
        // Normalize handle case — FaxBack varies casing across endpoints, but our
        // Cosmos lookups by messageHandle are case-sensitive.
        const rawHandle = detail.Handle || (detail as Record<string, string>).MessageHandle || "";
        const handle = rawHandle.toLowerCase();
        const accountGuid = detail.AccountGuid || "";
        const statusNum = Number(detail.StatusNum) || 0;

        if (!handle) continue;

        await processQueueEntry(handle, accountGuid, direction, queueId, statusNum, detail);
      }
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

  // Sent + SentPendingDeletion queues — every 30 seconds
  pollerTimers.push(setInterval(() => pollQueue(4, "sent"), 30_000));
  pollerTimers.push(setInterval(() => pollQueue(5, "sent"), 30_000));

  // ReceivedPendingDeletion — every 30 seconds
  pollerTimers.push(setInterval(() => pollQueue(7, "received"), 30_000));

  // Run once immediately
  pollQueue(1, "received");
  pollQueue(2, "sent");
  pollQueue(3, "sent");
  pollQueue(4, "sent");
  pollQueue(5, "sent");
  pollQueue(7, "received");

  console.log("Queue pollers started.");
}

/**
 * Stop all pollers (graceful shutdown).
 */
export function stopQueuePollers(): void {
  pollerTimers.forEach(clearInterval);
  pollerTimers = [];
}
