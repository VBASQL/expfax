import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getConfig } from "@/lib/config";
import {
  listEmailAliases,
  createEmailAlias,
  deleteEmailAlias,
} from "@/lib/faxback/accounts";
import type { FaxBackAccountLink, User } from "@/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function linkedGuids(u: User): string[] {
  const list: string[] = [];
  if (Array.isArray(u.faxbackAccounts)) {
    for (const a of u.faxbackAccounts as FaxBackAccountLink[]) {
      if (a.accountGuid) list.push(a.accountGuid);
    }
  }
  if (u.faxbackAccountGuid && !list.includes(u.faxbackAccountGuid)) {
    list.push(u.faxbackAccountGuid);
  }
  return list;
}

function resolveGuid(u: User, requested: string | null): string | null {
  const guids = linkedGuids(u);
  if (requested) return guids.includes(requested) ? requested : null;
  return u.defaultFaxbackAccountGuid ?? u.faxbackAccountGuid ?? guids[0] ?? null;
}

async function loadTarget(userId: string): Promise<User | null> {
  const container = await containers.users();
  const { resource } = await container.item(userId, userId).read<User>();
  return resource ?? null;
}

async function gate(request: NextRequest, userId: string, requested: string | null) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const target = await loadTarget(userId);
  if (!target) return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  const accountGuid = resolveGuid(target, requested);
  if (!accountGuid) {
    return {
      error: NextResponse.json(
        { error: requested ? "Account not linked to user" : "User has no linked FaxBack account" },
        { status: requested ? 403 : 404 },
      ),
    };
  }
  return { accountGuid };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const requested = request.nextUrl.searchParams.get("accountGuid");
  const g = await gate(request, userId, requested);
  if ("error" in g) return g.error;

  try {
    const [aliases, config] = await Promise.all([listEmailAliases(g.accountGuid), getConfig()]);
    return NextResponse.json({
      accountGuid: g.accountGuid,
      aliases,
      faxEmailDomain: config.faxbackEmailDomain || null,
    });
  } catch (err) {
    console.error("admin GET email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email aliases" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  const g = await gate(request, userId, body.accountGuid ?? null);
  if ("error" in g) return g.error;

  const trimmed = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(trimmed)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  try {
    await createEmailAlias(g.accountGuid, trimmed);
    return NextResponse.json({ success: true, email: trimmed });
  } catch (err) {
    console.error("admin POST email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add email alias" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const requestedAccount = request.nextUrl.searchParams.get("accountGuid");
  const g = await gate(request, userId, requestedAccount);
  if ("error" in g) return g.error;

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Missing email parameter" }, { status: 400 });
  }

  try {
    await deleteEmailAlias(g.accountGuid, email);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("admin DELETE email-aliases error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove email alias" },
      { status: 502 },
    );
  }
}
