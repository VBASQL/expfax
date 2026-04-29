import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { uploadDraftFiles } from "@/lib/services/blob-storage";
import { v4 as uuid } from "uuid";
import type { FaxDraft } from "@/types";

// GET /api/fax/drafts  — list user's drafts (metadata only, no blobs)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxDrafts();
  const { resources } = await container.items
    .query<FaxDraft>({
      query: "SELECT * FROM c WHERE c.userId = @uid ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Don't return blob file contents — just metadata
  const list = resources.map((d) => ({
    id: d.id,
    title: d.title,
    subject: d.subject,
    recipientCount: d.recipients.length,
    attachmentCount: d.attachments.length,
    updatedAt: d.updatedAt,
  }));

  return NextResponse.json({ success: true, drafts: list });
}

// POST /api/fax/drafts  — save a new draft
// Body: same shape as /api/fax/send but documents[] items have { name, contentBase64, size }
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    title,
    recipients,
    subject,
    useCover,
    coverMode,
    coverTemplate,
    coverMessage,
    templateFields,
    oneTimeCover,
    documents,   // [{ name, contentBase64, size }]
    resolution,
    scheduleTime,
    billingCode,
  } = body;

  const draftId = uuid();
  const now = new Date().toISOString();

  // Upload attachments to Blob Storage
  const fileItems: Array<{ name: string; contentBase64: string }> = (documents ?? []).map(
    (d: { name: string; contentBase64: string }) => ({ name: d.name, contentBase64: d.contentBase64 })
  );
  let blobPaths: string[] = [];
  if (fileItems.length > 0) {
    blobPaths = await uploadDraftFiles(user.id, draftId, fileItems);
  }

  const attachments = (documents ?? []).map(
    (d: { name: string; size?: number }, i: number) => ({
      name: d.name,
      size: d.size ?? 0,
      blobPath: blobPaths[i] ?? "",
    })
  );

  const draft: FaxDraft = {
    id: draftId,
    userId: user.id,
    title: title || undefined,
    recipients: recipients ?? [],
    subject: subject ?? "",
    useCover: !!useCover,
    coverMode: coverMode ?? "saved",
    coverTemplate: coverTemplate ?? undefined,
    coverMessage: coverMessage ?? undefined,
    templateFields: templateFields ?? undefined,
    oneTimeCover: oneTimeCover ?? undefined,
    attachments,
    resolution: resolution ?? 0,
    scheduleTime: scheduleTime ?? undefined,
    billingCode: billingCode ?? undefined,
    createdAt: now,
    updatedAt: now,
  };

  const container = await containers.faxDrafts();
  await container.items.create(draft);

  return NextResponse.json({ success: true, draftId });
}
