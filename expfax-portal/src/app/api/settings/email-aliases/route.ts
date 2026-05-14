import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import {
  listEmailAliases,
  createEmailAlias,
  deleteEmailAlias,
} from "@/lib/faxback/accounts";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const [aliases, config] = await Promise.all([listEmailAliases(accountGuid), getConfig()]);
    return NextResponse.json({
      accountGuid,
      aliases,
      faxEmailDomain: config.faxbackEmailDomain || null,
    });
  } catch (err) {
    console.error("GET email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email aliases" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
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

  const trimmed = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(trimmed)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  try {
    await createEmailAlias(accountGuid, trimmed);
    return NextResponse.json({ success: true, email: trimmed });
  } catch (err) {
    console.error("POST email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add email alias" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedAccount = request.nextUrl.searchParams.get("accountGuid");
  const accountGuid = resolveAccountGuid(user, requestedAccount);
  if (!accountGuid) {
    return NextResponse.json(
      { error: requestedAccount ? "Account not linked to user" : "No fax account linked" },
      { status: requestedAccount ? 403 : 404 }
    );
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  try {
    await deleteEmailAlias(accountGuid, email);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove email alias" },
      { status: 502 }
    );
  }
}
