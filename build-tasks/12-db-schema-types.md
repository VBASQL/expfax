# Task 12 — TypeScript Types for All Cosmos Documents

## Goal
Define TypeScript interfaces for every document type stored in Cosmos DB.

## Files to Create
- `src/types/index.ts` (replace the placeholder from task 00)

## Context
These types match the schema in section 8.2 of `expfax-portal-design.md`. Cosmos DB is schemaless but we enforce types in TypeScript.

## Implementation

### Create `src/types/index.ts`

```typescript
// ============================================================
// ExpFax Portal — Document Types for Cosmos DB
// ============================================================

// --- Users ---
export interface User {
  id: string;                    // PK + partition key
  entraId: string;               // Entra ID object ID
  email: string;
  displayName: string;
  faxbackAccountGuid: string;
  faxbackAccountId: string;      // Friendly name
  role: "user" | "manager" | "admin";
  linkedBy: string | null;       // User ID who linked this account
  isActive: boolean;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

// --- Sessions ---
export interface Session {
  id: string;                    // Session token (PK)
  userId: string;                // Partition key
  expiresAt: string;
  createdAt: string;
  ipAddress: string;
  userAgent: string;
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
  faxImagePath: string;          // Path to stored PDF
  recipients: FaxRecipient[];    // Embedded array
  documents: FaxDocument[];      // Embedded array
  createdAt: string;
  updatedAt: string;
}

// --- Cover Templates ---
export interface CoverTemplate {
  id: string;
  userId: string | null;         // null = domain-level template
  templateName: string;
  templateGuid: string;          // From FaxBack
  isDefault: boolean;
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
  | "admin_action";

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
```

## Verify
- `npm run build` — no type errors
- All interfaces match the schema from the design doc section 8

## Notes for Future Tasks
- Import as: `import { User, FaxMessage, Contact } from "@/types"`
- Cosmos documents may have additional system fields (`_rid`, `_ts`, etc.) — these are ignored by our types
- FaxRecipient and FaxDocument are embedded inside FaxMessage (not separate containers)
