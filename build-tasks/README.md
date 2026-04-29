# ExpFax Portal — Agent Build Guide

## Architecture Decision: Azure PaaS (Option B)

- **Runtime:** Azure App Service (Node.js 20 LTS)
- **Database:** Azure Cosmos DB (NoSQL API)
- **Auth:** Microsoft Entra ID
- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS + shadcn/ui
- **IaC:** Bicep under `infra/` folder, deployed via `azd`
- **FaxBack API:** Exposed securely from VPS via HTTPS endpoint

## Task Execution Order

Each task is a self-contained markdown file with everything the agent needs.
No task requires the full project context. Execute in order.

### Phase 0 — Infrastructure (do these first)
| # | File | What it does |
|---|------|-------------|
| 00 | `00-scaffold-nextjs.md` | Create Next.js project, install all deps |
| 01 | `01-infra-core.md` | Bicep: Resource Group, App Service Plan, App Service |
| 02 | `02-infra-cosmos.md` | Bicep: Cosmos DB account, database, containers |
| 03 | `03-infra-entra.md` | Bicep/script: Entra ID app registration |
| 04 | `04-infra-keyvault.md` | Bicep: Key Vault for secrets |
| 05 | `05-infra-main-bicep.md` | Bicep: main.bicep that wires all modules + azd config |
| 06 | `06-infra-storage.md` | Bicep: Azure Blob Storage + lifecycle policy |

### Phase 1 — App Foundation
| # | File | What it does |
|---|------|-------------|
| 10 | `10-env-config.md` | Environment variables, config loader |
| 11 | `11-cosmos-client.md` | Cosmos DB client singleton + container helpers |
| 12 | `12-db-schema-types.md` | TypeScript types for all Cosmos documents |
| 13 | `13-auth-session.md` | Session management (create/validate/destroy) |
| 14 | `14-auth-entra.md` | Entra ID OAuth + ROPC login flows |
| 15 | `15-auth-middleware.md` | Next.js middleware for route protection |
| 16 | `16-layout-shell.md` | App shell: sidebar, header, responsive layout |
| 17 | `17-login-page.md` | Login page with custom form + Microsoft button |

### Phase 2 — FaxBack Integration
| # | File | What it does |
|---|------|-------------|
| 20 | `20-faxback-session.md` | Supervisor session manager (login/refresh/retry) |
| 21 | `21-faxback-api-client.md` | Typed API client for all FaxBack endpoints |
| 22 | `22-faxback-queue-poller.md` | Background queue polling service |
| 23 | `23-faxback-image-dl.md` | Fax image download + Azure Blob storage |
| 24 | `24-faxback-accounts-api.md` | FaxBack account management + email config API |

### Phase 3 — Core Pages
| # | File | What it does |
|---|------|-------------|
| 30 | `30-dashboard-page.md` | Dashboard with stats, activity, quick actions |
| 31 | `31-send-fax-page.md` | Send fax form (multiple recipients, template fields, resolution) |
| 32 | `32-inbox-page.md` | Inbox list + detail view |
| 33 | `33-sent-page.md` | Sent items list + detail view |
| 34 | `34-api-routes-fax.md` | API routes: send, list, detail, download, delete |

### Phase 4 — Enhanced Features
| # | File | What it does |
|---|------|-------------|
| 40 | `40-contacts-page.md` | Contacts CRUD + groups |
| 41 | `41-contacts-api.md` | Contacts API routes + Cosmos queries |
| 42 | `42-covers-page.md` | Cover template management UI |
| 43 | `43-covers-api.md` | Cover template API routes |
| 45 | `45-live-status-sse.md` | Live status page with SSE |
| 46 | `46-history-page.md` | History/archive with search + export |
| 47 | `47-admin-email-config.md` | ⭐ Admin: per-customer email-to-fax / fax-to-email config |
| 48 | `48-admin-storage-retention.md` | ⭐ Admin: storage retention/purge settings |
| 49 | `49-admin-cost-snapshot.md` | ⭐ Admin: Azure cost snapshot dashboard |

### Phase 5 — Admin & Compliance
| # | File | What it does |
|---|------|-------------|
| 50 | `50-admin-users.md` | Admin page: link Entra users to FaxBack accounts |
| 51 | `51-admin-system.md` | Admin page: system health, FaxBack status |
| 52 | `52-audit-logging.md` | Audit log service + Cosmos writes + admin viewer |
| 53 | `53-settings-page.md` | User settings/preferences page |
| 54 | `54-error-handling.md` | Global error handling, FaxBack error mapping, toasts |
| 55 | `55-security-headers.md` | CSP, rate limiting, CSRF, security hardening |
| 56 | `56-notifications.md` | Notification bell with live badge + dropdown |
| 57 | `57-global-search.md` | ⌘K global search command palette |

## Key Rules for the Building Agent

1. **Each task is standalone** — read only that task file + any files it references
2. **Always run the app after each task** to verify it compiles
3. **Never modify files from previous tasks** unless the task explicitly says to
4. **Use the design doc** (`expfax-portal-design.md`) as the source of truth for business logic
5. **Follow existing patterns** — check the project's existing code style before writing new code
6. **Cosmos DB partition keys**: users=`/id`, sessions=`/userId`, contacts=`/userId`, faxMessages=`/userId`, auditLog=`/userId`, coverTemplates=`/userId`
