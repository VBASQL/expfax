import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const direction = params.get("direction") || "received";
  const page = parseInt(params.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(params.get("pageSize") || "20", 10), 100);
  const search = params.get("search") || "";
  const accountGuid = params.get("accountGuid") || ""; // optional: filter to a specific sent-from / received-to account
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
    { name: "@dir", value: direction },
    { name: "@accountGuids", value: userAccountGuids },
  ];

  const accountVisibility = direction === "sent"
    ? "ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid)"
    : "ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid)";

  let whereClause = `WHERE c.direction = @dir AND c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`;

  if (search) {
    if (direction === "received") {
      whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search) OR CONTAINS(c.receivedToFaxNumber, @search) OR CONTAINS(c.receivedToAccountId, @search))";
    } else {
      whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search))";
    }
    queryParams.push({ name: "@search", value: search });
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
