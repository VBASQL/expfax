import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { audit } from "@/lib/audit/logger";
import type { MfaMode, User } from "@/types";

const VALID_MFA: MfaMode[] = ["off", "always", "new_location"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await request.json()) as Partial<{
    faxbackAccountId: string | null;
    faxbackAccountGuid: string | null;
    faxNumber: string | null;
    role: User["role"];
    mfaMode: MfaMode;
    purgeDays: number | null;
    revokeTrustedLocationId: string;
  }>;

  const container = await containers.users();
  const { resource: user } = await container.item(userId, userId).read<User>();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const wantsLink =
    body.faxbackAccountId !== undefined ||
    body.faxbackAccountGuid !== undefined ||
    body.faxNumber !== undefined;

  if (wantsLink && !user.signupCompletedAt) {
    return NextResponse.json(
      { error: "Cannot link FaxBack account before the user completes signup." },
      { status: 400 }
    );
  }

  if (body.mfaMode !== undefined) {
    if (!VALID_MFA.includes(body.mfaMode)) {
      return NextResponse.json({ error: "Invalid mfaMode" }, { status: 400 });
    }
    if (user.authType !== "microsoft") {
      return NextResponse.json(
        { error: "MFA mode only applies to Microsoft-account users." },
        { status: 400 }
      );
    }
  }

  const patches: Array<{ op: "set"; path: string; value: unknown }> = [];

  if (body.faxbackAccountId !== undefined)
    patches.push({ op: "set", path: "/faxbackAccountId", value: body.faxbackAccountId });
  if (body.faxbackAccountGuid !== undefined)
    patches.push({ op: "set", path: "/faxbackAccountGuid", value: body.faxbackAccountGuid });
  if (body.faxNumber !== undefined)
    patches.push({ op: "set", path: "/faxNumber", value: body.faxNumber });
  if (body.role !== undefined)
    patches.push({ op: "set", path: "/role", value: body.role });
  if (body.mfaMode !== undefined)
    patches.push({ op: "set", path: "/mfaMode", value: body.mfaMode });
  if (body.purgeDays !== undefined)
    patches.push({ op: "set", path: "/purgeDays", value: body.purgeDays });

  if (wantsLink) {
    patches.push({ op: "set", path: "/linkedBy", value: admin.id });
  }

  if (body.revokeTrustedLocationId) {
    const next = (user.trustedLocations ?? []).filter(
      (t) => t.id !== body.revokeTrustedLocationId
    );
    patches.push({ op: "set", path: "/trustedLocations", value: next });
  }

  patches.push({ op: "set", path: "/updatedAt", value: new Date().toISOString() });

  await container.item(userId, userId).patch(patches);

  if (wantsLink) {
    await audit({
      userId: admin.id,
      action: "admin.user_link",
      resourceType: "user",
      resourceId: userId,
      detail: {
        faxbackAccountId: body.faxbackAccountId,
        faxbackAccountGuid: body.faxbackAccountGuid,
        faxNumber: body.faxNumber,
      },
      request,
    });
  }
  if (body.role !== undefined && body.role !== user.role) {
    await audit({
      userId: admin.id,
      action: "admin.role_change",
      resourceType: "user",
      resourceId: userId,
      detail: { newRole: body.role, previousRole: user.role },
      request,
    });
  }
  if (body.mfaMode !== undefined) {
    await audit({
      userId: admin.id,
      action: "admin.mfa_mode_change",
      resourceType: "user",
      resourceId: userId,
      detail: { newMode: body.mfaMode, previousMode: user.mfaMode ?? "off" },
      request,
    });
  }
  if (body.revokeTrustedLocationId) {
    await audit({
      userId: admin.id,
      action: "admin.trusted_location_revoke",
      resourceType: "user",
      resourceId: userId,
      detail: { trustedLocationId: body.revokeTrustedLocationId },
      request,
    });
  }

  return NextResponse.json({ success: true });
}
