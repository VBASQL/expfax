import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";
import { hardDeleteInvitation, revokeInvitation } from "@/lib/auth/invitations";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";

  if (permanent) {
    const deleted = await hardDeleteInvitation(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await audit({
      userId: user.id,
      action: "admin.invitation_delete",
      resourceType: "invitation",
      resourceId: id,
      detail: {},
      request,
    });

    return NextResponse.json({ ok: true });
  }

  const updated = await revokeInvitation(id);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await audit({
    userId: user.id,
    action: "admin.invitation_revoke",
    resourceType: "invitation",
    resourceId: id,
    detail: { email: updated.email, previousStatus: updated.status },
    request,
  });

  return NextResponse.json({ ok: true });
}

