import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const directionParam = params.get("direction") || "";
  const includeAll = directionParam === "" || directionParam === "all";
  const search = params.get("search") || "";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";

  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a: { accountGuid: string }) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid && !user.faxbackAccounts?.some((a: { accountGuid: string }) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ];

  const queryParams: Array<{ name: string; value: unknown }> = [
    { name: "@uid", value: user.id },
    { name: "@accountGuids", value: userAccountGuids },
  ];
  if (!includeAll) queryParams.push({ name: "@dir", value: directionParam });

  const accountVisibility = includeAll
    ? "(ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid) OR ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid))"
    : directionParam === "sent"
      ? "ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid)"
      : "ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid)";

  let whereClause = includeAll
    ? `WHERE c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`
    : `WHERE c.direction = @dir AND c.isDeleted = false AND (c.userId = @uid OR ${accountVisibility})`;

  if (search) {
    whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search))";
    queryParams.push({ name: "@search", value: search });
  }
  if (dateFrom) {
    whereClause += " AND c.submitTime >= @dateFrom";
    queryParams.push({ name: "@dateFrom", value: dateFrom });
  }
  if (dateTo) {
    whereClause += " AND c.submitTime <= @dateTo";
    queryParams.push({ name: "@dateTo", value: dateTo + "T23:59:59.999Z" });
  }

  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.documents FROM c ${whereClause} ORDER BY c.submitTime DESC`,
      parameters: queryParams as Array<{ name: string; value: string }>,
    })
    .fetchAll();

  const csvRows: string[] = ["Direction,Status,From/To,Subject,Date,Pages"];
  for (const fax of resources) {
    const contact = fax.direction === "received"
      ? (fax.senderName || fax.senderFaxNumber || "")
      : (fax.recipients?.[0]?.name || fax.recipients?.[0]?.faxNumber || "");
    const pages = fax.documents?.reduce((s: number, d: { pageCount?: number }) => s + (d.pageCount || 0), 0) || 0;
    const date = fax.submitTime ? new Date(fax.submitTime).toISOString() : "";
    const subject = `"${(fax.subject || "").replace(/"/g, '""')}"`;
    const contactEsc = `"${contact.replace(/"/g, '""')}"`;
    csvRows.push(`${fax.direction || ""},${fax.status || ""},${contactEsc},${subject},${date},${pages}`);
  }

  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="fax-history.csv"`,
    },
  });
}

