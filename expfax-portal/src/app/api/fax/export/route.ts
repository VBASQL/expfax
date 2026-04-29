import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @uid AND c.isDeleted = false ORDER BY c.submitTime DESC",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const rows: string[] = ["Direction,Status,From/To,Subject,Date,Pages"];
  for (const fax of resources) {
    const contact = fax.direction === "inbound"
      ? (fax.callerName || fax.callerNumber || "")
      : (fax.recipients?.[0]?.name || fax.recipients?.[0]?.faxNumber || "");
    const pages = fax.documents?.reduce((s: number, d: { pageCount?: number }) => s + (d.pageCount || 0), 0) || 0;
    const date = fax.submitTime ? new Date(fax.submitTime).toISOString() : "";
    const subject = (fax.subject || "").replace(/,/g, " ").replace(/"/g, "'");

    rows.push(`${fax.direction || ""},${fax.status || ""},${contact},${subject},${date},${pages}`);
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=\"fax-history.csv\"",
    },
  });
}
