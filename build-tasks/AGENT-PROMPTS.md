# ExpFax Portal — Sequential Agent Prompts

> **Target model:** Claude Sonnet (smaller context, less reasoning)
> **Strategy:** Each prompt is short, direct, and points the agent only to the files it needs. No ambiguity. Consolidates small related tasks into single steps where safe.
>
> **How to use:** Copy each prompt below (one at a time, in order) into a Sonnet agent session. Wait for it to finish and confirm the app compiles before moving to the next prompt.

---

## Phase 0 — Project Scaffold & Infrastructure

### Step 1 · Scaffold Next.js Project
```
Read the file build-tasks/00-scaffold-nextjs.md and execute every instruction in it exactly. Create the Next.js project, install all dependencies, and set up the folder structure. Verify the app compiles with `npm run build`.
```

### Step 2 · Bicep: App Service + Key Vault + Storage
> *Consolidates tasks 01, 04, 06 — three simple Bicep modules with identical patterns.*
```
Read these three files and execute each one in order:
1. build-tasks/01-infra-core.md — Create the App Service Bicep module
2. build-tasks/04-infra-keyvault.md — Create the Key Vault Bicep module
3. build-tasks/06-infra-storage.md — Create the Storage Bicep module

All three follow the same pattern: a single Bicep file under infra/modules/. Create all three files exactly as specified.
```

### Step 3 · Bicep: Cosmos DB
```
Read build-tasks/02-infra-cosmos.md and execute every instruction. Create the Cosmos DB Bicep module with all containers and role assignments.
```

### Step 4 · Entra ID Registration Script
```
Read build-tasks/03-infra-entra.md and execute every instruction. Create the Entra ID app registration script.
```

### Step 5 · Bicep: Main Orchestrator + azd Config
```
Read build-tasks/05-infra-main-bicep.md and execute every instruction. Create the main.bicep that wires all modules together, plus the azure.yaml for azd.
```

---

## Phase 1 — App Foundation

### Step 6 · Config + Cosmos Client
> *Consolidates tasks 10, 11 — both create a single small file in src/lib/.*
```
Read these two files and execute each one in order:
1. build-tasks/10-env-config.md — Create the environment config loader
2. build-tasks/11-cosmos-client.md — Create the Cosmos DB client singleton

Both files go under src/lib/. After creating both, verify the app compiles.
```

### Step 7 · Database Schema Types
```
Read build-tasks/12-db-schema-types.md and execute every instruction. Create all TypeScript types for Cosmos documents.
```

### Step 8 · Auth: Session + Middleware
> *Consolidates tasks 13, 15 — middleware directly depends on the session module.*
```
Read these two files and execute each one in order:
1. build-tasks/13-auth-session.md — Create the session management module
2. build-tasks/15-auth-middleware.md — Create the Next.js route protection middleware

The middleware imports from the session module, so they must be built together. Verify the app compiles after both.
```

### Step 9 · Auth: Entra ID OAuth + ROPC
```
Read build-tasks/14-auth-entra.md and execute every instruction. Create the Entra ID authentication module with OAuth Authorization Code and ROPC flows, plus all auth API routes.
```

### Step 10 · Layout Shell (Sidebar, Header, App Shell)
```
Read build-tasks/16-layout-shell.md and execute every instruction. Create the sidebar, header (with help button, notification bell import, search trigger), and app shell components. This creates the main (portal) layout. Follow the code exactly — do not simplify or skip any components.
```

### Step 11 · Login Page
```
Read build-tasks/17-login-page.md and execute every instruction. Create the login page with the custom form and Microsoft SSO button.
```

---

## Phase 2 — FaxBack Integration

### Step 12 · FaxBack Session Manager
```
Read build-tasks/20-faxback-session.md and execute every instruction. Create the supervisor session manager with login, refresh, and retry logic.
```

### Step 13 · FaxBack API Client
```
Read build-tasks/21-faxback-api-client.md and execute every instruction. Create the typed API client with all FaxBack endpoint wrappers. This creates multiple files — follow the file list at the top of the task carefully.
```

