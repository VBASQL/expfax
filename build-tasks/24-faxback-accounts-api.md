# Task 24 — FaxBack Accounts API Client

## Goal
Create typed wrapper functions for FaxBack Account management endpoints — specifically email alias creation, account modification (queue profile for email routing), and cover page settings.

## Files to Create
- `src/lib/faxback/accounts.ts`

## Dependencies
- `src/lib/faxback/session.ts` (task 20) — `faxbackFetch()`
- `xml2js` (installed in task 00)

## FaxBack Account API Endpoints

| Action | Endpoint | Method |
|--------|----------|--------|
| Create email alias (inbound email→fax) | `Accounts/CreateEmailAlias` | POST XML |
| Delete email alias | `Accounts/DeleteEmailAlias` | POST XML |
| Modify account (outbound fax→email routing) | `Accounts/ModifyAccount` | POST XML |
| Read account details | `Accounts/ReadAccount` | GET |

## Email Config Concepts

### Inbound: Email → Fax
- `CreateEmailAlias` assigns an email like `customer@faxdomain.com`
- When someone emails that address, the FaxBack gateway sends it as a fax from that customer's account
- `UseCoverPage` and `EmailCoverType` on the account control cover page behavior

### Outbound: Received Fax → Email
- `ModifyAccount` with `QueueProfileXml` configures auto-forwarding:
  - `Rt="2"` = route to email
  - `Ea="customer@email.com"` = delivery email address
  - `Ef="1"` = PDF attachment (0=TIF)
  - `Dn="2/1"` = delivery notification with fax image
  - `Ndn="2/1"` = non-delivery notification with fax image

## Implementation

### Create `src/lib/faxback/accounts.ts`

```typescript
import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";

// ============================================================
// Types
// ============================================================

export interface EmailRoutingConfig {
  /** Email address to forward received faxes to */
  deliveryEmail: string;
  /** Attachment format: "pdf" or "tif" */
  attachmentFormat: "pdf" | "tif";
  /** Send delivery notification with fax image attached */
  deliveryNotification: boolean;
  /** Send non-delivery notification with fax image attached */
  nonDeliveryNotification: boolean;
}

export interface EmailAliasConfig {
  /** Inbound email alias (e.g., customer@faxdomain.com) */
  emailAlias: string;
}

export interface AccountEmailSettings {
  /** Inbound: email alias for email-to-fax */
  inbound: EmailAliasConfig | null;
  /** Outbound: fax-to-email forwarding config */
  outbound: EmailRoutingConfig | null;
  /** Whether to use cover page for email-sent faxes (0=no, 1=yes) */
  useCoverPage: boolean;
  /** Cover page type for email faxes */
  emailCoverType: number;
}

export interface AccountDetails {
  accountGuid: string;
  accountId: string;
  emailAlias: string | null;
  queueProfileXml: string | null;
  useCoverPage: number;
  emailCoverType: number;
  raw: Record<string, unknown>;
}

// ============================================================
// Read Account
// ============================================================

/**
 * Read full account details from FaxBack.
 */
export async function readAccount(accountGuid: string): Promise<AccountDetails> {
  const res = await faxbackFetch(
    `Accounts/ReadAccount?AccountGuid=${encodeURIComponent(accountGuid)}`
  );
  if (!res.ok) throw new Error(`ReadAccount failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const account = parsed?.NSX?.Account || parsed?.Account || {};

  return {
    accountGuid: account.AccountGuid || accountGuid,
    accountId: account.AccountId || "",
    emailAlias: account.EmailAlias || null,
    queueProfileXml: account.QueueProfileXml || null,
    useCoverPage: parseInt(account.UseCoverPage || "0", 10),
    emailCoverType: parseInt(account.EmailCoverType || "0", 10),
    raw: account,
  };
}

/**
 * Parse the current email settings from a FaxBack account.
 */
export async function getAccountEmailSettings(
  accountGuid: string
): Promise<AccountEmailSettings> {
  const account = await readAccount(accountGuid);

  // Parse outbound routing from QueueProfileXml attributes
  let outbound: EmailRoutingConfig | null = null;
  if (account.queueProfileXml) {
    // QueueProfileXml can be a string with attributes or an object
    const qp =
      typeof account.queueProfileXml === "string"
        ? await parseQueueProfile(account.queueProfileXml)
        : (account.queueProfileXml as Record<string, string>);

    // Check for $ (attributes from xml2js)
    const attrs = (qp as any)?.$ || qp;

    if (attrs?.Rt === "2" && attrs?.Ea) {
      outbound = {
        deliveryEmail: attrs.Ea,
        attachmentFormat: attrs.Ef === "0" ? "tif" : "pdf",
        deliveryNotification: attrs.Dn?.startsWith("2") ?? true,
        nonDeliveryNotification: attrs.Ndn?.startsWith("2") ?? true,
      };
    }
  }

  return {
    inbound: account.emailAlias
      ? { emailAlias: account.emailAlias }
      : null,
    outbound,
    useCoverPage: account.useCoverPage === 1,
    emailCoverType: account.emailCoverType,
  };
}

