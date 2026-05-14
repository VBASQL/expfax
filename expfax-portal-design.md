# ExpFax Portal — Technical Design Document

**Version:** 1.0 Draft  
**Date:** April 21, 2026  
**Status:** Design Phase

---

## 1. Executive Summary

ExpFax Portal is a modern, HIPAA-compliant web portal for sending, receiving, and managing faxes. It provides end users with a clean web interface to replace the current email-based fax workflow, while leveraging the existing FaxBack NET SatisFAXtion (NSX) server running on the company's VPS as the fax engine.

The portal acts as a standalone application sitting alongside the NSX server. It communicates with the FaxBack API over localhost and handles all user-facing authentication, authorization, and UI independently. Users never interact with the FaxBack system directly.

---

## 2. Architecture Overview

### 2.1 High-Level Flow

```
┌──────────────┐         ┌──────────────────────────────┐
│              │  HTTPS   │         Windows VPS           │
│   End User   │◄────────►│                              │
│   Browser    │         │  ┌────────────────────────┐   │
│              │         │  │   ExpFax Portal        │   │
└──────────────┘         │  │   (Next.js on port 443)│   │
                         │  └──────────┬─────────────┘   │
┌──────────────┐         │             │ localhost:81     │
│   Entra ID   │◄────────┤  ┌──────────▼─────────────┐   │
│   (Azure AD) │  OAuth  │  │   FaxBack NSX Server   │   │
└──────────────┘         │  │   (API on port 81)     │   │
                         │  └────────────────────────┘   │
┌──────────────┐         │                              │
│  Database    │◄────────┤  SQL Server or Cosmos DB     │
│              │         │                              │
└──────────────┘         └──────────────────────────────┘
```

### 2.2 Core Principle

The portal maintains a single supervisor-level FaxBack session. All user operations go through this session. The portal maps authenticated portal users to their FaxBack AccountId and executes API calls on their behalf. Users are never exposed to FaxBack credentials, LoginIds, or API endpoints.

---

## 3. Deployment Options

### Option A — Self-Contained Windows VPS

Everything runs on the same Windows VPS that hosts the FaxBack NSX server.

| Component | Details |
|-----------|---------|
| Portal Runtime | Node.js + Next.js running as a Windows service (via `node-windows` or PM2) |
| Database | SQL Server (Express or Standard) installed locally |
| Reverse Proxy | IIS as reverse proxy to Next.js, handles TLS termination |
| FaxBack API | `http://localhost:81/mqs/...` |

**Pros:** Simple, everything in one place, no network latency, no external dependencies.  
**Cons:** All load on one server, scaling means scaling the whole VPS.

### Option B — Azure PaaS Hybrid

Portal runs on Azure App Service with Cosmos DB, connects back to the VPS for FaxBack API calls.

| Component | Details |
|-----------|---------|
| Portal Runtime | Azure App Service (Node.js) |
| Database | Azure Cosmos DB (NoSQL API) |
| FaxBack API | `https://faxback.expfax.com:81/mqs/...` (exposed via secure endpoint) |
| Auth | Entra ID natively integrated with App Service |

**Pros:** Auto-scaling, managed infrastructure, native Entra ID integration, Cosmos DB global distribution if needed.  
**Cons:** FaxBack API calls go over the network instead of localhost, need to secure the FaxBack API endpoint for external access, potential latency, higher monthly cost.

### Recommendation

**Start with Option A** for speed to launch. Everything stays on the VPS, no network complexity, and the FaxBack API stays on localhost with no exposure. Migrate to Option B later if scaling demands it.

---

## 4. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router, SSR) | Server-side rendering, API routes built in, single deployable project |
| Language | TypeScript | Type safety across frontend and backend |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, consistent design system, accessible components |
| Auth | Custom session management + MSAL.js / `arctic` for Entra ID | Custom login page, Microsoft as optional sign-in method |
| Database | SQL Server (Option A) / Cosmos DB (Option B) | See Deployment Options above |
| ORM | Drizzle ORM (SQL Server) / Cosmos SDK (Option B) | Lightweight, type-safe |
| Session Store | Database-backed sessions | Survives server restarts, auditable |
| File Handling | Sharp (image processing), pdf-lib (PDF generation) | Cover page rendering, fax image conversion |
| Real-Time | Server-Sent Events (SSE) | Lightweight push for fax status updates, no WebSocket complexity |
| Process Manager | PM2 or node-windows | Keeps the portal running as a service on Windows |

