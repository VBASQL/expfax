import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const directionParam = params.get("direction") || "";
  // includeAll when: no direction given, direction is "all", or explicit includeAll=true with no specific direction
  const includeAll = directionParam === "" || directionParam === "all";
  const direction = includeAll ? "all" : directionParam;
  const page = parseInt(params.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(params.get("pageSize") || params.get("limit") || "20", 10), 100);
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const search = params.get("search") || "";
  const accountGuid = params.get("accountGuid") || ""; // optional: filter to a specific sent-from / received-to account
  const did = params.get("did") || "";                  // optional: filter to a specific DID (own number)
  const party = params.get("party") || "";              // optional: filter by counterparty number (sender for inbox, recipient for sent)
  const tagsParam = params.get("tags") || "";           // comma-separated label filter
  const filterTags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const sortBy = params.get("sortBy") || "submitTime";   // submitTime | senderFaxNumber | receivedToFaxNumber
  const sortDir = params.get("sortDir") === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * pageSize;

  // Whitelist sort fields to prevent injection
  const allowedSortFields: Record<string, string> = {
    submitTime: "c.submitTime",
    senderFaxNumber: "c.senderFaxNumber",
    receivedToFaxNumber: "c.receivedToFaxNumber",
  };
  const orderByField = allowedSortFields[sortBy] ?? "c.submitTime";

  const container = await containers.faxMessages();

  // Build the list of all FaxBack account GUIDs this user has access to.
  // This enables shared-account visibility: if two users are linked to the same
  // FaxBack account, both see the same fax activity for that account.
  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    // Also include legacy primary if not already in the array
    ...(user.faxbackAccountGuid && !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ];

  // A fax is visible to this user if:
  //   - they own it (c.userId = @uid), OR
  //   - for sent: it was sent from one of their linked accounts, OR
  //   - for received: it was received on one of their linked accounts
  // Using ARRAY_CONTAINS on the @accountGuids parameter handles all linked accounts in one query.
  const queryParams: Array<{ name: string; value: unknown }> = [
    { name: "@uid", value: user.id },
    { name: "@accountGuids", value: userAccountGuids },
  ];
  if (!includeAll) {
    queryParams.push({ name: "@dir", value: direction });
  }

  const accountVisibility = includeAll
    ? "(ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid) OR ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid))"
    : direction === "sent"
      ? "ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid)"
      : "ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid)";

  let whereClause = includeAll
    ? `WHERE c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`
    : `WHERE c.direction = @dir AND c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`;

  if (search) {
    if (direction === "received") {
      whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search) OR CONTAINS(c.receivedToFaxNumber, @search) OR CONTAINS(c.receivedToAccountId, @search))";
    } else {
      whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search))";
    }
    queryParams.push({ name: "@search", value: search });
  }

  // Date range filter
  if (dateFrom) {
    whereClause += " AND c.submitTime >= @dateFrom";
    queryParams.push({ name: "@dateFrom", value: dateFrom });
  }
  if (dateTo) {
    // dateTo is a date string (YYYY-MM-DD); include the full day by appending end-of-day
    whereClause += " AND c.submitTime <= @dateTo";
    queryParams.push({ name: "@dateTo", value: dateTo + "T23:59:59.999Z" });
  }

  // Tag filter — fax must have ANY of the selected tags (OR logic)
  if (filterTags.length > 0) {
    const tagConditions = filterTags
      .map((_, i) => `ARRAY_CONTAINS(c.tags, @filterTag${i})`)
      .join(" OR ");
    whereClause += ` AND (${tagConditions})`;
    filterTags.forEach((t, i) =>
      queryParams.push({ name: `@filterTag${i}`, value: t })
    );
  }

  // Optional filter to a single account
  if (accountGuid) {
    const accountField = direction === "sent" ? "c.sentFromAccountGuid" : "c.receivedToAccountGuid";
    whereClause += ` AND ${accountField} = @accountGuid`;
    queryParams.push({ name: "@accountGuid", value: accountGuid });
  }

  // Optional filter to a specific own-DID (sender for sent, recipient for received)
  if (did) {
    if (direction === "sent") {
      whereClause += ` AND c.senderFaxNumber = @did`;
    } else {
      whereClause += ` AND c.receivedToFaxNumber = @did`;
    }
    queryParams.push({ name: "@did", value: did });
  }

  // Optional filter by counterparty number(s).
  // `party` may be comma-separated for the multiselect dropdown (exact match,
  // OR semantics). A single non-numeric value still matches as a substring so
  // legacy callers keep working.
  if (party) {
    const parties = party.split(",").map((p) => p.trim()).filter(Boolean);
    if (parties.length > 1 || /^[+\d, ]+$/.test(party)) {
      // Exact-match list (typical case from the dropdown)
      const conds: string[] = [];
      parties.forEach((p, i) => {
        const pname = `@party${i}`;
        if (direction === "sent") {
          conds.push(`EXISTS(SELECT VALUE r FROM r IN c.recipients WHERE r.faxNumber = ${pname})`);
        } else {
          conds.push(`c.senderFaxNumber = ${pname}`);
        }
        queryParams.push({ name: pname, value: p });
      });
      whereClause += ` AND (${conds.join(" OR ")})`;
    } else {
      // Single free-form value → substring match (back-compat)
      if (direction === "sent") {
        whereClause += ` AND EXISTS(SELECT VALUE r FROM r IN c.recipients WHERE CONTAINS(r.faxNumber, @party))`;
      } else {
        whereClause += ` AND CONTAINS(c.senderFaxNumber, @party)`;
      }
      queryParams.push({ name: "@party", value: party });
    }
  }

  // Count
  const { resources: countResult } = await container.items
    .query({ query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`, parameters: queryParams as Array<{ name: string; value: string }> })
    .fetchAll();

  // Items — include all display fields + tags
  const { resources: items } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.isRead, c.documents, c.sentFromAccountGuid, c.sentFromAccountId, c.receivedToAccountGuid, c.receivedToAccountId, c.receivedToFaxNumber, c.tags FROM c ${whereClause} ORDER BY ${orderByField} ${sortDir} OFFSET ${offset} LIMIT ${pageSize}`,
      parameters: queryParams as Array<{ name: string; value: string }>,
    })
    .fetchAll();

  return NextResponse.json({
    items,
    total: countResult[0] || 0,
    page,
    pageSize,
    hasMore: offset + pageSize < (countResult[0] || 0),
  });
}
