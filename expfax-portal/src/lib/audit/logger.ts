import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "fax.send"
  | "fax.received"
  | "fax.delete"
  | "fax.abort"
  | "admin.user_link"
  | "admin.role_change"
  | "admin.email_config"
  | "admin.retention_update"
  | "admin.invitation_create"
  | "admin.invitation_revoke"
  | "admin.invitation_resend"
  | "admin.mfa_mode_change"
  | "admin.trusted_location_revoke"
  | "signup.complete"
  | "contact.create"
  | "contact.update"
  | "contact.delete"
  | "template.upload"
  | "template.delete";

interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

/**
 * Write an audit log entry.
 * Call this from API routes after significant actions.
 *
 * @example
 * await audit({
 *   userId: user.id,
 *   action: "fax.send",
 *   resourceType: "fax",
 *   resourceId: fax.id,
 *   detail: { recipients: ["5551234567"], pages: 3 },
 *   request,
 * });
 */
export async function audit(params: {
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  detail?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  try {
    const container = await containers.auditLog();

    const entry: AuditEntry = {
      id: uuid(),
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      detail: params.detail || {},
      ipAddress: params.request?.headers.get("x-forwarded-for") || params.request?.headers.get("x-real-ip") || "unknown",
      userAgent: params.request?.headers.get("user-agent") || "unknown",
      timestamp: new Date().toISOString(),
    };

    await container.items.create(entry);
  } catch (error) {
    // Never let audit failures break the main flow
    console.error("Audit log write failed:", error);
  }
}
