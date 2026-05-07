import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { searchAccounts } from "@/lib/faxback/accounts";

/** Lists all accounts on the FaxBack server so we can compare GUIDs to what the user is linked to. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const accounts = await searchAccounts("");
    return NextResponse.json({ count: accounts.length, accounts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
