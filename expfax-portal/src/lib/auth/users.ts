import { v4 as uuid } from "uuid";
import { containers } from "@/lib/db/cosmos";
import { completeInvitation } from "@/lib/auth/invitations";
import type { Invitation, User } from "@/types";

/**
 * Idempotently materialize a User doc from a completed signup.
 * If a User already exists with the same entraId, returns the existing one
 * (this can happen if the customer opens the signup link twice and the
 * second OAuth round-trip lands after the first already created the user).
 */
export async function createUserFromSignup(args: {
  invitation: Invitation;
  entraId: string;
  email: string;
  displayName: string;
  authType: User["authType"];
}): Promise<User> {
  const container = await containers.users();

  // Existing by entraId?
  const { resources: existing } = await container.items
    .query<User>({
      query: "SELECT * FROM c WHERE c.entraId = @entraId",
      parameters: [{ name: "@entraId", value: args.entraId }],
    })
    .fetchAll();

  if (existing.length > 0) {
    await completeInvitation(args.invitation.id);
    return existing[0];
  }

  const now = new Date().toISOString();
  const user: User = {
    id: uuid(),
    entraId: args.entraId,
    email: args.email.toLowerCase(),
    displayName: args.displayName || args.invitation.displayName,
    authType: args.authType,
    role: "user",
    isActive: true,
    signupCompletedAt: now,
    faxbackAccountGuid: args.invitation.initialFaxbackAccountGuid ?? null,
    faxbackAccountId: args.invitation.initialFaxbackAccountId ?? null,
    faxNumber: args.invitation.initialFaxNumber ?? null,
    linkedBy: null,
    purgeDays: args.invitation.initialPurgeDays ?? undefined,
    // MFA only for microsoft accounts; default off, admin can change later.
    ...(args.authType === "microsoft" ? { mfaMode: "off" as const, trustedLocations: [] } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await container.items.create(user);
  await completeInvitation(args.invitation.id);
  return user;
}