### Step 14 · FaxBack Queue Poller
```
Read build-tasks/22-faxback-queue-poller.md and execute every instruction. Create the background queue polling service that syncs fax status from FaxBack to Cosmos DB.
```

### Step 15 · Fax Image Download + Blob Storage
```
Read build-tasks/23-faxback-image-dl.md and execute every instruction. Create the fax image download service and Azure Blob storage integration.
```

### Step 16 · FaxBack Account Management + Email Config
```
Read build-tasks/24-faxback-accounts-api.md and execute every instruction. Create the FaxBack account management and email-to-fax/fax-to-email configuration API client.
```

---

## Phase 3 — Core Pages

### Step 17 · Dashboard Page
```
Read build-tasks/30-dashboard-page.md and execute every instruction. Create the dashboard page with stats cards, recent activity feed, and quick actions. Also create its API route. Follow the component code exactly.
```

### Step 18 · Send Fax Page (Multi-Recipient + Template Fields)
```
Read build-tasks/31-send-fax-page.md and execute every instruction. This is a large task — it creates the send fax form with:
- Multiple recipient rows (add/remove)
- File attachments
- Template fields modal (6 FaxBack placeholders)
- Resolution dropdown (Standard/Fine/Superfine)

Create ALL files listed at the top of the task. Do not skip the template-fields-modal.tsx component.
```

### Step 19 · Inbox Page + Detail View
```
Read build-tasks/32-inbox-page.md and execute every instruction. Create the inbox list page with the FaxListItem component (including conditional duration column for sent items) and the inbox detail/viewer page.
```

### Step 20 · Sent Items Page + Detail View
```
Read build-tasks/33-sent-page.md and execute every instruction. Create the sent items list page and sent item detail page. This reuses the same FaxListItem component from task 32.
```

### Step 21 · Fax API Routes
```
Read build-tasks/34-api-routes-fax.md and execute every instruction. Create ALL API route files: list, send (with recipients array + resolution + templateFields), detail, download, view-url, read-status, and delete. Follow the file list at the top of the task carefully.
```

---

## Phase 4 — Enhanced Features

### Step 22 · Contacts Page + API
> *Consolidates tasks 40, 41 — page and its API routes are tightly coupled.*
```
Read these two files and execute each one in order:
1. build-tasks/40-contacts-page.md — Create the contacts page with CRUD, groups, favorites, and CSV import dialog
2. build-tasks/41-contacts-api.md — Create all contacts API routes including the CSV import endpoint

The page depends on the API routes, so build them together. Create ALL files from both tasks.
```

### Step 23 · Cover Templates Page + API
> *Consolidates tasks 42, 43 — small page + small API, identical pattern.*
```
Read these two files and execute each one in order:
1. build-tasks/42-covers-page.md — Create the cover template management page
2. build-tasks/43-covers-api.md — Create all cover template API routes

Both are straightforward CRUD. Create all files from both tasks and verify the app compiles.
```

### Step 24 · Live Status Page (SSE)
```
Read build-tasks/45-live-status-sse.md and execute every instruction. Create the live status page with SSE streaming. Note: it renders separate "Live Transmissions" and "Queued for Sending" cards.
```

### Step 25 · History / Archive Page
```
Read build-tasks/46-history-page.md and execute every instruction. Create the history page with date-range search and CSV export.
```

### Step 26 · Admin: Email-to-Fax Configuration
```
Read build-tasks/47-admin-email-config.md and execute every instruction. Create the admin email config page and its API route for per-customer email-to-fax / fax-to-email settings.
```

### Step 27 · Admin: Storage Retention
```
Read build-tasks/48-admin-storage-retention.md and execute every instruction. Create the admin storage retention page and its API routes for blob lifecycle management.
```

### Step 28 · Admin: Cost Snapshot + System Health
> *Consolidates tasks 49, 51 — both are admin dashboard panels with identical structure (page + single API route).*
```
Read these two files and execute each one in order:
1. build-tasks/49-admin-cost-snapshot.md — Create the Azure cost snapshot admin page + API route
2. build-tasks/51-admin-system.md — Create the system health admin page + API route

Both follow the same pattern: an admin page that fetches data from a single API route. Create all files from both tasks.
```

---

