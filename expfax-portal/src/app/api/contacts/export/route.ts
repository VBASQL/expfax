import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.contacts();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @uid AND NOT IS_DEFINED(c.type) ORDER BY c.name",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const header = "Name,FaxNumber,Company,Email,Notes";
  const rows = (resources as Array<{ name?: string; faxNumber?: string; company?: string; email?: string; notes?: string }>).map((c) =>
    `"${(c.name || "").replace(/"/g, '""')}","${c.faxNumber || ""}","${(c.company || "").replace(/"/g, '""')}","${c.email || ""}","${(c.notes || "").replace(/"/g, '""')}"`
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
    },
  });
}
