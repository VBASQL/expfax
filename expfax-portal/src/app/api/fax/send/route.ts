import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getCurrentUser } from "@/lib/auth/session";
import { sendMessage } from "@/lib/faxback/messages";
import { generateCoverHtml } from "@/lib/covers/html-generator";
import { prepareFaxDocument, countDocumentPages } from "@/lib/documents/converter";
import { uploadSentDocuments } from "@/lib/services/blob-storage";
import { containers } from "@/lib/db/cosmos";
import type { FaxMessage, FaxRecipient, FaxDocument } from "@/types";

/** Cosmos IDs cannot contain /, \, #, or ?  — sanitize the FaxBack handle.
 *  Also lowercase: FaxBack returns the handle in different cases between
 *  Messages/SendMessage and Messages/ReadQueue, and Cosmos id/queries are
 *  case-sensitive — without normalization the queue poller fails to find the
 *  optimistic row and inserts a duplicate. */
function handleToId(handle: string): string {
  return handle.replace(/[\/\\#?]/g, "_").toLowerCase();
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.faxbackAccountGuid) {
    return NextResponse.json({ error: "Your account is not linked to a FaxBack account. Contact an administrator." }, { status: 403 });
  }

  const body = await request.json();
  const {
    recipients,
    subject,
    oneTimeCover,
    coverTemplateId,
    documents,
    resolution,
    scheduleTime,
    billingCode,
    fromAccountGuid, // Optional: which FaxBack account to send from
  } = body;

  // Resolve which account to send from
  let sendAccountGuid: string = user.defaultFaxbackAccountGuid ?? user.faxbackAccountGuid;
  let sendAccountId: string | null = user.faxbackAccountId ?? null;

  if (fromAccountGuid) {
    // Validate it's in the user's linked accounts
    const accounts = user.faxbackAccounts ?? [];
    const match = accounts.find((a) => a.accountGuid === fromAccountGuid);
    if (!match) {
      // Fall back to primary if no multi-account list exists yet (legacy users)
      if (fromAccountGuid !== user.faxbackAccountGuid) {
        return NextResponse.json({ error: "Selected account is not linked to your profile." }, { status: 403 });
      }
    } else {
      sendAccountGuid = match.accountGuid;
      sendAccountId = match.accountId;
    }
  }

  if (!recipients || !Array.isArray(recipients) || recipients.filter((r: { faxNumber?: string }) => r.faxNumber?.trim()).length === 0) {
    return NextResponse.json({ success: false, error: "At least one recipient fax number is required" }, { status: 400 });
  }
  const hasCover = !!oneTimeCover;
  if ((!documents || documents.length === 0) && !hasCover) {
    return NextResponse.json({ success: false, error: "At least one document or cover page is required" }, { status: 400 });
  }

  const validRecipients = recipients.filter((r: { faxNumber?: string }) => r.faxNumber?.trim());

  // Build the documents list, prepending a one-time cover page RTF if requested
  let rawDocuments = documents as Array<{ name: string; contentBase64: string }>;

  if (oneTimeCover) {
    // Generate cover as HTML — same bytes shown in the preview iframe and sent to FaxBack.
    // Note: base64 PNG letterhead images are not supported by FaxBack's HTML renderer,
    // so the coverTemplateId letterhead is intentionally omitted here.
    const html = generateCoverHtml({
      senderName:      String(oneTimeCover.senderName      || ""),
      senderCompany:   String(oneTimeCover.senderCompany   || ""),
      senderFax:       String(oneTimeCover.senderFax       || ""),
      senderVoice:     String(oneTimeCover.senderVoice     || ""),
      receiverName:    String(oneTimeCover.receiverName    || ""),
      receiverCompany: String(oneTimeCover.receiverCompany || ""),
      subject:         String(oneTimeCover.subject         || subject || ""),
      message:         String(oneTimeCover.message         || ""),
    });
    const coverBase64 = Buffer.from(html).toString("base64");
    rawDocuments = [
      { name: "Cover Page.html", contentBase64: coverBase64 },
      ...rawDocuments,
    ];
  }

  // Convert images (PNG/JPEG/WEBP/BMP/GIF) → TIFF; pass native formats through
  const finalDocuments = await Promise.all(
    rawDocuments.map((d) => prepareFaxDocument(d.name, d.contentBase64))
  );

  // Count pages from the original buffers before sending.
  // - One-time cover RTF we generated is treated as 1 page (RTF has no reliable page count without rendering)
  // - PDFs: parsed with pdf-lib; TIFFs: sharp metadata; images: always 1
  const rawDocumentPageCounts = await Promise.all(
    rawDocuments.map(async (d, i) => {
      if (oneTimeCover && i === 0) return 1; // generated cover RTF
      const buf = Buffer.from(d.contentBase64, "base64");
      return countDocumentPages(d.name, buf);
    })
  );

  try {
    const rawHandle = await sendMessage({
      accountGuid: sendAccountGuid,
      subject,
      senderName: user.displayName,
      senderCompany: "",
      billingCode,
      resolution: resolution ?? 0,
      scheduleTime,
      recipients: validRecipients.map((r: { name?: string; faxNumber: string }) => ({ name: r.name || "", faxNumber: r.faxNumber })),
      documents: finalDocuments,
    });

    // Normalize the handle case so the queue poller's case-sensitive
    // `WHERE c.messageHandle = @handle` lookup will find this optimistic row
    // and patch it instead of inserting a duplicate.
    const handle = rawHandle.toLowerCase();

    // ── Persist to Blob Storage + Cosmos ──────────────────────────────────
    const messageId = uuid();
    const now = new Date().toISOString();

    // Upload the converted documents to Blob Storage
    let sentDocumentPaths: string[] = [];
    try {
      sentDocumentPaths = await uploadSentDocuments(user.id, handle, finalDocuments);
    } catch (err) {
      // Non-fatal: log but don't fail the send
      console.error("Failed to upload sent documents to blob storage:", err);
    }

    // Write a Cosmos record so we can track the fax before the poller picks it up
    const faxRecord: FaxMessage = {
      id: messageId,
      userId: user.id,
      messageHandle: handle,
      direction: "sent",
      status: "queued",
      statusNum: 0,
      queue: 2,
      subject: subject || "",
      senderName: user.displayName,
      senderCompany: "",
      senderFaxNumber: "",
      coverTemplate: "",
      appInfo: "",
      billingCode: billingCode || "",
      resolution: resolution ?? 0,
      submitTime: now,
      scheduleTime: scheduleTime || null,
      isRead: false,
      isDeleted: false,
      faxImagePath: "",          // filled in by queue poller after transmission
      sentDocumentPaths,
      sentFromAccountGuid: sendAccountGuid,
      sentFromAccountId: sendAccountId,
      recipients: validRecipients.map((r: { name?: string; faxNumber: string }) => ({
        recipientGuid: "",
        name: r.name || "",
        faxNumber: r.faxNumber,
        originalAddress: r.faxNumber,
        prefix: 0,
        status: "queued",
        error: "",
        errorNumber: 0,
        startTime: "",
        dialSeconds: 0,
        connectSeconds: 0,
        totalSeconds: 0,
        pageCount: 0,
        pagesTransferred: 0,
        connectBps: 0,
        retries: 0,
        localCsid: "",
        remoteCsid: "",
      })),
      documents: finalDocuments.map((d, i) => ({
        documentGuid: "",
        documentPart: i === 0 && oneTimeCover ? 0 : 1,
        name: d.name,
        documentType: d.documentType,
        pageCount: rawDocumentPageCounts[i] ?? 0,
      } as FaxDocument)),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const container = await containers.faxMessages();
      await container.items.create(faxRecord);
    } catch (err) {
      // Non-fatal: poller will create/update it when FaxBack confirms
      console.error("Failed to write fax record to Cosmos:", err);
    }

    return NextResponse.json({ success: true, handle });
  } catch (error: unknown) {
    console.error("Send fax error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Failed to send fax" }, { status: 500 });
  }
}
