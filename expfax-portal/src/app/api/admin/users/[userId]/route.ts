import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { audit } from "@/lib/audit/logger";
import { deleteExternalUser } from "@/lib/auth/entra";
import type { User } from "@/types";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin || !admin.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;

  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const container = await containers.users();
  const { resource: user } = await container.item(userId, userId).read<User>();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Delete from Entra External ID (CIAM) if they have an entraId
  let entraDeleted = false;
  let entraError: string | null = null;
  if (user.entraId) {
    try {
      await deleteExternalUser(user.entraId);
      entraDeleted = true;
    } catch (err) {
      entraError = err instanceof Error ? err.message : "Entra delete failed";
      console.error("deleteExternalUser failed:", err);
      // Continue deleting from Cosmos even if Entra fails
    }
  }

  await container.item(userId, userId).delete();

  await audit({
    userId: admin.id,
    action: "admin.user_delete",
    resourceType: "user",
    resourceId: userId,
    detail: { email: user.email, displayName: user.displayName, entraDeleted, entraError },
    request,
  });

  return NextResponse.json({ ok: true, entraDeleted, entraError });
}
