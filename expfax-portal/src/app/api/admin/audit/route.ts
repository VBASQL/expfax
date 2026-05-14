import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import type { User } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const isExport = params.get("export") === "true";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = isExport
    ? 10000
    : Math.min(200, Math.max(1, parseInt(params.get("pageSize") || "50", 10) || 50));

  // Support multi-select: ?actions=fax.send,fax.delete  or legacy single: ?action=fax.send
  const actionsRaw = params.get("actions") || params.get("action") || "";
  const actions = actionsRaw ? actionsRaw.split(",").map(a => a.trim()).filter(Boolean) : [];
  const userId = params.get("userId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  const queryParams: Array<{ name: string; value: string | number }> = [];
  let where = "WHERE 1=1";

  if (actions.length === 1) {
    where += " AND c.action = @action0";
    queryParams.push({ name: "@action0", value: actions[0] });
  } else if (actions.length > 1) {
    const placeholders = actions.map((_, i) => `@action${i}`).join(", ");
    where += ` AND c.action IN (${placeholders})`;
    actions.forEach((a, i) => queryParams.push({ name: `@action${i}`, value: a }));
  }
  if (userId) {
    where += " AND c.userId = @userId";
    queryParams.push({ name: "@userId", value: userId });
  }
  if (dateFrom) {
    where += " AND c.timestamp >= @dateFrom";
    queryParams.push({ name: "@dateFrom", value: dateFrom });
  }
  if (dateTo) {
    where += " AND c.timestamp <= @dateTo";
    queryParams.push({ name: "@dateTo", value: dateTo });
  }

  let query = `SELECT * FROM c ${where} ORDER BY c.timestamp DESC`;
  if (!isExport) {
    query += " OFFSET @offset LIMIT @limit";
    queryParams.push({ name: "@offset", value: (page - 1) * pageSize });
    queryParams.push({ name: "@limit", value: pageSize });
  }

  const container = await containers.auditLog();
  const { resources } = await container.items.query({ query, parameters: queryParams }).fetchAll();

  // Count (omit for export — use result length)
  let total = resources.length;
  if (!isExport) {
    const countParams = queryParams.filter(p => p.name !== "@offset" && p.name !== "@limit");
    const { resources: countResult } = await container.items
      .query({ query: `SELECT VALUE COUNT(1) FROM c ${where}`, parameters: countParams })
      .fetchAll();
    total = countResult[0] ?? 0;
  }

  // Batch-fetch display names for unique userIds in this page
  const uniqueUserIds = [...new Set(
    (resources as Array<{ userId?: string }>).map(r => r.userId).filter((id): id is string => !!id)
  )];
  const usersContainer = await containers.users();
  const userMap: Record<string, string> = {};
  await Promise.all(
    uniqueUserIds.map(async (uid) => {
      try {
        const { resource } = await usersContainer.item(uid, uid).read<User>();
        if (resource?.displayName) userMap[uid] = resource.displayName;
      } catch { /* user may have been deleted */ }
    })
  );

  return NextResponse.json({ items: resources, total, page, pageSize, users: userMap });
}
