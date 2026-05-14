import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";

// ============================================================
// Types
// ============================================================

export interface EmailRoutingConfig {
  /**
   * Destination email address(es) — written to QueueProfileXml @Ea.
   * Used for forwarded faxes AND delivery/non-delivery notifications.
   * Multiple addresses may be passed comma-separated (best-effort; FaxBack
   * support is undocumented — invalid values will surface as ModifyAccount errors).
   */
  deliveryEmail: string;
  /** Forward received faxes to email — controls Rt bit 2 */
  forwardReceived: boolean;
  /** Attachment format for forwarded faxes: "pdf" or "tif" (only meaningful when forwardReceived) */
  attachmentFormat: "pdf" | "tif";
  /** Send delivery notification email (Dn) */
  deliveryNotification: boolean;
  /** Send non-delivery notification email (Ndn) */
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
  /** Raw QueueProfileXml value as returned by FaxBack — may be string, object-with-$attrs, or attrs object. */
  queueProfileXml: unknown;
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

  const text = await res.text();

  // Server returns JSON for GET requests
  let account: Record<string, unknown> = {};
  try {
    const json = JSON.parse(text);
    account = (json?.NSX?.Account ?? json?.Account ?? json) as Record<string, unknown>;
  } catch {
    // Fall back to XML
    try {
      const parsed = await parseStringPromise(text, { explicitArray: false });
      account = parsed?.NSX?.Account || parsed?.Account || {};
    } catch {
      // Leave account as {}
    }
  }

  return {
    accountGuid: (account.AccountGuid as string) || accountGuid,
    accountId: (account.AccountId as string) || "",
    emailAlias: (account.EmailAlias as string) || null,
    queueProfileXml: account.QueueProfileXml ?? account.QPXml ?? null,
    useCoverPage: parseInt((account.UseCoverPage as string) || "0", 10),
    emailCoverType: parseInt((account.EmailCoverType as string) || "0", 10),
    raw: account,
  };
}

// ============================================================
// Search / List Accounts
// ============================================================

export interface AccountSummary {
  accountGuid: string;
  accountId: string;
  displayName: string | null;
  faxNumber: string | null;
  emailAlias: string | null;
}

/**
 * List FaxBack accounts via the documented two-step flow:
 *   1. GET  mqs/Accounts/ReadAccountGuids        → CSV of all account GUIDs
 *   2. POST mqs/Accounts/ReadAccountBlock        → details for those GUIDs
 * Then enrich with fax numbers from:
 *   3. GET  mqs/DIDs/ReadDIDGuids                → CSV of all DID GUIDs
 *   4. POST mqs/DIDs/ReadDIDBlock                → DID → AccountGuid map
 *
 * Optional `searchString` filters client-side across AccountId, names,
 * company, GUID, and fax number.
 */
