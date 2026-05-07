import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

/**
 * Removes "ghost" sent rows: rows whose messageHandle has a duplicate counterpart
 * (different case) with a real status. Caused by case-sensitivity bug fixed elsewhere.
 *
 * POST = perform deletes, GET = preview only.
 */
async function findDuplicates(userId: string) {
  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query({
      query: `SELECT c.id, c.messageHandle, c.status, c.faxImagePath, c._ts
              FROM c WHERE c.userId = @uid AND c.direction = "sent" AND c.isDeleted = false`,
      parameters: [{ name: "@uid", value: userId }],
    })
    .fetchAll();

  const byKey = new Map<string, typeof resources>();
  for (const r of resources) {
    const key = String(r.messageHandle || "").toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  const ghosts: typeof resources = [];
  const keep: typeof resources = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    // Prefer the row with a populated faxImagePath OR a final status (sent/failed).
    const sorted = [...group].sort((a, b) => {
      const aFinal = a.status === "sent" || a.status === "failed" ? 1 : 0;
      const bFinal = b.status === "sent" || b.status === "failed" ? 1 : 0;
      if (aFinal !== bFinal) return bFinal - aFinal;
      const aImg = a.faxImagePath ? 1 : 0;
      const bImg = b.faxImagePath ? 1 : 0;
      if (aImg !== bImg) return bImg - aImg;
      return (b._ts ?? 0) - (a._ts ?? 0);
    });
    keep.push(sorted[0]);
    ghosts.push(...sorted.slice(1));
  }
  return { ghosts, keep };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ghosts, keep } = await findDuplicates(user.id);
  return NextResponse.json({ preview: true, ghostCount: ghosts.length, ghosts, keep });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ghosts } = await findDuplicates(user.id);
  const container = await containers.faxMessages();
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const g of ghosts) {
    try {
      await container.item(g.id, user.id).delete();
      results.push({ id: g.id, ok: true });
    } catch (e) {
      results.push({ id: g.id, ok: false, error: String(e) });
    }
  }
  return NextResponse.json({ deleted: results.filter((r) => r.ok).length, results });
}