---

## 5. Authentication & Authorization

### 5.1 Login Flow

The portal has its own custom login page. No Microsoft-branded pages unless the user explicitly clicks "Sign in with Microsoft."

**Method 1 — Username/Password (Primary)**

1. User enters credentials on the portal login page
2. Portal server validates against Entra ID via ROPC flow (Resource Owner Password Credentials)
3. On success, server creates a session record in the database
4. Server issues a secure, HTTP-only session cookie
5. Server looks up the user's linked FaxBack AccountId from the database
6. User is redirected to the dashboard

**Method 2 — Sign in with Microsoft (Optional)**

1. User clicks "Sign in with Microsoft" on the login page
2. MSAL popup or redirect to Microsoft login
3. User authenticates with Microsoft (MFA if configured in Entra ID)
4. Redirect back to portal with auth code
5. Server exchanges code for tokens, creates session, same flow from step 3 above

### 5.2 Session Management

| Setting | Value |
|---------|-------|
| Session duration | 8 hours (configurable) |
| Idle timeout | 30 minutes |
| Storage | Database (sessions table) |
| Cookie | `HttpOnly`, `Secure`, `SameSite=Strict` |
| MFA | Enforced via Entra ID conditional access policies |

### 5.3 User Roles

| Role | Permissions |
|------|------------|
| User | Send fax, view own received faxes, manage own contacts, manage own cover templates |
| Manager | Everything User can do + view fax activity for their group |
| Admin | Full access, user-account linking, system configuration |

### 5.4 Account Linking

Office staff use a simple admin page to link a portal user (Entra ID identity) to a FaxBack AccountId. This creates a record in the `user_accounts` table:

| Field | Description |
|-------|-------------|
| portal_user_id | Entra ID object ID |
| faxback_account_guid | FaxBack AccountGuid |
| faxback_account_id | FaxBack AccountId (friendly name) |
| role | user / manager / admin |
| linked_by | Admin who created the link |
| linked_at | Timestamp |

---

## 6. FaxBack API Integration

### 6.1 Supervisor Session Manager

A background service maintains a single supervisor-level FaxBack session.

**Behavior:**

- On portal startup, calls `Login` with supervisor credentials to obtain a LoginId
- Runs a `RefreshId` call every 3 minutes to keep the session alive
- If any API call returns 401, immediately re-authenticates and retries the failed call
- Supervisor credentials are stored in environment variables, never in code or database
- All user-facing API calls go through this single session

**Pseudocode:**