export async function searchAccounts(searchString = ""): Promise<AccountSummary[]> {
  // 1) Account GUIDs
  const guidsRes = await faxbackFetch("Accounts/ReadAccountGuids", {
    headers: { Accept: "application/json" },
  });
  if (!guidsRes.ok) {
    throw new Error(`ReadAccountGuids failed: ${guidsRes.status}`);
  }
  const guidsJson = (await guidsRes.json()) as
    | { AccountGuids?: string; NSX?: { AccountGuids?: string } };
  const csv =
    guidsJson?.AccountGuids ?? guidsJson?.NSX?.AccountGuids ?? "";
  const allGuids = csv
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);

  if (allGuids.length === 0) return [];

  // 2) Bulk account details. Note: `EmailAlias` is NOT a valid Include field
  // on this server build (returns 400). Email alias lives in QPXml.@Ea on the
  // full ReadAccount record and is omitted here for performance.
  const CHUNK = 200;
  const include =
    "AccountGuid,AccountId,First,Last,Company,ContactEmail,OfficePhone,CellPhone,Description,Customer";
  const accumulated: Record<string, unknown>[] = [];

  for (let i = 0; i < allGuids.length; i += CHUNK) {
    const chunk = allGuids.slice(i, i + CHUNK);
    const blockRes = await faxbackFetch("Accounts/ReadAccountBlock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        NSX: { AccountGuids: chunk.join(","), Include: include },
      }),
    });
    if (!blockRes.ok) {
      throw new Error(`ReadAccountBlock failed: ${blockRes.status}`);
    }
    const blockJson = (await blockRes.json()) as {
      NSX?: { Account?: Record<string, unknown> | Record<string, unknown>[] };
    };
    const accs = blockJson?.NSX?.Account;
    if (Array.isArray(accs)) {
      accumulated.push(...accs);
    } else if (accs) {
      accumulated.push(accs);
    }
  }

  // 3 + 4) Build AccountGuid → fax number map from DIDs (best-effort: failures
  // here must not break the listing).
  const faxByAccount = new Map<string, string[]>();
  try {
    const didGuidsRes = await faxbackFetch("DIDs/ReadDIDGuids", {
      headers: { Accept: "application/json" },
    });
    if (didGuidsRes.ok) {
      const didJson = (await didGuidsRes.json()) as
        | { DIDGuids?: string; NSX?: { DIDGuids?: string } };
      const didCsv = didJson?.DIDGuids ?? didJson?.NSX?.DIDGuids ?? "";
      const didGuids = didCsv
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g.length > 0);

      for (let i = 0; i < didGuids.length; i += CHUNK) {
        const chunk = didGuids.slice(i, i + CHUNK);
        const blockRes = await faxbackFetch("DIDs/ReadDIDBlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            NSX: {
              DIDGuids: chunk.join(","),
              Include: "DIDGuid,RouteToGuid,DID",
            },
          }),
        });
        if (!blockRes.ok) break;
        const json = (await blockRes.json()) as {
          NSX?: { DID?: Record<string, unknown> | Record<string, unknown>[] };
        };
        const dids = json?.NSX?.DID;
        const list = Array.isArray(dids) ? dids : dids ? [dids] : [];
        for (const d of list) {
          const acct = String(d.RouteToGuid ?? "");
          const num = String(d.DID ?? "").trim();
          if (acct && num) {
            const arr = faxByAccount.get(acct) ?? [];
            arr.push(num);
            faxByAccount.set(acct, arr);
          }
        }
      }
    }
  } catch (err) {
    console.warn("FaxBack DID enrichment failed:", err);
  }

  // Map to AccountSummary
  const summaries: AccountSummary[] = accumulated.map((a) => {
    const first = (a.First as string) || "";
    const last = (a.Last as string) || "";
    const company = (a.Company as string) || "";
    const fullName = `${first} ${last}`.trim();
    const displayName = fullName || company || (a.AccountId as string) || null;
    const guid = String(a.AccountGuid ?? "");
    const dids = faxByAccount.get(guid);
    return {
      accountGuid: guid,
      accountId: String(a.AccountId ?? ""),
      displayName,
      faxNumber: dids && dids.length > 0 ? dids.join(", ") : null,
      // EmailAlias not available in bulk; fetched lazily via ReadAccount.
      emailAlias: null,
    };
  });

  // Client-side filter
  const q = searchString.trim().toLowerCase();
  if (!q) return summaries;
  // Numeric-only query (e.g. "203230") matches fax numbers regardless of
  // formatting — strip non-digits from both sides for a generous match.
  const digitsOnly = q.replace(/\D+/g, "");
  // Normalized query: strip all non-alphanumeric chars so "1harrygmail"
  // matches an accountId like "1harry@gmail.com".
  const normalized = q.replace(/[^a-z0-9]/g, "");
  return summaries.filter((s) => {
    const hay = [
      s.accountId,
      s.displayName ?? "",
      s.accountGuid,
      s.faxNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    // Normalized match — handles queries missing @, ., -, etc.
    if (normalized) {
      const normalizedHay = hay.replace(/[^a-z0-9]/g, "");
      if (normalizedHay.includes(normalized)) return true;
    }
    if (digitsOnly && s.faxNumber) {
      const fxDigits = s.faxNumber.replace(/\D+/g, "");
      if (fxDigits.includes(digitsOnly)) return true;
    }
    return false;
  });
}

/**
 * Normalize FaxBack QueueProfileXml (string / object / attrs object) to a flat attrs map.
 */
