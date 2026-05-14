import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { normalizePhone } from "@/lib/phone";

export interface ContactLookupResult {
  name: string;
  company: string;
}

/**
 * POST /api/contacts/lookup
 * Body: { numbers: string[] }
 * Returns: { contacts: Record<normalizedFaxNumber, { name, company }> }
 *
 * Batch-resolves contact names for a list of fax numbers.
 * Used everywhere names are displayed (lists, details, live status, send form).
 * Contact data always takes priority over whatever name was stored on the fax record.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const raw: string[] = body.numbers ?? [];

  // Build a de-duped set of variants for every input number so contacts match
  // regardless of whether they were stored with or without a leading "+" or "1".
  // e.g. "+12125551234" → ["12125551234", "+12125551234", "2125551234"]
  const variants = new Set<string>();
  for (const n of raw) {
    const norm = normalizePhone(n);
    if (!norm) continue;
    variants.add(norm);                                         // as-is
    const digits = norm.replace(/^\+/, "");                    // strip "+"
    variants.add(digits);
    if (digits.length === 11 && digits.startsWith("1")) {
      variants.add(digits.slice(1));                            // strip leading "1"
    }
    if (digits.length === 10) {
      variants.add(`1${digits}`);                               // add "1" prefix
      variants.add(`+1${digits}`);                              // add "+1" prefix
    }
  }
  const numbers = [...variants].filter(Boolean);

  if (numbers.length === 0) return NextResponse.json({ contacts: {} });

  const container = await containers.contacts();

  // ARRAY_CONTAINS lets Cosmos match any contact whose faxNumber is in our list
  const { resources } = await container.items
    .query({
      query: `SELECT c.faxNumber, c.name, c.company
              FROM c
              WHERE c.userId = @uid
                AND NOT IS_DEFINED(c.type)
                AND ARRAY_CONTAINS(@numbers, c.faxNumber)`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@numbers", value: numbers },
      ],
    })
    .fetchAll();

  const contacts: Record<string, ContactLookupResult> = {};
  for (const c of resources) {
    if (!c.faxNumber) continue;
    const entry = { name: c.name || "", company: c.company || "" };
    // Store under every variant so the client always finds it regardless of
    // which normalizePhone form they use as the map key.
    const d = c.faxNumber.replace(/^\+/, "");
    const keysToStore = new Set([c.faxNumber, d]);
    if (d.length === 11 && d.startsWith("1")) keysToStore.add(d.slice(1));
    if (d.length === 10) { keysToStore.add(`1${d}`); keysToStore.add(`+1${d}`); }
    for (const k of keysToStore) contacts[k] = entry;
  }

  return NextResponse.json({ contacts });
}
