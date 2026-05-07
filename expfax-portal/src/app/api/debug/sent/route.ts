import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

/** Dumps every Sent-direction Cosmos record visible to this user, with the fields that govern visibility/status. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userAccountGuids: string[] = Array.from(
    new Set(
      [
        ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
        user.faxbackAccountGuid,
      ].filter((g): g is string => typeof g === "string" && g.length > 0)
    )
  );

  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query({
      query: `
        SELECT c.id, c.messageHandle, c.userId, c.direction, c.status, c.statusNum,
               c.subject, c.senderName, c.recipients, c.submitTime, c.updatedAt,
               c.sentFromAccountGuid, c.sentFromAccountId, c.faxImagePath
        FROM c
        WHERE c.direction = "sent"
          AND c.isDeleted = false
          AND (c.userId = @uid OR ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid))
        ORDER BY c.submitTime DESC
      `,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@accountGuids", value: userAccountGuids },
      ],
    })
    .fetchAll();

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    userAccountGuids,
    count: resources.length,
    items: resources,
  });
}