```
class FaxBackSession {
  private loginId: string
  private credentials: { username, password }
  private refreshTimer: Timer

  async initialize() {
    this.loginId = await this.login()
    this.refreshTimer = setInterval(() => this.refresh(), 180_000) // 3 min
  }

  async apiCall(method, path, body?) {
    let response = await fetch(`http://localhost:81/mqs/${path}?LoginId=${this.loginId}`, ...)
    if (response.status === 401) {
      this.loginId = await this.login()
      response = await fetch(...) // retry once
    }
    return response
  }
}
```

### 6.2 API Call Mapping

Portal actions map to FaxBack API calls as follows:

| Portal Action | FaxBack API Call(s) |
|--------------|-------------------|
| View inbox | `ReadQueue` (Queue=Received, AllUsers=1) → filter by AccountId |
| View sent items | `ReadQueue` (Queue=Sent, AllUsers=1) → filter by AccountId |
| View fax details | `ReadMessage` or `ReadMessageBlock` |
| Download fax image | `BuildFaxImage` (with DocumentType=PDF) |
| Send a fax | `SendMessage` |
| Check send status | `ReadQueue` (Queue=Send/Sending) + `ReadMessage` |
| Cancel sending fax | `AbortMessage` |
| Delete fax | `DeleteMessage` |
| Dashboard counts | `GetQueueCounts` |

### 6.3 Queue Polling Service

A background job polls the FaxBack queues at regular intervals and syncs results to the portal database.

| Queue | Poll Interval | Purpose |
|-------|--------------|---------|
| Received | 15 seconds | New incoming faxes |
| Send / Sending | 10 seconds | Active outbound status |
| Sent | 30 seconds | Completed sends |

**Process:**

1. Call `ReadQueue` with `AllUsers=1` to get all message handles
2. For new handles not in portal database, call `ReadMessageBlock` for details
3. Store message metadata in portal database
4. For received faxes, call `BuildFaxImage` to download and store the fax content
5. Call `DeleteMessage` on FaxBack after successfully storing in portal database
6. Push status updates to connected clients via SSE

---

## 7. Core Features

### 7.1 Dashboard

The landing page after login. Shows at a glance:

- Unread received faxes count
- Faxes currently sending (with progress)
- Recent activity feed (last 10 sent/received)
- Quick-send shortcut
- Queue count summary from `GetQueueCounts`

### 7.2 Send Fax

**Simple Send:**

- To: Fax number input (with formatting/validation) or select from contacts
- Subject: Optional
- Cover page: Toggle on/off, select template, enter cover message
- Attachments: Upload PDF, TIFF, Word, or text files (drag and drop)
- Send button

**Bulk Send:**

- Upload a CSV or manually add multiple recipients
- CSV format: `Name, FaxNumber, Company` (minimum)
- Same document goes to all recipients in a single `SendMessage` call (FaxBack supports multiple `<Recipient>` blocks)
- Individual status tracking per recipient
- Option to use cover page placeholders that personalize per recipient

**Advanced Options (collapsible section):**

- Schedule send (future date/time, converted to UTC for FaxBack)
- Resolution settings
- Retry count override
- Billing code
- Sender info overrides (name, company, fax number, voice number)

### 7.3 Receive Fax / Inbox

- List view of received faxes with: sender number, date/time, page count, status
- Click to view fax as PDF in browser
- Download as PDF or TIFF
- Mark as read/unread
- Search and filter by date range, sender number, status
- Pagination

### 7.4 Sent Items / Outbox

- List view of sent faxes with: recipient number/name, date/time, page count, status, duration
- Status indicators: Queued, Sending, Delivered, Failed
- Click for detailed transmission info: connect time, BPS, retries, error details
- Resend failed faxes
- Search and filter

### 7.5 Live Status View

For faxes currently in Send or Sending queues:

- Real-time status updates via SSE
- Progress indication (pages transferred vs total)
- Ability to abort in-progress sends via `AbortMessage`
- Auto-refresh, moves to Sent Items on completion

### 7.6 Contacts

- Contact list with: Name, Fax Number, Company, Email, Notes
- Add / Edit / Delete contacts
- Import contacts from CSV
- Export contacts to CSV
- Search contacts
- Contact groups/tags for organizing
- Quick-select contacts when composing a fax
- Favorite/frequent contacts

### 7.7 Cover Page Management

#### 7.7.1 Fixed Cover Pages

Pre-designed cover page templates that users can select when sending. These are stored on the FaxBack server via the template management API.

- Upload cover page templates (RTF format, as FaxBack uses RTF)
- Set a default cover page per user
- Admin can manage domain-level default templates
- Preview cover page before sending

#### 7.7.2 Dynamic Placeholders

FaxBack supports these replacement fields in cover page templates:

| Placeholder | Description |
|------------|-------------|
| `$(SubmitTime)` | Time the fax was submitted |
| `$(Date)` | Submission date |
| `$(Cover)` | Cover message body text |
| `$(SenderName)` | Sender's name |
| `$(SenderFax)` | Sender's fax number |
| `$(SenderVoice)` | Sender's voice number |
| `$(SenderCompany)` | Sender's company |
| `$(From)` | Sender name extracted from email address |
| `$(To)` | Recipient name(s), comma-separated |
| `$(Cc)` | CC recipient list |
| `$(ReceiverCompany)` | Recipient company name |
| `$(ReceiverName)` | Single recipient name |
| `$(Subject)` | Message subject |

The portal's send form collects these values and passes them to `SendMessage`. FaxBack handles the actual placeholder replacement in the RTF template at send time.

#### 7.7.3 Template Management UI

- List all templates with name, size, upload date
- Upload new template (via `AddTemplate` API — base64 encoded)
- Download existing template (via `GetTemplateContent`)
- Delete template (via `DeleteTemplate`)
- Set default template
- Preview with sample data
- No modify endpoint exists in FaxBack — to update, use `AddTemplate` with `FailIfExists=false` to overwrite

### 7.8 Fax History & Archive

Since `DeleteMessage` must be called on FaxBack after processing, the portal database serves as the permanent archive.

- Full searchable history of all sent and received faxes
- Stored data: all message metadata from `ReadMessage` response, fax images (PDF), transmission details per recipient
- Retention policy: configurable per company/compliance requirements
- Export history to CSV

---

## 8. Database Schema

### 8.1 SQL Server Schema (Option A)

```
users
├── id                    (PK, uniqueidentifier)
├── entra_id              (nvarchar, Entra ID object ID)
├── email                 (nvarchar)
├── display_name          (nvarchar)
├── faxback_account_guid  (nvarchar)
├── faxback_account_id    (nvarchar)
├── role                  (nvarchar: user/manager/admin)
├── linked_by             (FK → users.id)
├── is_active             (bit)
├── created_at            (datetime2)
├── updated_at            (datetime2)

