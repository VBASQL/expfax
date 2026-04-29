import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendMessage } from "@/lib/faxback/messages";
import { generateOneTimeCoverRtf } from "@/lib/covers/rtf-generator";
import { prepareFaxDocument } from "@/lib/documents/converter";
import { uploadSentDocuments } from "@/lib/services/blob-storage";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { FaxMessage, FaxRecipient, FaxDocument } from "@/types";

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
    useCover,
    coverTemplate,
    coverMessage,
    templateFields,
    oneTimeCover,
    documents,
    resolution,
    scheduleTime,
    billingCode,
  } = body;

  if (!recipients || !Array.isArray(recipients) || recipients.filter((r: { faxNumber?: string }) => r.faxNumber?.trim()).length === 0) {
    return NextResponse.json({ success: false, error: "At least one recipient fax number is required" }, { status: 400 });
  }
  const hasCover = !!oneTimeCover || (useCover && coverTemplate);
  if ((!documents || documents.length === 0) && !hasCover) {
    return NextResponse.json({ success: false, error: "At least one document or cover page is required" }, { status: 400 });
  }

  const validRecipients = recipients.filter((r: { faxNumber?: string }) => r.faxNumber?.trim());

  // Build the documents list, prepending a one-time cover page RTF if requested
  let rawDocuments = documents as Array<{ name: string; contentBase64: string }>;

  if (oneTimeCover) {
    const rtf = generateOneTimeCoverRtf({
      senderName:    String(oneTimeCover.senderName    || ""),
      senderCompany: String(oneTimeCover.senderCompany || ""),
      senderFax:     String(oneTimeCover.senderFax     || ""),
      senderVoice:   String(oneTimeCover.senderVoice   || ""),
      receiverName:  String(oneTimeCover.receiverName  || ""),
      receiverCompany: String(oneTimeCover.receiverCompany || ""),
      subject:       String(oneTimeCover.subject       || subject || ""),
      message:       String(oneTimeCover.message       || ""),
    });
    const coverBase64 = Buffer.from(rtf).toString("base64");
    rawDocuments = [
      { name: "Cover Page.rtf", contentBase64: coverBase64 },
      ...rawDocuments,
    ];
  }

  // Convert images (PNG/JPEG/WEBP/BMP/GIF) → TIFF; pass native formats through
  const finalDocuments = await Promise.all(
    rawDocuments.map((d) => prepareFaxDocument(d.name, d.contentBase64))
  );

  try {
    const handle = await sendMessage({
      accountGuid: user.faxbackAccountGuid,
      subject,
      senderName: templateFields?.senderName || user.displayName,
      senderCompany: templateFields?.senderCompany || "",
      senderFaxNumber: templateFields?.senderFax || undefined,
      senderVoiceNumber: templateFields?.senderVoice || undefined,
      coverTemplate: useCover ? coverTemplate : undefined,
      coverMessage: useCover ? coverMessage : undefined,
      billingCode,
      resolution: resolution ?? 0,
      scheduleTime,
      recipients: validRecipients.map((r: { name?: string; faxNumber: string }) => ({ name: r.name || "", faxNumber: r.faxNumber })),
      documents: finalDocuments,
    });

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
      senderName: templateFields?.senderName || user.displayName,
      senderCompany: templateFields?.senderCompany || "",
      senderFaxNumber: templateFields?.senderFax || "",
      coverTemplate: (useCover ? coverTemplate : "") || "",
      appInfo: "",
      billingCode: billingCode || "",
      resolution: resolution ?? 0,
      submitTime: now,
      scheduleTime: scheduleTime || null,
      isRead: false,
      isDeleted: false,
      faxImagePath: "",          // filled in by queue poller after transmission
      sentDocumentPaths,
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
        documentPart: i === 0 && (oneTimeCover || (useCover && coverTemplate)) ? 0 : 1,
        name: d.name,
        documentType: d.documentType,
        pageCount: 0,
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
