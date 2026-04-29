import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const container = await containers.faxMessages();
  const searchLower = q.toLowerCase();

  const { resources } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime
              FROM c
              WHERE c.userId = @uid AND c.isDeleted = false
              AND (
                CONTAINS(LOWER(c.senderName), @q)
                OR CONTAINS(c.senderFaxNumber, @q)
                OR CONTAINS(LOWER(c.subject), @q)
              )
              ORDER BY c.submitTime DESC
              OFFSET 0 LIMIT 20`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@q", value: searchLower },
      ],
    })
    .fetchAll();

  return NextResponse.json({ results: resources });
}
