import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

const FAX_SELECT = `c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime`;
const CONTACT_SELECT = `c.id, c.name, c.faxNumber, c.company`;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const container = await containers.faxMessages();
  const searchLower = q.toLowerCase();

  // Build account GUID list — mirrors fax/route.ts visibility logic
  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid &&
      !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ];

  const baseParams = [
    { name: "@uid", value: user.id },
    { name: "@q", value: searchLower },
    { name: "@accountGuids", value: userAccountGuids },
  ];

  const visibility = `(c.userId = @uid OR ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid) OR ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid))`;

  try {
    const faxQuery = container.items
      .query({
        query: `SELECT ${FAX_SELECT} FROM c
                WHERE ${visibility} AND c.isDeleted = false
                AND (
                  CONTAINS(LOWER(c.senderName), @q)
                  OR CONTAINS(c.senderFaxNumber, @q)
                  OR CONTAINS(LOWER(c.subject), @q)
                  OR EXISTS(SELECT VALUE r FROM r IN c.recipients WHERE CONTAINS(r.faxNumber, @q) OR CONTAINS(LOWER(r.name), @q))
                )
                OFFSET 0 LIMIT 30`,
        parameters: baseParams,
      })
      .fetchAll();

    const contactContainer = await containers.contacts();
    const contactQuery = contactContainer.items
      .query({
        query: `SELECT ${CONTACT_SELECT} FROM c
                WHERE c.userId = @uid
                AND NOT IS_DEFINED(c.type)
                AND (
                  CONTAINS(LOWER(c.name), @q)
                  OR CONTAINS(c.faxNumber, @q)
                  OR CONTAINS(LOWER(c.company), @q)
                )
                OFFSET 0 LIMIT 10`,
        parameters: [{ name: "@uid", value: user.id }, { name: "@q", value: searchLower }],
      })
      .fetchAll();

    const [faxResult, contactResult] = await Promise.all([faxQuery, contactQuery]);

    // Sort faxes newest-first in JS (avoids ORDER BY + CONTAINS composite index requirement)
    faxResult.resources.sort(
      (a, b) => new Date(b.submitTime).getTime() - new Date(a.submitTime).getTime()
    );

    return NextResponse.json({
      results: faxResult.resources.slice(0, 20),
      contacts: contactResult.resources,
    });
  } catch (err) {
    console.error("[search] query error", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
