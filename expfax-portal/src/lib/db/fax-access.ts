/**
 * Shared helper: look up a fax by id and verify the requesting user can access it.
 *
 * Access is granted when:
 *   - the user owns the fax (c.userId === user.id), OR
 *   - for received faxes: c.receivedToAccountGuid is in the user's linked accounts, OR
 *   - for sent faxes: c.sentFromAccountGuid is in the user's linked accounts
 *
 * Returns the full fax document (using the correct partition key = fax.userId),
 * or null if not found / access denied.
 */

import type { FaxMessage } from "@/types";
import { containers } from "@/lib/db/cosmos";

export interface FaxAccessResult {
  fax: FaxMessage;
  /** The partition key to use for item-level Cosmos operations on this fax */
  partitionKey: string;
}

export async function getFaxWithAccess(
  faxId: string,
  user: { id: string; faxbackAccountGuid?: string | null; faxbackAccounts?: Array<{ accountGuid: string }> }
): Promise<FaxAccessResult | null> {
  const container = await containers.faxMessages();

  // Cross-partition query to find the fax
  const { resources } = await container.items
    .query<FaxMessage>({
      query: "SELECT * FROM c WHERE c.id = @id AND c.isDeleted = false",
      parameters: [{ name: "@id", value: faxId }],
    })
    .fetchAll();

  if (resources.length === 0) return null;

  const fax = resources[0];

  // Build set of account GUIDs the user has access to
  const userAccountGuids = new Set<string>([
    ...(fax.userId === user.id ? [] : []), // owner check below
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid ? [user.faxbackAccountGuid] : []),
  ]);

  const isOwner = fax.userId === user.id;
  const hasAccountAccess =
    (fax.direction === "received" && fax.receivedToAccountGuid != null && userAccountGuids.has(fax.receivedToAccountGuid)) ||
    (fax.direction === "sent" && fax.sentFromAccountGuid != null && userAccountGuids.has(fax.sentFromAccountGuid));

  if (!isOwner && !hasAccountAccess) return null;

  return { fax, partitionKey: fax.userId };
}