sessions
├── id                    (PK, nvarchar, session token)
├── user_id               (FK → users.id)
├── expires_at            (datetime2)
├── created_at            (datetime2)
├── ip_address            (nvarchar)
├── user_agent            (nvarchar)

contacts
├── id                    (PK, uniqueidentifier)
├── user_id               (FK → users.id)
├── name                  (nvarchar)
├── fax_number            (nvarchar)
├── company               (nvarchar)
├── email                 (nvarchar)
├── notes                 (nvarchar)
├── is_favorite           (bit)
├── created_at            (datetime2)
├── updated_at            (datetime2)

contact_groups
├── id                    (PK, uniqueidentifier)
├── user_id               (FK → users.id)
├── name                  (nvarchar)
├── created_at            (datetime2)

contact_group_members
├── contact_group_id      (FK → contact_groups.id)
├── contact_id            (FK → contacts.id)

fax_messages
├── id                    (PK, uniqueidentifier)
├── user_id               (FK → users.id)
├── message_handle        (nvarchar, from FaxBack)
├── direction             (nvarchar: sent/received)
├── status                (nvarchar: queued/sending/sent/failed/received)
├── status_num            (int)
├── queue                 (int)
├── subject               (nvarchar)
├── sender_name           (nvarchar)
├── sender_company        (nvarchar)
├── sender_fax_number     (nvarchar)
├── cover_template        (nvarchar)
├── app_info              (nvarchar)
├── billing_code          (nvarchar)
├── resolution            (int)
├── submit_time           (datetime2)
├── schedule_time         (datetime2)
├── is_read               (bit)
├── is_deleted            (bit, soft delete)
├── fax_image_path        (nvarchar, path to stored PDF)
├── created_at            (datetime2)
├── updated_at            (datetime2)

fax_recipients
├── id                    (PK, uniqueidentifier)
├── fax_message_id        (FK → fax_messages.id)
├── recipient_guid        (nvarchar, from FaxBack)
├── name                  (nvarchar)
├── fax_number            (nvarchar)
├── original_address      (nvarchar)
├── prefix                (int, 0=To, 1=Cc, 2=Bcc)
├── status                (nvarchar)
├── error                 (nvarchar)
├── error_number          (int)
├── start_time            (datetime2)
├── dial_seconds          (int)
├── connect_seconds       (int)
├── total_seconds         (int)
├── page_count            (int)
├── pages_transferred     (int)
├── connect_bps           (int)
├── retries               (int)
├── local_csid            (nvarchar)
├── remote_csid           (nvarchar)

fax_documents
├── id                    (PK, uniqueidentifier)
├── fax_message_id        (FK → fax_messages.id)
├── document_guid         (nvarchar, from FaxBack)
├── document_part         (int, 0=cover, 1=document)
├── name                  (nvarchar)
├── document_type         (int)
├── page_count            (int)

cover_templates
├── id                    (PK, uniqueidentifier)
├── user_id               (FK → users.id, nullable for domain-level)
├── template_name         (nvarchar)
├── template_guid         (nvarchar, from FaxBack)
├── is_default            (bit)
├── created_at            (datetime2)
├── updated_at            (datetime2)

