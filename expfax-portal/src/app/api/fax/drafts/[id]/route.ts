import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { uploadDraftFiles, deleteBlobsByPaths, getDraftFileUrl } from "@/lib/services/blob-storage";
import type { FaxDraft } from "@/types";

// GET /api/fax/drafts/[id]  — return full draft with short-lived attachment download URLs
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxDrafts();
  const { resource } = await container.item(id, user.id).read<FaxDraft>();

  if (!resource || resource.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Generate short-lived download URLs for each attachment so the client can re-hydrate files
  const attachmentsWithUrls = await Promise.all(
    resource.attachments.map(async (a) => ({
      ...a,
      downloadUrl: a.blobPath ? await getDraftFileUrl(a.blobPath) : null,
    }))
  );

  return NextResponse.json({ success: true, draft: { ...resource, attachments: attachmentsWithUrls } });
}

// PUT /api/fax/drafts/[id]  — overwrite an existing draft (replace attachments)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxDrafts();
  const { resource: existing } = await container.item(id, user.id).read<FaxDraft>();

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const {
    title, recipients, subject,
    useCover, coverMode, coverTemplate, coverMessage, templateFields, oneTimeCover,
    documents, resolution, scheduleTime, billingCode,
  } = body;

  // Delete old blobs first (best-effort)
  const oldPaths = existing.attachments.map((a) => a.blobPath).filter(Boolean);
  if (oldPaths.length > 0) {
    try { await deleteBlobsByPaths(oldPaths); } catch { /* non-fatal */ }
  }

  // Upload new attachments
  const fileItems: Array<{ name: string; contentBase64: string }> = (documents ?? []).map(
    (d: { name: string; contentBase64: string }) => ({ name: d.name, contentBase64: d.contentBase64 })
  );
  let blobPaths: string[] = [];
  if (fileItems.length > 0) {
    blobPaths = await uploadDraftFiles(user.id, id, fileItems);
  }

  const attachments = (documents ?? []).map(
    (d: { name: string; size?: number }, i: number) => ({
      name: d.name,
      size: d.size ?? 0,
      blobPath: blobPaths[i] ?? "",
    })
  );

  const now = new Date().toISOString();
  const updated: FaxDraft = {
    ...existing,
    title: title ?? existing.title,
    recipients: recipients ?? existing.recipients,
    subject: subject ?? existing.subject,
    useCover: useCover ?? existing.useCover,
    coverMode: coverMode ?? existing.coverMode,
    coverTemplate: coverTemplate ?? existing.coverTemplate,
    coverMessage: coverMessage ?? existing.coverMessage,
    templateFields: templateFields ?? existing.templateFields,
    oneTimeCover: oneTimeCover ?? existing.oneTimeCover,
    attachments,
    resolution: resolution ?? existing.resolution,
    scheduleTime: scheduleTime ?? existing.scheduleTime,
    billingCode: billingCode ?? existing.billingCode,
    updatedAt: now,
  };

  await container.item(id, user.id).replace(updated);
  return NextResponse.json({ success: true });
}

// DELETE /api/fax/drafts/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const container = await containers.faxDrafts();
  const { resource } = await container.item(id, user.id).read<FaxDraft>();

  if (!resource || resource.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete blobs
  const paths = resource.attachments.map((a) => a.blobPath).filter(Boolean);
  if (paths.length > 0) {
    try { await deleteBlobsByPaths(paths); } catch { /* non-fatal */ }
  }

  await container.item(id, user.id).delete();
  return NextResponse.json({ success: true });
}