async function extractQueueProfileAttrs(qp: unknown): Promise<Record<string, string>> {
  if (qp == null) return {};
  if (typeof qp === "string") {
    const s = qp.trim();
    if (!s) return {};
    try {
      const wrapped = s.startsWith("<") ? s : `<QPXml ${s} />`;
      const parsed = await parseStringPromise(wrapped, { explicitArray: false });
      // Could be wrapped as <QueueProfileXml ... /> or <QPXml ... />, possibly inside another node.
      const node =
        parsed?.QueueProfileXml ??
        parsed?.QPXml ??
        (parsed && typeof parsed === "object" ? Object.values(parsed)[0] : parsed);
      const attrs = (node && typeof node === "object" && (node as Record<string, unknown>).$) as
        | Record<string, string>
        | undefined;
      return attrs ?? (node && typeof node === "object" ? (node as Record<string, string>) : {});
    } catch {
      return {};
    }
  }
  if (typeof qp === "object") {
    const o = qp as Record<string, unknown>;
    if (o.$ && typeof o.$ === "object") return stripAtPrefix(o.$ as Record<string, string>);
    // Already an attrs map (possibly with @-prefixed keys when JSON-style XML attrs are used)
    return stripAtPrefix(o as Record<string, string>);
  }
  return {};
}

function stripAtPrefix(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[k.startsWith("@") ? k.slice(1) : k] = v;
  }
  return out;
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
  const attrs = await extractQueueProfileAttrs(account.queueProfileXml);

  if (process.env.FAXBACK_DEBUG_QPXML !== "0") {
    console.log(
      `[faxback] ReadAccount keys for ${accountGuid}:`,
      Object.keys(account.raw)
    );
    console.log(
      `[faxback] QueueProfileXml for ${accountGuid}:`,
      typeof account.queueProfileXml === "string"
        ? account.queueProfileXml
        : JSON.stringify(account.queueProfileXml),
      "=> attrs",
      JSON.stringify(attrs)
    );
  }

  // Rt is a bitmask: 1=ATA, 2=Email, 4=FAXability, 8=Client inbox
  const rtNum = attrs?.Rt != null ? parseInt(String(attrs.Rt), 10) : NaN;
  const emailBitSet = Number.isFinite(rtNum) && (rtNum & 2) === 2;
  // Dn / Ndn: "0" = off, anything starting with non-"0" (e.g. "2/1", "2/2") = on
  const dnOn = !!attrs?.Dn && String(attrs.Dn).trim() !== "0" && String(attrs.Dn).trim() !== "";
  const ndnOn = !!attrs?.Ndn && String(attrs.Ndn).trim() !== "0" && String(attrs.Ndn).trim() !== "";

  if (attrs?.Ea || emailBitSet || dnOn || ndnOn) {
    outbound = {
      deliveryEmail: attrs.Ea ?? "",
      forwardReceived: emailBitSet,
      attachmentFormat: attrs.Ef === "0" ? "tif" : "pdf",
      deliveryNotification: dnOn,
      nonDeliveryNotification: ndnOn,
    };
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
  return extractQueueProfileAttrs(xmlOrAttrs);
}

// ============================================================
// Inbound: Create / Delete Email Alias
// ============================================================

/**
 * List all email aliases registered for an account.
 * Each alias is an email address that, when used as the From: of an email to
 * `<faxNumber>@<faxbackEmailDomain>`, will submit a fax on behalf of this account.
 */