audit_log
├── id                    (PK, bigint, identity)
├── user_id               (FK → users.id)
├── action                (nvarchar: login/logout/send_fax/view_fax/download_fax/etc)
├── resource_type         (nvarchar: fax/contact/template/user)
├── resource_id           (nvarchar)
├── details               (nvarchar(max), JSON)
├── ip_address            (nvarchar)
├── created_at            (datetime2)
```

### 8.2 Cosmos DB Schema (Option B)

Same logical entities but stored as documents. Suggested containers and partition keys:

| Container | Partition Key | Document Types |
|-----------|--------------|----------------|
| users | `/id` | User profiles with linked FaxBack account |
| sessions | `/userId` | Active sessions |
| contacts | `/userId` | Contacts and contact groups |
| faxMessages | `/userId` | Fax message records with embedded recipients and documents |
| auditLog | `/userId` | Audit trail entries |
| coverTemplates | `/userId` | Template metadata |

---

## 9. UI Layout & Navigation

### 9.1 Main Navigation (Sidebar)

```
┌─────────────────────────────────────────────────┐
│ ┌──────────┐  ┌──────────────────────────────┐  │
│ │          │  │                              │  │
│ │  EXPFAX  │  │         CONTENT AREA         │  │
│ │          │  │                              │  │
│ │ ──────── │  │                              │  │
│ │          │  │                              │  │
│ │ 📊 Dash  │  │                              │  │
│ │ 📤 Send  │  │                              │  │
│ │ 📥 Inbox │  │                              │  │
│ │ 📬 Sent  │  │                              │  │
│ │ 👥 Contac│  │                              │  │
│ │ 📄 Cover │  │                              │  │
│ │ 📋 Histor│  │                              │  │
│ │          │  │                              │  │
│ │ ──────── │  │                              │  │
│ │ ⚙ Settin│  │                              │  │
│ │          │  │                              │  │
│ └──────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 9.2 Page Breakdown

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Custom login form + "Sign in with Microsoft" button |
| Dashboard | `/` | Overview with counts, recent activity, quick actions |
| Send Fax | `/send` | Compose form with contacts picker, cover page options, file upload |
| Bulk Send | `/send/bulk` | CSV upload or multi-recipient form |
| Inbox | `/inbox` | Received fax list with preview panel |
| Inbox Detail | `/inbox/[id]` | Full fax view with PDF viewer, download, metadata |
| Sent Items | `/sent` | Sent fax list with status indicators |
| Sent Detail | `/sent/[id]` | Transmission details per recipient |
| Live Status | `/status` | Real-time view of active sends/receives |
| Contacts | `/contacts` | Contact list with CRUD, groups, import/export |
| Cover Pages | `/covers` | Template list, upload, preview, set defaults |
| History | `/history` | Full searchable archive with filters and export |
| Settings | `/settings` | User preferences, notification settings |
| Admin: Users | `/admin/users` | Link Entra ID users to FaxBack accounts |
| Admin: System | `/admin/system` | System health, FaxBack connection status, queue stats |

### 9.3 Responsive Design

- Sidebar collapses to hamburger menu on mobile/tablet
- Fax viewer adapts to screen size
- Send form stacks vertically on smaller screens
- Touch-friendly controls for all actions

---

## 10. HIPAA Compliance

### 10.1 Technical Safeguards

| Requirement | Implementation |
|------------|----------------|
| Encryption in transit | TLS 1.2+ on all connections (IIS/reverse proxy handles TLS termination) |
| Encryption at rest | SQL Server TDE or BitLocker on VPS disk. Cosmos DB encrypts at rest by default |
| Access controls | Role-based permissions, users see only their own faxes |
| Unique user IDs | Each user has a unique portal account linked to Entra ID |
| Automatic logoff | 30-minute idle session timeout |
| Audit controls | Every action logged to audit_log table with user, action, timestamp, IP |
| Authentication | Entra ID with MFA enforced via conditional access |
| Integrity | Fax images stored with checksums, database backups encrypted |

### 10.2 Administrative Safeguards

| Requirement | Implementation |
|------------|----------------|
| Access management | Admin controls who can access the portal via user linking |
| Workforce training | Document portal usage policies and HIPAA handling procedures |
| Security incident procedures | Audit logs enable investigation, alerting on suspicious activity |
| Contingency plan | Database backups, server snapshots, documented recovery procedures |

### 10.3 Audit Log Events

Every one of these actions generates a record in the audit_log table:

- User login (success and failure)
- User logout
- Fax sent (with recipient numbers)
- Fax viewed
- Fax downloaded
- Fax deleted
- Contact created/modified/deleted
- Cover template uploaded/deleted
- User account linked/unlinked
- Settings changed
- Admin actions

### 10.4 Business Associate Agreement

A BAA must be in place between:

- Your company and FaxBack (for the NSX server and fax processing)
- Your company and any healthcare client using the portal
- Your company and Microsoft (for Entra ID and optionally Cosmos DB/Azure services)

---

## 11. Security Considerations

### 11.1 Server Hardening

