import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { v4 as uuid } from "uuid";
import { containers } from "@/lib/db/cosmos";
import type { Invitation, InvitationStatus } from "@/types";

/** Default lifetime for an invitation token (7 days). */
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeHexLowerCase(bytes);
}

export function hashToken(rawToken: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(rawToken)));
}

export interface CreateInvitationInput {
  email: string;
  displayName: string;
  createdBy: string;
  expiresInMs?: number;
  initialFaxbackAccountId?: string | null;
  initialFaxbackAccountGuid?: string | null;
  initialFaxNumber?: string | null;
  initialPurgeDays?: number | null;
}

export interface CreatedInvitation {
  invitation: Invitation;
  /** Raw, one-shot token. Show to admin once; never persisted. */
  rawToken: string;
}

/**
 * Create a new invitation. If an active (pending, non-expired) invitation already
 * exists for this email, it is revoked and replaced.
 */
export async function createInvitation(input: CreateInvitationInput): Promise<CreatedInvitation> {
  const container = await containers.invitations();
  const email = input.email.trim().toLowerCase();

  // Revoke any existing active invitations for this email
  const { resources: existing } = await container.items
    .query<Invitation>({
      query: "SELECT * FROM c WHERE LOWER(c.email) = @email AND c.status = 'pending'",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();

  for (const inv of existing) {
    await container.item(inv.id, inv.id).replace({ ...inv, status: "revoked" satisfies InvitationStatus });
  }

  const rawToken = generateRawToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? DEFAULT_EXPIRY_MS));

  const invitation: Invitation = {
    id: uuid(),
    email,
    displayName: input.displayName.trim(),
    tokenHash: hashToken(rawToken),
    expiresAt: expiresAt.toISOString(),
    status: "pending",
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    completedAt: null,
    initialFaxbackAccountId: input.initialFaxbackAccountId ?? null,
    initialFaxbackAccountGuid: input.initialFaxbackAccountGuid ?? null,
    initialFaxNumber: input.initialFaxNumber ?? null,
    initialPurgeDays: input.initialPurgeDays ?? null,
  };

  await container.items.create(invitation);
  return { invitation, rawToken };
}

export async function listInvitations(): Promise<Invitation[]> {
  const container = await containers.invitations();
  const { resources } = await container.items
    .query<Invitation>("SELECT * FROM c ORDER BY c.createdAt DESC")
    .fetchAll();

  // Lazy-mark expired invitations
  const now = Date.now();
  return resources.map((inv) => {
    if (inv.status === "pending" && new Date(inv.expiresAt).getTime() < now) {
      return { ...inv, status: "expired" satisfies InvitationStatus };
    }
    return inv;
  });
}

export async function getInvitation(id: string): Promise<Invitation | null> {
  const container = await containers.invitations();
  try {
    const { resource } = await container.item(id, id).read<Invitation>();
    return resource ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up an invitation by raw token. Returns null if not found, expired, or non-pending.
 */
export async function findActiveInvitationByToken(rawToken: string): Promise<Invitation | null> {
  if (!rawToken || rawToken.length < 32) return null;
  const tokenHash = hashToken(rawToken);

  const container = await containers.invitations();
  const { resources } = await container.items
    .query<Invitation>({
      query: "SELECT * FROM c WHERE c.tokenHash = @hash",
      parameters: [{ name: "@hash", value: tokenHash }],
    })
    .fetchAll();

  const inv = resources[0];
  if (!inv) return null;
  if (inv.status !== "pending") return null;
  if (new Date(inv.expiresAt).getTime() < Date.now()) return null;
  return inv;
}

export async function revokeInvitation(id: string): Promise<Invitation | null> {
  const container = await containers.invitations();
  const inv = await getInvitation(id);
  if (!inv) return null;
  if (inv.status !== "pending") return inv;
  const updated: Invitation = { ...inv, status: "revoked" };
  await container.item(id, id).replace(updated);
  return updated;
}

/**
 * Permanently delete an invitation record. Intended for revoked/expired invitations.
 * Returns false if not found.
 */
export async function hardDeleteInvitation(id: string): Promise<boolean> {
  const container = await containers.invitations();
  const inv = await getInvitation(id);
  if (!inv) return false;
  await container.item(id, id).delete();
  return true;
}

/**
 * Mark invitation completed. Called after successful signup creates the User doc.
 */
export async function completeInvitation(id: string): Promise<void> {
  const container = await containers.invitations();
  const inv = await getInvitation(id);
  if (!inv) return;
  await container.item(id, id).replace({
    ...inv,
    status: "completed" satisfies InvitationStatus,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Resend = generate a new raw token (rotate) and extend expiry.
 * The old link stops working immediately.
 */
export async function resendInvitation(id: string, expiresInMs?: number): Promise<CreatedInvitation | null> {
  const container = await containers.invitations();
  const inv = await getInvitation(id);
  if (!inv) return null;
  if (inv.status !== "pending" && inv.status !== "expired") return null;

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + (expiresInMs ?? DEFAULT_EXPIRY_MS));
  const updated: Invitation = {
    ...inv,
    tokenHash: hashToken(rawToken),
    expiresAt: expiresAt.toISOString(),
    status: "pending",
  };
  await container.item(id, id).replace(updated);
  return { invitation: updated, rawToken };
}
