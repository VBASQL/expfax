// ============================================================
// ExpFax Portal — Document Types for Cosmos DB
// ============================================================

// --- Users ---
export type AuthType = "microsoft" | "password";
export type MfaMode = "off" | "always" | "new_location";

export interface TrustedLocation {
  id: string;
  ipHash: string;                // sha256 of client IP
  uaHash: string;                // sha256 of User-Agent
  label: string;                 // Human-friendly summary
  createdAt: string;
  lastSeenAt: string;
}

export interface FaxBackAccountLink {
  accountGuid: string;
  accountId: string;
  faxNumber: string | null;
  label: string | null;          // Optional display name / label set by admin
  addedAt: string;               // ISO — when admin added this account
  addedBy: string;               // admin userId
}

export interface User {
  id: string;                    // PK + partition key
  entraId: string;               // Entra ID object ID (oid claim)
  email: string;
  displayName: string;
  authType: AuthType;            // How user authenticates
  faxbackAccountGuid: string | null;          // Primary / default account (legacy)
  faxbackAccountId: string | null;            // Primary / default account friendly name (legacy)
  faxbackAccounts?: FaxBackAccountLink[];     // All linked accounts (multi-account)
  defaultFaxbackAccountGuid?: string | null;  // Which account the user prefers by default
  role: "user" | "manager" | "admin";
  isWorkforceAdmin?: boolean;       // True for ARM-privileged workforce accounts; excluded from user list
  linkedBy: string | null;       // Admin user id who linked FaxBack account
  isActive: boolean;
  signupCompletedAt: string | null; // Set when invitation flow completes
  faxNumber?: string | null;
  // MFA only meaningful for authType === "microsoft". Omitted otherwise.
  mfaMode?: MfaMode;
  trustedLocations?: TrustedLocation[];
  purgeDays?: number;            // null/undefined = use tenant default
  preferences?: {
    notifyOnReceive: boolean;
    notifyOnSendComplete: boolean;
    defaultCoverTemplate: string | null;
    itemsPerPage: number;
    timezone: string;
  };
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

// --- Invitations ---
export type InvitationStatus = "pending" | "completed" | "revoked" | "expired";

export interface Invitation {
  id: string;                    // PK + partition key (random)
  email: string;                 // lowercased, unique within active invitations
  displayName: string;
  tokenHash: string;             // sha256(rawToken). Raw token only shown once.
  expiresAt: string;             // ISO
  status: InvitationStatus;
  createdBy: string;             // admin user id
  createdAt: string;
  completedAt: string | null;
  // Optional pre-fill admin can set; applied when user completes signup.
  initialFaxbackAccountId?: string | null;
  initialFaxbackAccountGuid?: string | null;
  initialFaxNumber?: string | null;
  initialPurgeDays?: number | null;
}

// --- Sessions ---
export interface Session {
  id: string;                    // Session token (PK)
  userId: string;                // Partition key
  expiresAt: string;
  createdAt: string;
  ipAddress: string;
  userAgent: string;
  isAdmin: boolean;              // Set at login from ARM role check — not DB state
}

// --- Contacts ---
export interface Contact {
  id: string;
  userId: string;                // Partition key
  name: string;
  faxNumber: string;
  company: string;
  email: string;
  notes: string;
  isFavorite: boolean;
  groups: string[];              // Array of group IDs
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroup {
  id: string;
  userId: string;                // Partition key
  name: string;
  type: "contactGroup";         // Discriminator for same container
  createdAt: string;
}

// --- Fax Messages ---
export type FaxDirection = "sent" | "received";
export type FaxStatus = "queued" | "sending" | "sent" | "failed" | "received";

export interface FaxRecipient {
  recipientGuid: string;
  name: string;
  faxNumber: string;
  originalAddress: string;
  prefix: 0 | 1 | 2;            // 0=To, 1=Cc, 2=Bcc
  status: string;
  error: string;
  errorNumber: number;
  startTime: string;
  dialSeconds: number;
  connectSeconds: number;
  totalSeconds: number;
  pageCount: number;
  pagesTransferred: number;
  connectBps: number;
  retries: number;
  localCsid: string;
  remoteCsid: string;
}

export interface FaxDocument {
  documentGuid: string;
  documentPart: 0 | 1;          // 0=cover, 1=document
  name: string;
  documentType: number;
  pageCount: number;
}

export interface FaxMessage {
  id: string;
  userId: string;                // Partition key
  messageHandle: string;         // From FaxBack
  direction: FaxDirection;
  status: FaxStatus;
  statusNum: number;
  queue: number;
  subject: string;
  senderName: string;
  senderCompany: string;
  senderFaxNumber: string;
  coverTemplate: string;
  appInfo: string;
  billingCode: string;
  resolution: number;
  submitTime: string;
  scheduleTime: string | null;
  isRead: boolean;
  isDeleted: boolean;            // Soft delete
  faxImagePath: string;          // Path to stored rendered-fax PDF (populated by poller)
  sentDocumentPaths: string[];   // Paths to original sent documents in Blob Storage
  sentFromAccountGuid?: string | null;  // FaxBack accountGuid used to send this fax
  sentFromAccountId?: string | null;    // Human-readable account id used to send this fax
  receivedToAccountGuid?: string | null; // FaxBack accountGuid that received this fax (for shared-account visibility)
  receivedToAccountId?: string | null;  // Human-readable account id (DID label) that received this fax
  receivedToFaxNumber?: string | null;  // Local DID fax number that received this fax
  tags: string[];                // User-defined labels (editable from the list view)
  recipients: FaxRecipient[];    // Embedded array
  documents: FaxDocument[];      // Embedded array
  createdAt: string;
  updatedAt: string;
}

// --- Fax Drafts ---
export interface FaxDraftAttachment {
  name: string;
  size: number;             // bytes (original file size)
  blobPath: string;        // path in Blob Storage: drafts/{userId}/{draftId}/{filename}
}

export interface FaxDraft {
  id: string;
  userId: string;
  title?: string;           // Optional label set by user
  recipients: Array<{ faxNumber: string; name: string }>;
  subject: string;
  useCover: boolean;
  coverMode: "saved" | "onetime";
  coverTemplate?: string;
  coverMessage?: string;
  templateFields?: {
    senderName: string;
    senderCompany: string;
    senderFax: string;
    senderVoice: string;
    receiverName: string;
    receiverCompany: string;
  };
  oneTimeCover?: {
    senderName: string;
    senderCompany: string;
    senderFax: string;
    senderVoice: string;
    receiverName: string;
    receiverCompany: string;
    message: string;
  };
  attachments: FaxDraftAttachment[];
  resolution: number;
  scheduleTime?: string;
  billingCode?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Cover Templates ---
export interface CoverTemplate {
  id: string;
  userId: string | null;         // null = domain-level template
  templateName: string;
  templateGuid: string;          // From FaxBack (equals templateName)
  isDefault: boolean;
  /** Message body text displayed in the cover page body section. */
  bodyText: string;
  /** Optional company letterhead/logo image stored as base64 (max 512 KB decoded). */
  headerImageBase64?: string;
  /** MIME sub-type of the header image. */
  headerImageType?: "png" | "jpeg";
  createdAt: string;
  updatedAt: string;
}

// --- Audit Log ---
export type AuditAction =
  | "login"
  | "login_failed"
  | "logout"
  | "send_fax"
  | "view_fax"
  | "download_fax"
  | "delete_fax"
  | "create_contact"
  | "update_contact"
  | "delete_contact"
  | "upload_template"
  | "delete_template"
  | "link_user"
  | "unlink_user"
  | "update_settings"
  | "admin_action"
  | "invitation_create"
  | "invitation_revoke"
  | "invitation_resend"
  | "invitation_complete"
  | "mfa_mode_change"
  | "trusted_location_revoke";

export interface AuditLogEntry {
  id: string;
  userId: string;                // Partition key
  action: AuditAction;
  resourceType: "fax" | "contact" | "template" | "user" | "system";
  resourceId: string;
  details: Record<string, unknown>; // JSON details
  ipAddress: string;
  createdAt: string;
}

// --- API Response Types ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  continuationToken?: string;
}