- FaxBack API (port 81) bound to localhost only — not exposed externally
- Portal runs on 443 (HTTPS) only
- Windows Firewall rules restrict all unnecessary ports
- RDP access restricted to VPN or specific IP allowlist
- Regular Windows updates and patches

### 11.2 Application Security

- All user input sanitized and validated server-side
- CSRF protection via Next.js built-in mechanisms
- Content Security Policy headers
- Rate limiting on login and API endpoints
- File upload validation (type, size, malware scan consideration)
- No sensitive data in client-side JavaScript or browser storage
- Environment variables for all secrets (FaxBack credentials, database connection strings, Entra ID client secrets)

### 11.3 Data Protection

- Fax images stored on encrypted filesystem
- Database credentials rotated regularly
- Session tokens are cryptographically random
- Soft delete for fax messages (retain for compliance, hide from user)
- Data retention policies enforced via scheduled cleanup jobs

---

## 12. Background Services

The portal runs several background tasks alongside the web server:

| Service | Interval | Purpose |
|---------|----------|---------|
| FaxBack Session Keepalive | 3 minutes | Calls `RefreshId` to maintain supervisor session |
| Inbox Poller | 15 seconds | Polls `ReadQueue` (Received) for new faxes, syncs to database |
| Outbox Poller | 10 seconds | Polls `ReadQueue` (Send/Sending) for status updates |
| Sent Poller | 30 seconds | Polls `ReadQueue` (Sent) for completed sends |
| Fax Image Downloader | On new message | Calls `BuildFaxImage` and stores PDF locally |
| Message Cleanup | After download | Calls `DeleteMessage` on FaxBack after successful storage |
| Session Cleanup | 1 hour | Removes expired sessions from database |
| Audit Log Archival | Daily | Compresses and archives old audit logs |

---

## 13. File Storage

### 13.1 Fax Images

Received and sent fax images are downloaded from FaxBack via `BuildFaxImage` and stored locally.

**Storage path structure:**

```
/data/faxes/
├── received/
│   ├── 2026/
│   │   ├── 04/
│   │   │   ├── {message-id}.pdf
│   │   │   ├── {message-id}.pdf
├── sent/
│   ├── 2026/
│   │   ├── 04/
│   │   │   ├── {message-id}.pdf
```

- All images stored as PDF (request `DocumentType=PDF` from `BuildFaxImage`)
- Year/month directory structure for manageability
- Files served through the portal with authentication checks — never directly accessible

### 13.2 Upload Handling

Documents uploaded for sending are temporarily stored, base64-encoded, and sent to FaxBack via `SendMessage`. After successful submission, temporary files are cleaned up.

Max upload size: 20MB per file (configurable).  
Supported formats: PDF, TIFF, RTF, HTML, TXT, DOC/DOCX (converted to PDF server-side).

---

## 14. Error Handling

### 14.1 FaxBack API Errors

| HTTP Status | Meaning | Portal Behavior |
|-------------|---------|-----------------|
| 400 | Bad request / missing data | Show user-friendly validation error |
| 401 | Session expired or invalid | Re-authenticate supervisor session, retry call |
| 404 | Resource not found | Show "not found" message |
| 200 with error StatusNum | FaxBack application error | Parse error message, display to user |

### 14.2 Common FaxBack Error Codes

| StatusNum | Meaning | User Message |
|-----------|---------|-------------|
| 20578342 | Missing credentials | Internal error — portal should never expose this |
| 20578347 | Blocked by validation rule | "This fax number is blocked" |
| 20578353 | All recipients failed validation | "Invalid fax number(s). Please check and try again" |
| 20578354 | Some recipients failed validation | "Some recipients have invalid numbers" (show which) |
| 20578361 | Cover template already exists | "A template with this name already exists" |
| 19988534 | Invalid password | Internal error — supervisor credential issue |
| 30243 | Call hung up (BYE received) | "Fax transmission was interrupted" |

---

## 15. Project Structure

