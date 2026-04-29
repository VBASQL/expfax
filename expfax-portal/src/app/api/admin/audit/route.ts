import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(params.get("pageSize") || "50", 10) || 50));
  const action = params.get("action");
  const userId = params.get("userId");

  let query = "SELECT * FROM c WHERE 1=1";
  const queryParams: Array<{ name: string; value: string | number }> = [];

  if (action) {
    query += " AND c.action = @action";
    queryParams.push({ name: "@action", value: action });
  }
  if (userId) {
    query += " AND c.userId = @userId";
    queryParams.push({ name: "@userId", value: userId });
  }

  query += " ORDER BY c.timestamp DESC OFFSET @offset LIMIT @limit";
  queryParams.push({ name: "@offset", value: (page - 1) * pageSize });
  queryParams.push({ name: "@limit", value: pageSize });

  const container = await containers.auditLog();
  const { resources } = await container.items.query({ query, parameters: queryParams }).fetchAll();

  // Count
  let countQuery = "SELECT VALUE COUNT(1) FROM c WHERE 1=1";
  const countParams: Array<{ name: string; value: string }> = [];
  if (action) { countQuery += " AND c.action = @action"; countParams.push({ name: "@action", value: action }); }
  if (userId) { countQuery += " AND c.userId = @userId"; countParams.push({ name: "@userId", value: userId }); }

  const { resources: countResult } = await container.items.query({ query: countQuery, parameters: countParams }).fetchAll();
  const total = countResult[0] || 0;

  return NextResponse.json({ items: resources, total, page, pageSize });
}