async function parseQueueProfile(
  xmlOrAttrs: string
): Promise<Record<string, string>> {
  try {
    const wrapped = xmlOrAttrs.startsWith("<")
      ? xmlOrAttrs
      : `<QueueProfileXml ${xmlOrAttrs} />`;
    const parsed = await parseStringPromise(wrapped, { explicitArray: false });
    return parsed?.QueueProfileXml?.$ || {};
  } catch {
    return {};
  }
}

// ============================================================
// Inbound: Create / Delete Email Alias
// ============================================================

/**
 * Create an email alias for a customer (email-to-fax inbound).
 * e.g., harry@faxdomain.com → faxes sent from harry's account.
 */
export async function createEmailAlias(
  accountGuid: string,
  emailAlias: string
): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <EmailAlias>${escapeXml(emailAlias)}</EmailAlias>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
  </Account>
</NSX>`;

  const res = await faxbackFetch("Accounts/CreateEmailAlias", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`CreateEmailAlias failed: ${res.status} — ${errText}`);
  }
}

/**
 * Delete an email alias for a customer.
 */
export async function deleteEmailAlias(
  accountGuid: string,
  emailAlias: string
): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <EmailAlias>${escapeXml(emailAlias)}</EmailAlias>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
  </Account>
</NSX>`;

  const res = await faxbackFetch("Accounts/DeleteEmailAlias", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeleteEmailAlias failed: ${res.status} — ${errText}`);
  }
}

// ============================================================
// Outbound: Modify Account (Email Routing + Cover Page)
// ============================================================

/**
 * Configure outbound fax-to-email forwarding for a customer.
 * Sets QueueProfileXml to route received faxes to email as PDF.
 */
export async function setEmailRouting(
  accountGuid: string,
  config: EmailRoutingConfig
): Promise<void> {
  const ef = config.attachmentFormat === "pdf" ? "1" : "0";
  const dn = config.deliveryNotification ? "2/1" : "0";
  const ndn = config.nonDeliveryNotification ? "2/1" : "0";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
    <QueueProfileXml Rt="2" Ea="${escapeXml(config.deliveryEmail)}" Ef="${ef}" Dn="${dn}" Ndn="${ndn}" />
  </Account>
</NSX>`;

  const res = await faxbackFetch("Accounts/ModifyAccount", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ModifyAccount (email routing) failed: ${res.status} — ${errText}`);
  }
}

/**
 * Disable outbound email routing — set routing back to queue (portal-only).
 */
export async function disableEmailRouting(accountGuid: string): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
    <QueueProfileXml Rt="1" />
  </Account>
</NSX>`;

  const res = await faxbackFetch("Accounts/ModifyAccount", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ModifyAccount (disable routing) failed: ${res.status} — ${errText}`);
  }
}

/**
 * Set cover page behavior for email-originated faxes.
 */
export async function setEmailCoverPage(
  accountGuid: string,
  useCoverPage: boolean,
  emailCoverType?: number
): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
    <UseCoverPage>${useCoverPage ? "1" : "0"}</UseCoverPage>
    ${emailCoverType !== undefined ? `<EmailCoverType>${emailCoverType}</EmailCoverType>` : ""}
  </Account>
</NSX>`;

  const res = await faxbackFetch("Accounts/ModifyAccount", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ModifyAccount (cover page) failed: ${res.status} — ${errText}`);
  }
}

// ============================================================
// Full email config update (convenience)
// ============================================================

export interface UpdateEmailConfigParams {
  accountGuid: string;
  /** Inbound: set to email alias string or null to remove */
  inboundAlias: string | null;
  /** Outbound: set config or null to disable */
  outbound: EmailRoutingConfig | null;
  /** Cover page for email faxes */
  useCoverPage: boolean;
  emailCoverType?: number;
}

/**
 * Apply a full email configuration update for a customer account.
 * Handles creating/deleting alias, setting/disabling routing, and cover page.
 */
export async function updateEmailConfig(
  params: UpdateEmailConfigParams
): Promise<void> {
  // Get current settings to detect changes
  const current = await getAccountEmailSettings(params.accountGuid);

  // --- Inbound alias ---
  if (params.inboundAlias && !current.inbound) {
    // Create new alias
    await createEmailAlias(params.accountGuid, params.inboundAlias);
  } else if (params.inboundAlias && current.inbound && current.inbound.emailAlias !== params.inboundAlias) {
    // Changed alias: delete old, create new
    await deleteEmailAlias(params.accountGuid, current.inbound.emailAlias);
    await createEmailAlias(params.accountGuid, params.inboundAlias);
  } else if (!params.inboundAlias && current.inbound) {
    // Remove alias
    await deleteEmailAlias(params.accountGuid, current.inbound.emailAlias);
  }

  // --- Outbound routing ---
  if (params.outbound) {
    await setEmailRouting(params.accountGuid, params.outbound);
  } else if (!params.outbound && current.outbound) {
    await disableEmailRouting(params.accountGuid);
  }

  // --- Cover page ---
  await setEmailCoverPage(params.accountGuid, params.useCoverPage, params.emailCoverType);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

## Verify
- `npm run build` — no type errors

## Notes for Future Tasks
- Task 47 (admin email config UI) uses `getAccountEmailSettings()` and `updateEmailConfig()`
- Task 50 (admin users page) should show email config status per user
- The `updateEmailConfig()` function is idempotent — safe to call with current state