```
expfax-portal/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   ├── (portal)/
│   │   │   ├── layout.tsx      # Authenticated layout with sidebar
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── send/
│   │   │   │   ├── page.tsx    # Send fax form
│   │   │   │   └── bulk/
│   │   │   │       └── page.tsx
│   │   │   ├── inbox/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── sent/
│   │   │   ├── contacts/
│   │   │   ├── covers/
│   │   │   ├── history/
│   │   │   ├── settings/
│   │   │   └── admin/
│   │   ├── api/                # API routes
│   │   │   ├── auth/
│   │   │   ├── fax/
│   │   │   ├── contacts/
│   │   │   ├── templates/
│   │   │   └── sse/
│   ├── lib/
│   │   ├── faxback/            # FaxBack API client
│   │   │   ├── session.ts      # Supervisor session manager
│   │   │   ├── accounts.ts
│   │   │   ├── messages.ts
│   │   │   ├── queues.ts
│   │   │   ├── dids.ts
│   │   │   └── templates.ts
│   │   ├── auth/               # Authentication logic
│   │   │   ├── session.ts
│   │   │   ├── entra.ts
│   │   │   └── middleware.ts
│   │   ├── db/                 # Database access
│   │   │   ├── schema.ts
│   │   │   ├── queries/
│   │   │   └── migrations/
│   │   └── services/           # Background services
│   │       ├── queue-poller.ts
│   │       ├── image-downloader.ts
│   │       └── cleanup.ts
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── fax/
│   │   ├── contacts/
│   │   └── layout/
│   └── types/                  # TypeScript type definitions
├── public/
├── data/                       # Fax image storage (outside web root)
│   ├── received/
│   └── sent/
├── .env.local                  # Environment variables
├── next.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
└── package.json
```

---

## 16. Environment Variables

```env
# FaxBack Configuration
FAXBACK_API_URL=http://localhost:81/mqs
FAXBACK_SUPERVISOR_USERNAME=<supervisor-account>
FAXBACK_SUPERVISOR_PASSWORD=<supervisor-password>

# Database (Option A — SQL Server)
DATABASE_URL=mssql://user:password@localhost:1433/expfax

# Database (Option B — Cosmos DB)
COSMOS_ENDPOINT=https://<account>.documents.azure.com
COSMOS_KEY=<primary-key>
COSMOS_DATABASE=expfax

# Entra ID / Azure AD
ENTRA_TENANT_ID=<tenant-id>
ENTRA_CLIENT_ID=<client-id>
ENTRA_CLIENT_SECRET=<client-secret>

# Session
SESSION_SECRET=<random-256-bit-key>
SESSION_MAX_AGE=28800           # 8 hours in seconds
SESSION_IDLE_TIMEOUT=1800       # 30 minutes in seconds

# Storage
FAX_STORAGE_PATH=D:/data/faxes

# Application
NEXT_PUBLIC_APP_URL=https://portal.expfax.com
NODE_ENV=production
```

---

## 17. Implementation Phases

### Phase 1 — Foundation (Weeks 1–3)

- Project setup: Next.js, TypeScript, Tailwind, shadcn/ui
- Database schema and migrations
- FaxBack API client library with supervisor session manager
- Authentication: custom login page, Entra ID integration, session management
- Admin page: user-to-FaxBack account linking

### Phase 2 — Core Faxing (Weeks 4–6)

- Send fax page (single recipient, file upload, cover page selection)
- Inbox (received fax list, view fax as PDF, download)
- Sent items (sent fax list, transmission details)
- Queue polling background services
- Fax image download and storage
- Dashboard with queue counts

### Phase 3 — Enhanced Features (Weeks 7–9)

- Contacts management (CRUD, groups, import/export CSV)
- Cover page template management (upload, preview, set default)
- Bulk send (multi-recipient, CSV upload)
- Live status view with SSE
- Search and filtering across all views
- Fax history archive with export

### Phase 4 — Compliance & Polish (Weeks 10–12)

- Full audit logging implementation
- HIPAA compliance review and documentation
- Error handling and edge case coverage
- Performance optimization
- Security hardening and penetration testing
- User documentation
- Deployment automation

---

## 18. Open Questions

1. **DID assignment** — Are DIDs currently assigned per user or shared? This affects how sending identity works.
2. **Email gateway** — Should the portal replace email-based faxing entirely, or coexist alongside it?
3. **Notifications** — Should users get email notifications when a fax is received, or is the portal inbox sufficient?
4. **Multi-tenant** — Will different client companies need isolated environments, or is this a single-organization deployment?
5. **Fax image retention** — How long should fax images be stored? What's the compliance requirement?
6. **Existing admin portal** — Does the FaxAdmin portal at expfax.com remain in use for account management, or should admin functions move into the new portal over time?
7. **SIP/trunk configuration** — Is there a Port Server component involved, or is fax delivery handled entirely by the NSX server?
8. **Branding** — Custom branding per client company, or single ExpFax brand?



