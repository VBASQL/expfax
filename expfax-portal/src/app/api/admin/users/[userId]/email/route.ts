import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getAccountEmailSettings, updateEmailConfig } from "@/lib/faxback/accounts";
import type { FaxBackAccountLink, User } from "@/types";

type Linked = { accountGuid: string; accountId: string; faxNumber: string | null; label: string | null };

function linkedAccounts(u: User): Linked[] {
  const list: Linked[] = [];
  if (Array.isArray(u.faxbackAccounts)) {
    for (const a of u.faxbackAccounts as FaxBackAccountLink[]) {
      if (a.accountGuid) {
        list.push({
          accountGuid: a.accountGuid,
          accountId: a.accountId ?? "",
          faxNumber: a.faxNumber ?? null,
          label: a.label ?? null,
        });
      }
    }
  }
  if (u.faxbackAccountGuid && !list.some((a) => a.accountGuid === u.faxbackAccountGuid)) {
    list.push({
      accountGuid: u.faxbackAccountGuid,
      accountId: u.faxbackAccountId ?? "",
      faxNumber: u.faxNumber ?? null,
      label: null,
    });
  }
  return list;
}

function resolveGuid(u: User, requested: string | null): string | null {
  const accts = linkedAccounts(u);
  if (requested) return accts.some((a) => a.accountGuid === requested) ? requested : null;
  const def = u.defaultFaxbackAccountGuid ?? u.faxbackAccountGuid ?? accts[0]?.accountGuid ?? null;
  return def;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const container = await containers.users();
  const { resource: targetUser } = await container.item(userId, userId).read<User>();
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const requested = request.nextUrl.searchParams.get("accountGuid");
  const accounts = linkedAccounts(targetUser);
  const accountGuid = resolveGuid(targetUser, requested);
  if (!accountGuid) {
    return NextResponse.json(
      { error: requested ? "Account not linked to user" : "User has no linked FaxBack account", accounts },
      { status: requested ? 403 : 404 },
    );
  }

  try {
    const settings = await getAccountEmailSettings(accountGuid);
    return NextResponse.json({
      accounts,
      accountGuid,
      inboundEnabled: !!settings.inbound,
      emailAlias: settings.inbound?.emailAlias ?? "",
      includeCoverPage: settings.useCoverPage,
      deliveryEmail: settings.outbound?.deliveryEmail ?? "",
      forwardReceived: settings.outbound?.forwardReceived ?? false,
      format: settings.outbound?.attachmentFormat ?? "pdf",
      notifyOnSend: settings.outbound?.deliveryNotification ?? false,
      notifyOnFail: settings.outbound?.nonDeliveryNotification ?? false,
    });
  } catch (err) {
    console.error("getAccountEmailSettings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email settings" },
      { status: 502 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const container = await containers.users();
  const { resource: targetUser } = await container.item(userId, userId).read<User>();
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const config = await request.json();
  const accountGuid = resolveGuid(targetUser, config.accountGuid ?? null);
  if (!accountGuid) {
    return NextResponse.json(
      { error: config.accountGuid ? "Account not linked to user" : "User has no linked FaxBack account" },
      { status: config.accountGuid ? 403 : 404 },
    );
  }

  const forwardReceived = !!config.forwardReceived;
  const notifyOnSend = !!config.notifyOnSend;
  const notifyOnFail = !!config.notifyOnFail;
  const anyOutboundOn = forwardReceived || notifyOnSend || notifyOnFail;

  try {
    await updateEmailConfig({
      accountGuid,
      inboundAlias: config.inboundEnabled && config.emailAlias ? config.emailAlias : null,
      outbound: anyOutboundOn
        ? {
            deliveryEmail: (config.deliveryEmail ?? "").trim(),
            forwardReceived,
            attachmentFormat: config.format === "tiff" ? "tif" : "pdf",
            deliveryNotification: notifyOnSend,
            nonDeliveryNotification: notifyOnFail,
          }
        : null,
      useCoverPage: config.includeCoverPage ?? false,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("updateEmailConfig error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save email settings" },
      { status: 502 },
    );
  }
}
