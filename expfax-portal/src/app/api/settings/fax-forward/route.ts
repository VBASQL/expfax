import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccountEmailSettings, setEmailRouting, disableEmailRouting } from "@/lib/faxback/accounts";

function resolveAccountGuid(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  requested: string | null
): string | null {
  if (!user) return null;
  const linked: string[] = [];
  if (user.faxbackAccounts?.length) {
    for (const a of user.faxbackAccounts) if (a.accountGuid) linked.push(a.accountGuid);
  }
  if (user.faxbackAccountGuid && !linked.includes(user.faxbackAccountGuid)) {
    linked.push(user.faxbackAccountGuid);
  }
  if (requested) {
    return linked.includes(requested) ? requested : null;
  }
  return linked[0] ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = request.nextUrl.searchParams.get("accountGuid");
  const accountGuid = resolveAccountGuid(user, requested);
  if (!accountGuid) {
    return NextResponse.json(
      { error: requested ? "Account not linked to user" : "No fax account linked" },
      { status: requested ? 403 : 404 }
    );
  }

  try {
    const settings = await getAccountEmailSettings(accountGuid);
    return NextResponse.json({
      accountGuid,
      email: settings.outbound?.deliveryEmail ?? "",
      forwardReceived: settings.outbound?.forwardReceived ?? false,
      format: settings.outbound?.attachmentFormat ?? "pdf",
      notifyOnSend: settings.outbound?.deliveryNotification ?? false,
      notifyOnFail: settings.outbound?.nonDeliveryNotification ?? false,
    });
  } catch (err) {
    console.error("GET fax-forward settings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load fax forwarding settings" },
      { status: 502 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const accountGuid = resolveAccountGuid(user, body.accountGuid ?? null);
  if (!accountGuid) {
    return NextResponse.json(
      { error: body.accountGuid ? "Account not linked to user" : "No fax account linked" },
      { status: body.accountGuid ? 403 : 404 }
    );
  }

  const forwardReceived = !!body.forwardReceived;
  const notifyOnSend = !!body.notifyOnSend;
  const notifyOnFail = !!body.notifyOnFail;
  const anyOn = forwardReceived || notifyOnSend || notifyOnFail;

  try {
    if (anyOn) {
      if (!body.email?.trim()) {
        return NextResponse.json(
          { error: "Email address is required when any option is enabled" },
          { status: 400 }
        );
      }
      await setEmailRouting(accountGuid, {
        deliveryEmail: body.email.trim(),
        forwardReceived,
        attachmentFormat: body.format === "tiff" ? "tif" : "pdf",
        deliveryNotification: notifyOnSend,
        nonDeliveryNotification: notifyOnFail,
      });
    } else {
      await disableEmailRouting(accountGuid);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT fax-forward settings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save fax forwarding settings" },
      { status: 502 }
    );
  }
}
