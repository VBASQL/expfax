import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

/**
 * GET /api/fax/parties?direction=received|sent
 *
 * Returns the distinct counterparty fax numbers visible to the current user:
 *   - direction=received → distinct sender numbers
 *   - direction=sent     → distinct recipient numbers (flattened across `recipients`)
 *
 * Used by the fax list "From"/"To" multiselect filter dropdown.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const direction = request.nextUrl.searchParams.get("direction") || "received";
  const container = await containers.faxMessages();

  // Same visibility rules as /api/fax: own faxes + faxes on any linked account.
  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid && !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ];

  const accountVisibility = direction === "sent"
    ? "ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid)"
    : "ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid)";

  const where = `WHERE c.direction = @dir AND c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`;
  const params = [
    { name: "@uid", value: user.id },
    { name: "@dir", value: direction },
    { name: "@accountGuids", value: userAccountGuids as unknown as string },
  ];

  let query: string;
  if (direction === "sent") {
    // Flatten recipients[] so DISTINCT VALUE returns one row per unique number.
    query = `SELECT DISTINCT VALUE r.faxNumber FROM c JOIN r IN c.recipients ${where}`;
  } else {
    query = `SELECT DISTINCT VALUE c.senderFaxNumber FROM c ${where}`;
  }

  const { resources } = await container.items
    .query({ query, parameters: params as Array<{ name: string; value: string }> })
    .fetchAll();

  const numbers = (resources as string[])
    .filter((n) => typeof n === "string" && n.length > 0)
    .sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ numbers });
}
