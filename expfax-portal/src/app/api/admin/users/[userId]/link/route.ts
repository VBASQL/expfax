import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { audit } from "@/lib/audit/logger";
import { normalizePhone } from "@/lib/phone";
import type { FaxBackAccountLink, MfaMode, User } from "@/types";

/** Normalize a fax-number field that may hold a single DID or a comma-separated
 *  list of DIDs (multi-DID FaxBack accounts). */
function normalizeFaxNumberField(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const parts = String(v).split(",").map((s) => normalizePhone(s)).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

const VALID_MFA: MfaMode[] = ["off", "always", "new_location"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin || !admin.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await request.json()) as Partial<{
    // Legacy single-account link
    faxbackAccountId: string | null;
    faxbackAccountGuid: string | null;
    faxNumber: string | null;
    // Multi-account operations
    addAccount: { accountGuid: string; accountId: string; faxNumber?: string | null; label?: string | null };
    removeAccount: { accountGuid: string };
    setDefaultAccount: { accountGuid: string | null };
    // Other settings
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

  const wantsAddAccount = !!body.addAccount;
  const wantsRemoveAccount = !!body.removeAccount;
  const wantsSetDefault = body.setDefaultAccount !== undefined;

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

  // ── Legacy single-account link ─────────────────────────────────────────
  if (body.faxbackAccountId !== undefined)
    patches.push({ op: "set", path: "/faxbackAccountId", value: body.faxbackAccountId });
  if (body.faxbackAccountGuid !== undefined)
    patches.push({ op: "set", path: "/faxbackAccountGuid", value: body.faxbackAccountGuid });
  if (body.faxNumber !== undefined)
    patches.push({ op: "set", path: "/faxNumber", value: normalizeFaxNumberField(body.faxNumber) });

  if (wantsLink) {
    patches.push({ op: "set", path: "/linkedBy", value: admin.id });
    // Also sync into faxbackAccounts array so multi-account list is consistent
    if (body.faxbackAccountGuid && body.faxbackAccountId) {
      const existing = user.faxbackAccounts ?? [];
      const alreadyThere = existing.some((a) => a.accountGuid === body.faxbackAccountGuid);
      if (!alreadyThere) {
        const link: FaxBackAccountLink = {
          accountGuid: body.faxbackAccountGuid,
          accountId: body.faxbackAccountId,
          faxNumber: normalizeFaxNumberField(body.faxNumber),
          label: null,
          addedAt: new Date().toISOString(),
          addedBy: admin.id,
        };
        patches.push({ op: "set", path: "/faxbackAccounts", value: [...existing, link] });
      }
      // Set as default if no default yet
      if (!user.defaultFaxbackAccountGuid) {
        patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: body.faxbackAccountGuid });
      }
    }
  }

  // ── Multi-account: add ─────────────────────────────────────────────────
  if (wantsAddAccount && body.addAccount) {
    const { accountGuid, accountId, faxNumber = null, label = null } = body.addAccount;
    if (!accountGuid || !accountId) {
      return NextResponse.json({ error: "addAccount requires accountGuid and accountId" }, { status: 400 });
    }
    const existing = user.faxbackAccounts ?? [];
    if (existing.some((a) => a.accountGuid === accountGuid)) {
      return NextResponse.json({ error: "Account already linked to this user" }, { status: 409 });
    }
    const link: FaxBackAccountLink = {
      accountGuid,
      accountId,
      faxNumber: faxNumber ?? null,
      label: label ?? null,
      addedAt: new Date().toISOString(),
      addedBy: admin.id,
    };
    patches.push({ op: "set", path: "/faxbackAccounts", value: [...existing, link] });
    // If this is the first account, also set as legacy primary and default
    if (existing.length === 0) {
      patches.push({ op: "set", path: "/faxbackAccountGuid", value: accountGuid });
      patches.push({ op: "set", path: "/faxbackAccountId", value: accountId });
      patches.push({ op: "set", path: "/faxNumber", value: faxNumber ?? null });
      patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: accountGuid });
      patches.push({ op: "set", path: "/linkedBy", value: admin.id });
    } else if (!user.defaultFaxbackAccountGuid) {
      patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: accountGuid });
    }
  }

  // ── Multi-account: remove ──────────────────────────────────────────────
  if (wantsRemoveAccount && body.removeAccount) {
    const { accountGuid } = body.removeAccount;
    const existing = user.faxbackAccounts ?? [];
    const next = existing.filter((a) => a.accountGuid !== accountGuid);
    patches.push({ op: "set", path: "/faxbackAccounts", value: next });
    // If removing the current default, promote the first remaining or null
    const currentDefault = user.defaultFaxbackAccountGuid ?? user.faxbackAccountGuid;
    if (currentDefault === accountGuid) {
      const newDefault = next[0]?.accountGuid ?? null;
      patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: newDefault });
      // Also update legacy fields
      patches.push({ op: "set", path: "/faxbackAccountGuid", value: next[0]?.accountGuid ?? null });
      patches.push({ op: "set", path: "/faxbackAccountId", value: next[0]?.accountId ?? null });
      patches.push({ op: "set", path: "/faxNumber", value: next[0]?.faxNumber ?? null });
    }
  }

  // ── Multi-account: set default ─────────────────────────────────────────
  if (wantsSetDefault) {
    const newDefault = body.setDefaultAccount!.accountGuid;
    if (newDefault !== null) {
      const accounts = user.faxbackAccounts ?? [];
      const acc = accounts.find((a) => a.accountGuid === newDefault);
      if (!acc) {
        return NextResponse.json({ error: "Account not found in user's linked accounts" }, { status: 404 });
      }
      patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: newDefault });
      // Keep legacy primary in sync
      patches.push({ op: "set", path: "/faxbackAccountGuid", value: acc.accountGuid });
      patches.push({ op: "set", path: "/faxbackAccountId", value: acc.accountId });
      patches.push({ op: "set", path: "/faxNumber", value: acc.faxNumber ?? null });
    } else {
      patches.push({ op: "set", path: "/defaultFaxbackAccountGuid", value: null });
    }
  }

  if (body.role !== undefined)
    patches.push({ op: "set", path: "/role", value: body.role });
  if (body.mfaMode !== undefined)
    patches.push({ op: "set", path: "/mfaMode", value: body.mfaMode });
  if (body.purgeDays !== undefined)
    patches.push({ op: "set", path: "/purgeDays", value: body.purgeDays });

  if (body.revokeTrustedLocationId) {
    const next = (user.trustedLocations ?? []).filter(
      (t) => t.id !== body.revokeTrustedLocationId
    );
    patches.push({ op: "set", path: "/trustedLocations", value: next });
  }

  patches.push({ op: "set", path: "/updatedAt", value: new Date().toISOString() });

  await container.item(userId, userId).patch(patches);

  if (wantsLink || wantsAddAccount) {
    await audit({
      userId: admin.id,
      action: "admin.user_link",
      resourceType: "user",
      resourceId: userId,
      detail: wantsAddAccount
        ? { addAccount: body.addAccount }
        : {
            faxbackAccountId: body.faxbackAccountId,
            faxbackAccountGuid: body.faxbackAccountGuid,
            faxNumber: body.faxNumber,
          },
      request,
    });
  }
  if (wantsRemoveAccount) {
    await audit({
      userId: admin.id,
      action: "admin.user_link",
      resourceType: "user",
      resourceId: userId,
      detail: { removeAccount: body.removeAccount },
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
