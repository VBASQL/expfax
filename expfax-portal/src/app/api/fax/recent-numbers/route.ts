import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export interface RecentNumber {
  faxNumber: string;
  name: string;
  direction: "sent" | "received";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();

  const userAccountGuids: string[] = [
    user.id,
    ...(user.linkedAccounts?.map((a: { accountGuid: string }) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid ? [user.faxbackAccountGuid] : []),
  ];

  // Recent sent — grab recipient numbers + names
  const { resources: sentFaxes } = await container.items
    .query({
      query: `SELECT TOP 50 c.recipients, c.submitTime
              FROM c
              WHERE c.direction = 'sent' AND c.isDeleted = false
              AND (c.userId = @uid OR ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid))
              ORDER BY c.submitTime DESC`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@accountGuids", value: userAccountGuids },
      ],
    })
    .fetchAll();

  // Recent received — grab sender number + name
  const { resources: receivedFaxes } = await container.items
    .query({
      query: `SELECT TOP 50 c.senderFaxNumber, c.senderName, c.submitTime
              FROM c
              WHERE c.direction = 'received' AND c.isDeleted = false
              AND (c.userId = @uid OR ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid))
              ORDER BY c.submitTime DESC`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@accountGuids", value: userAccountGuids },
      ],
    })
    .fetchAll();

  // Build deduplicated list — first occurrence (most recent) wins for name
  const seen = new Map<string, RecentNumber>();

  for (const fax of sentFaxes) {
    const recipients: Array<{ faxNumber?: string; name?: string }> = fax.recipients ?? [];
    for (const r of recipients) {
      const num = (r.faxNumber ?? "").trim();
      if (!num || seen.has(num)) continue;
      seen.set(num, { faxNumber: num, name: (r.name ?? "").trim(), direction: "sent" });
    }
  }

  for (const fax of receivedFaxes) {
    const num = (fax.senderFaxNumber ?? "").trim();
    if (!num || seen.has(num)) continue;
    seen.set(num, { faxNumber: num, name: (fax.senderName ?? "").trim(), direction: "received" });
  }

  return NextResponse.json({ numbers: Array.from(seen.values()).slice(0, 50) });
}
