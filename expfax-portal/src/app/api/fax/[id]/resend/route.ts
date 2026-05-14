import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getCurrentUser } from "@/lib/auth/session";
import { getFaxWithAccess } from "@/lib/db/fax-access";
import { downloadFaxPdf, uploadSentDocuments } from "@/lib/services/blob-storage";
import { sendMessage } from "@/lib/faxback/messages";
import { containers } from "@/lib/db/cosmos";
import type { FaxMessage, FaxDocument } from "@/types";

function handleToId(handle: string): string {
  return handle.replace(/[\/\\#?]/g, "_").toLowerCase();
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await getFaxWithAccess(id, user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { fax } = result;

  if (fax.status !== "failed") {
    return NextResponse.json({ error: "Only failed faxes can be resent" }, { status: 400 });
  }

  const sentPaths: string[] = Array.isArray(fax.sentDocumentPaths) ? fax.sentDocumentPaths : [];
  if (sentPaths.length === 0) {
    return NextResponse.json({ error: "No documents stored for this fax" }, { status: 400 });
  }

  // Resolve the account to send from (same as original)
  const sendAccountGuid = fax.sentFromAccountGuid ?? user.defaultFaxbackAccountGuid ?? user.faxbackAccountGuid;
  const sendAccountId = fax.sentFromAccountId ?? user.faxbackAccountId ?? null;
  const sendFaxNumber = fax.senderFaxNumber || undefined;

  if (!sendAccountGuid) {
    return NextResponse.json({ error: "No FaxBack account configured" }, { status: 403 });
  }

  // Re-download the stored documents from blob storage
  const documents: Array<{ name: string; contentBase64: string; documentType: number }> = [];
  for (let i = 0; i < sentPaths.length; i++) {
    const blobPath = sentPaths[i];
    const buf = await downloadFaxPdf(blobPath);
    const originalName = fax.documents?.[i]?.name ?? blobPath.split("/").pop()?.replace(/^\d+_/, "") ?? `document_${i + 1}`;
    const ext = blobPath.split(".").pop()?.toLowerCase() ?? "pdf";
    const documentType = ext === "pdf" ? 0 : ext === "tiff" || ext === "tif" ? 0 : 0;
    documents.push({
      name: originalName,
      contentBase64: buf.toString("base64"),
      documentType,
    });
  }

  const validRecipients = (fax.recipients ?? []).map((r) => ({
    name: r.name || "",
    faxNumber: r.faxNumber,
  })).filter((r) => r.faxNumber);

  if (validRecipients.length === 0) {
    return NextResponse.json({ error: "No recipients found on original fax" }, { status: 400 });
  }

  try {
    const rawHandle = await sendMessage({
      accountGuid: sendAccountGuid,
      subject: fax.subject || "",
      senderName: fax.senderName || user.displayName,
      senderCompany: "",
      billingCode: fax.billingCode || "",
      resolution: fax.resolution ?? 0,
      fromFaxNumber: sendFaxNumber,
      recipients: validRecipients,
      documents,
    });

    const handle = rawHandle.toLowerCase();
    const now = new Date().toISOString();

    // Upload the documents again under the new handle
    let newSentDocumentPaths: string[] = [];
    try {
      newSentDocumentPaths = await uploadSentDocuments(user.id, handle, documents);
    } catch (err) {
      console.error("Failed to upload resent documents to blob storage:", err);
    }

    const faxRecord: FaxMessage = {
      id: uuid(),
      userId: user.id,
      messageHandle: handle,
      direction: "sent",
      status: "queued",
      statusNum: 0,
      queue: 2,
      subject: fax.subject || "",
      senderName: fax.senderName || user.displayName,
      senderCompany: "",
      senderFaxNumber: sendFaxNumber ?? "",
      coverTemplate: "",
      appInfo: "",
      billingCode: fax.billingCode || "",
      resolution: fax.resolution ?? 0,
      submitTime: now,
      scheduleTime: null,
      isRead: false,
      isDeleted: false,
      faxImagePath: "",
      sentDocumentPaths: newSentDocumentPaths,
      sentFromAccountGuid: sendAccountGuid,
      sentFromAccountId: sendAccountId,
      recipients: validRecipients.map((r) => ({
        recipientGuid: "",
        name: r.name,
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
      documents: (fax.documents ?? []).map((d, i) => ({
        documentGuid: "",
        documentPart: d.documentPart ?? 1,
        name: d.name,
        documentType: d.documentType ?? 0,
        pageCount: d.pageCount ?? 0,
      } as FaxDocument)),
      createdAt: now,
      updatedAt: now,
    };

    try {
      const container = await containers.faxMessages();
      await container.items.create(faxRecord);
    } catch (err) {
      console.error("Failed to write resent fax record to Cosmos:", err);
    }

    return NextResponse.json({ success: true, handle, newId: handleToId(handle) });
  } catch (error: unknown) {
    console.error("Resend fax error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resend fax" },
      { status: 500 }
    );
  }
}
