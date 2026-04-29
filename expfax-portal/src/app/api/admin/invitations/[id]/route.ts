import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit/logger";
import { revokeInvitation } from "@/lib/auth/invitations";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
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
