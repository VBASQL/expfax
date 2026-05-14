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
  entraTenantId?: string | null;
  email: string;
  displayName: string;
  authType: User["authType"];
}): Promise<User> {
  const container = await containers.users();

  // Existing by (entraId, entraTenantId)? For federated /common SSO, oid is
  // unique only within a tenant — so we must scope the lookup. Fall back to
  // legacy oid-only match for rows that pre-date the tid column.
  const tidScoped = args.entraTenantId
    ? "SELECT * FROM c WHERE c.entraId = @entraId AND (c.entraTenantId = @tid OR NOT IS_DEFINED(c.entraTenantId) OR c.entraTenantId = null)"
    : "SELECT * FROM c WHERE c.entraId = @entraId";
  const params: { name: string; value: string }[] = [
    { name: "@entraId", value: args.entraId },
  ];
  if (args.entraTenantId) params.push({ name: "@tid", value: args.entraTenantId });

  const { resources: existing } = await container.items
    .query<User>({ query: tidScoped, parameters: params })
    .fetchAll();

  // Prefer exact tenant match if multiple candidates returned.
  const match = args.entraTenantId
    ? existing.find((u) => u.entraTenantId === args.entraTenantId) ?? existing[0]
    : existing[0];

  if (match) {
    await completeInvitation(args.invitation.id);
    return match;
  }

  const now = new Date().toISOString();
  const user: User = {
    id: uuid(),
    entraId: args.entraId,
    entraTenantId: args.entraTenantId ?? null,
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
