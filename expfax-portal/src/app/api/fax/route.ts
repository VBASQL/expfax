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
  const offset = (page - 1) * pageSize;

  const container = await containers.faxMessages();

  // Build query
  let whereClause = "WHERE c.userId = @uid AND c.direction = @dir AND c.isDeleted = false";
  const queryParams: Array<{ name: string; value: string }> = [
    { name: "@uid", value: user.id },
    { name: "@dir", value: direction },
  ];

  if (search) {
    whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search))";
    queryParams.push({ name: "@search", value: search });
  }

  // Count
  const { resources: countResult } = await container.items
    .query({ query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`, parameters: queryParams })
    .fetchAll();

  // Items
  const { resources: items } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.isRead, c.documents FROM c ${whereClause} ORDER BY c.submitTime DESC OFFSET ${offset} LIMIT ${pageSize}`,
      parameters: queryParams,
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
