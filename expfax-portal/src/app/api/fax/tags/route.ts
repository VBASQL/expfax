import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

/**
 * GET /api/fax/tags
 * Returns all distinct tags the current user has applied to any fax,
 * including faxes on shared linked accounts.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid && !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ];

  const container = await containers.faxMessages();

  // Cosmos JOIN flattens the tags array so DISTINCT VALUE gives us one row per unique tag
  const { resources } = await container.items
    .query({
      query: `SELECT DISTINCT VALUE t FROM c JOIN t IN c.tags
              WHERE c.isDeleted = false
              AND IS_STRING(t) AND LENGTH(t) > 0
              AND (c.userId = @uid
                   OR ARRAY_CONTAINS(@accountGuids, c.receivedToAccountGuid)
                   OR ARRAY_CONTAINS(@accountGuids, c.sentFromAccountGuid))`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@accountGuids", value: userAccountGuids },
      ],
    })
    .fetchAll();

  // resources is string[] of distinct tag values
  const tags = (resources as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ tags });
}