export async function listEmailAliases(accountGuid: string): Promise<string[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
  </Account>
  <Include>EmailAlias</Include>
</NSX>`;

  const res = await faxbackFetch("Accounts/GetEmailAliases", {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GetEmailAliases failed: ${res.status} — ${errText}`);
  }

  const text = await res.text();
  try {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    if (process.env.FAXBACK_DEBUG_ALIASES !== "0") {
      console.log(`[faxback] GetEmailAliases raw for ${accountGuid}:`, text.slice(0, 1000));
      console.log(`[faxback] GetEmailAliases parsed for ${accountGuid}:`, JSON.stringify(parsed).slice(0, 1000));
    }
    // Try common shapes
    const candidates: unknown[] = [
      parsed?.NSX?.EmailAliasRecord,
      parsed?.NSX?.EmailAliases?.EmailAliasRecord,
      parsed?.NSX?.EmailAliases,
      parsed?.NSX?.Account?.EmailAliases,
      parsed?.HttpService?.NSXResponse?.GetEmailAliasesResponse?.EmailAliases,
      parsed?.NSX?.Aliases,
      parsed?.NSX?.Account?.Aliases,
      parsed?.NSX?.EmailAlias,
      parsed?.NSX?.Account?.EmailAlias,
    ];
    let aliasesNode: unknown = candidates.find((c) => c != null);
    if (!aliasesNode) return [];
    // aliasesNode may itself be a string, array of strings, or {EmailAlias: ...}
    let list: unknown[] = [];
    if (typeof aliasesNode === "string") {
      list = [aliasesNode];
    } else if (Array.isArray(aliasesNode)) {
      list = aliasesNode;
    } else if (typeof aliasesNode === "object") {
      const inner = (aliasesNode as Record<string, unknown>).EmailAlias;
      if (Array.isArray(inner)) list = inner;
      else if (inner != null) list = [inner];
      else list = [aliasesNode];
    }
    return Array.from(
      new Set(
        list
          .map((a) => {
            if (typeof a === "string") return a;
            if (a && typeof a === "object") {
              const o = a as Record<string, unknown>;
              return (
                (typeof o.EmailAlias === "string" && o.EmailAlias) ||
                (typeof o._ === "string" && o._) ||
                ""
              );
            }
            return "";
          })
          .filter((s): s is string => !!s)
          .map((s) => s.trim().toLowerCase())
      )
    );
  } catch {
    return [];
  }
}

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
 * Configure email-related QueueProfileXml fields on an account.
 * Single email address (or comma-separated list) drives:
 *   - forwarding received faxes (Rt bit 2 + Ea + Ef)
 *   - delivery notifications (Dn)
 *   - non-delivery notifications (Ndn)
 * Any combination of the three flags is permitted as long as `deliveryEmail` is set.
 * If all three flags are off, call `disableEmailRouting` instead.
 */
export async function setEmailRouting(
  accountGuid: string,
  config: EmailRoutingConfig
): Promise<void> {
  const anyEnabled =
    config.forwardReceived || config.deliveryNotification || config.nonDeliveryNotification;
  if (!anyEnabled) {
    await disableEmailRouting(accountGuid);
    return;
  }
  if (!config.deliveryEmail?.trim()) {
    throw new Error("Email address is required when any forwarding/notification option is enabled");
  }

  // Read current Rt so we preserve other routing bits (ATA=1, FAXability=4, Client inbox=8).
  const currentRt = await readCurrentRt(accountGuid);
  // Rt: bit OR — 1=ATA, 2=Email, 4=FAXability, 8=Client inbox.
  const newRt = config.forwardReceived ? currentRt | 2 : currentRt & ~2;
  const rt = String(newRt || 1); // never leave Rt at 0
  const ef = config.attachmentFormat === "pdf" ? "1" : "0";
  const dn = config.deliveryNotification ? "2/1" : "0";
  const ndn = config.nonDeliveryNotification ? "2/1" : "0";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
    <QPXml Rt="${rt}" Ea="${escapeXml(config.deliveryEmail.trim())}" Ef="${ef}" Dn="${dn}" Ndn="${ndn}" />
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

async function readCurrentRt(accountGuid: string): Promise<number> {
  try {
    const account = await readAccount(accountGuid);
    if (!account.queueProfileXml) return 1;
    const attrs = await extractQueueProfileAttrs(account.queueProfileXml);
    const n = parseInt(String(attrs?.Rt ?? "1"), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Disable outbound email routing — set routing back to queue (portal-only).
 */
export async function disableEmailRouting(accountGuid: string): Promise<void> {
  // Preserve other Rt bits; just clear the Email (2) bit.
  const currentRt = await readCurrentRt(accountGuid);
  const newRt = currentRt & ~2;
  const rt = String(newRt || 1);

  const body = `<?xml version="1.0" encoding="utf-8"?>
<NSX>
  <Account>
    <AccountGuid>${escapeXml(accountGuid)}</AccountGuid>
    <QPXml Rt="${rt}" Dn="0" Ndn="0" />
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
    const anyOn =
      params.outbound.forwardReceived ||
      params.outbound.deliveryNotification ||
      params.outbound.nonDeliveryNotification;
    if (anyOn) {
      await setEmailRouting(params.accountGuid, params.outbound);
    } else if (current.outbound) {
      await disableEmailRouting(params.accountGuid);
    }
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
