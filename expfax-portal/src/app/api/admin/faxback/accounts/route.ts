import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readAccount, searchAccounts } from "@/lib/faxback/accounts";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const guid = (request.nextUrl.searchParams.get("guid") ?? "").trim();
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim();

  // Direct GUID verification path (kept for paste-and-verify UX)
  if (guid) {
    if (!GUID_RE.test(guid)) {
      return NextResponse.json(
        { items: [], error: "Not a valid GUID format." },
        { status: 400 }
      );
    }
    try {
      const account = await readAccount(guid);
      return NextResponse.json({
        items: [
          {
            accountGuid: account.accountGuid,
            accountId: account.accountId,
            displayName:
              (account.raw["DisplayName"] as string) ??
              (account.raw["AccountName"] as string) ??
              null,
            faxNumber:
              (account.raw["FaxNumber"] as string) ??
              (account.raw["Phone"] as string) ??
              null,
            emailAlias: account.emailAlias,
          },
        ],
      });
    } catch (err) {
      console.error("FaxBack readAccount failed:", err);
      return NextResponse.json(
        { items: [], error: "Account not found in FaxBack." },
        { status: 404 }
      );
    }
  }

  // Full / filtered list via mqs/Accounts/ReadAccountGuids + ReadAccountBlock
  try {
    const items = await searchAccounts(search);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("FaxBack searchAccounts failed:", err);
    return NextResponse.json(
      { items: [], error: "Failed to load FaxBack accounts." },
      { status: 502 }
    );
  }
}

