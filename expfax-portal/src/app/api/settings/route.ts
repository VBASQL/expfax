import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Collect all fax numbers from all linked accounts
  const allFaxNumbers: string[] = [];
  if (user.faxbackAccounts?.length) {
    for (const acct of user.faxbackAccounts) {
      if (acct.faxNumber) {
        for (const n of acct.faxNumber.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!allFaxNumbers.includes(n)) allFaxNumbers.push(n);
        }
      }
    }
  } else if (user.faxNumber) {
    for (const n of user.faxNumber.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!allFaxNumbers.includes(n)) allFaxNumbers.push(n);
    }
  }

  // Build per-account list (for the settings UI account selector)
  const faxbackAccounts: Array<{ accountGuid: string; faxNumber: string | null; label: string | null }> = [];
  if (user.faxbackAccounts?.length) {
    for (const acct of user.faxbackAccounts) {
      faxbackAccounts.push({
        accountGuid: acct.accountGuid,
        faxNumber: acct.faxNumber ?? null,
        label: acct.label ?? null,
      });
    }
  } else if (user.faxbackAccountGuid) {
    faxbackAccounts.push({
      accountGuid: user.faxbackAccountGuid,
      faxNumber: user.faxNumber ?? null,
      label: null,
    });
  }
  const defaultAccountGuid =
    user.defaultFaxbackAccountGuid ?? user.faxbackAccountGuid ?? faxbackAccounts[0]?.accountGuid ?? null;

  // Settings stored directly on the user document
  return NextResponse.json({
    displayName: user.displayName,
    email: user.email,
    faxNumber: user.faxNumber,
    allFaxNumbers,
    faxbackAccounts,
    defaultAccountGuid,
    preferences: user.preferences || {
      notifyOnReceive: true,
      notifyOnSendComplete: false,
      defaultCoverTemplate: null,
      itemsPerPage: 20,
      timezone: "America/New_York",
      numberProfiles: {},
      notificationsByNumber: {},
    },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const container = await containers.users();

  await container.item(user.id, user.id).patch([
    {
      op: "set",
      path: "/preferences",
      value: {
        notifyOnReceive: body.notifyOnReceive ?? true,
        notifyOnSendComplete: body.notifyOnSendComplete ?? false,
        defaultCoverTemplate: body.defaultCoverTemplate || null,
        itemsPerPage: body.itemsPerPage || 20,
        timezone: body.timezone || "America/New_York",
        numberProfiles: body.numberProfiles || {},
        notificationsByNumber: body.notificationsByNumber || {},
      },
    },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