## Phase 5 — Admin & Compliance

### Step 29 · Admin: User Management
```
Read build-tasks/50-admin-users.md and execute every instruction. Create the admin user management page for linking Entra users to FaxBack accounts.
```

### Step 30 · Audit Logging (Service + Page + API)
```
Read build-tasks/52-audit-logging.md and execute every instruction. Create the audit logger service, the admin audit viewer page, and the audit API route. This task has three concerns — follow the file list carefully.
```

### Step 31 · User Settings Page
```
Read build-tasks/53-settings-page.md and execute every instruction. Create the user settings/preferences page and its API route.
```

### Step 32 · Error Handling + Toast Provider
```
Read build-tasks/54-error-handling.md and execute every instruction. Create the global error classes, FaxBack error mapper, error boundary component, toast provider, error.tsx, and not-found.tsx. This task creates 6 files — follow the list carefully.
```

### Step 33 · Security Headers + Rate Limiting
```
Read build-tasks/55-security-headers.md and execute every instruction. This task MODIFIES existing files (middleware.ts, next.config.ts) and creates new ones. Read the existing files before editing them.
```

### Step 34 · Notification Bell
```
Read build-tasks/56-notifications.md and execute every instruction. Create the NotificationBell component, the notifications API route, and the mark-as-read API route. The NotificationBell is already imported in the header from task 16 — just create the component file.
```

### Step 35 · Global Search (⌘K Palette)
```
Read build-tasks/57-global-search.md and execute every instruction. Create the GlobalSearch command palette component and its search API route. This task also patches app-shell.tsx to wire in the component — follow the modification instructions exactly.
```

---

## Final Verification

### Step 36 · Full Build + Smoke Test
```
Run `npm run build` and fix any TypeScript or build errors. Then run `npm run dev` and verify:
1. The login page loads at /login
2. After login, the dashboard loads at /
3. The sidebar shows all navigation links
4. The notification bell appears in the header
5. ⌘K / Ctrl+K opens the search palette
6. The Help button is visible in the header
```

---

## Quick Reference — Step to Task File Mapping

| Step | Task File(s) | Consolidated? |
|------|-------------|:---:|
| 1 | `00-scaffold-nextjs.md` | — |
| 2 | `01` + `04` + `06` | ✅ 3→1 |
| 3 | `02-infra-cosmos.md` | — |
| 4 | `03-infra-entra.md` | — |
| 5 | `05-infra-main-bicep.md` | — |
| 6 | `10` + `11` | ✅ 2→1 |
| 7 | `12-db-schema-types.md` | — |
| 8 | `13` + `15` | ✅ 2→1 |
| 9 | `14-auth-entra.md` | — |
| 10 | `16-layout-shell.md` | — |
| 11 | `17-login-page.md` | — |
| 12 | `20-faxback-session.md` | — |
| 13 | `21-faxback-api-client.md` | — |
| 14 | `22-faxback-queue-poller.md` | — |
| 15 | `23-faxback-image-dl.md` | — |
| 16 | `24-faxback-accounts-api.md` | — |
| 17 | `30-dashboard-page.md` | — |
| 18 | `31-send-fax-page.md` | — |
| 19 | `32-inbox-page.md` | — |
| 20 | `33-sent-page.md` | — |
| 21 | `34-api-routes-fax.md` | — |
| 22 | `40` + `41` | ✅ 2→1 |
| 23 | `42` + `43` | ✅ 2→1 |
| 24 | `45-live-status-sse.md` | — |
| 25 | `46-history-page.md` | — |
| 26 | `47-admin-email-config.md` | — |
| 27 | `48-admin-storage-retention.md` | — |
| 28 | `49` + `51` | ✅ 2→1 |
| 29 | `50-admin-users.md` | — |
| 30 | `52-audit-logging.md` | — |
| 31 | `53-settings-page.md` | — |
| 32 | `54-error-handling.md` | — |
| 33 | `55-security-headers.md` | — |
| 34 | `56-notifications.md` | — |
| 35 | `57-global-search.md` | — |
| 36 | *(verification)* | — |

**Original: 41 tasks → Consolidated: 36 steps** (6 merges saved 5 steps)
