import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import { normalizePhone } from "@/lib/phone";
import type { Contact } from "@/types";
import { audit } from "@/lib/audit/logger";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";
  const container = await containers.contacts();

  let query = "SELECT * FROM c WHERE c.userId = @uid AND NOT IS_DEFINED(c.type)";
  const params: Array<{ name: string; value: string }> = [{ name: "@uid", value: user.id }];

  if (search) {
    // Search the raw stored value AND a normalized form so users can find a
    // contact by typing dashes/parens or by typing pure digits.
    query += " AND (CONTAINS(LOWER(c.name), @search) OR CONTAINS(c.faxNumber, @search) OR CONTAINS(c.faxNumber, @searchDigits) OR CONTAINS(LOWER(c.company), @search))";
    params.push({ name: "@search", value: search.toLowerCase() });
    params.push({ name: "@searchDigits", value: normalizePhone(search) });
  }

  query += " ORDER BY c.name ASC";

  const { resources } = await container.items.query({ query, parameters: params }).fetchAll();

  return NextResponse.json({ items: resources });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const now = new Date().toISOString();

  const contact: Contact = {
    id: uuid(),
    userId: user.id,
    name: body.name,
    faxNumber: normalizePhone(body.faxNumber),
    company: body.company || "",
    email: body.email || "",
    notes: body.notes || "",
    isFavorite: false,
    groups: [],
    createdAt: now,
    updatedAt: now,
  };

  const container = await containers.contacts();
  await container.items.create(contact);

  await audit({
    userId: user.id,
    action: "contact.create",
    resourceType: "contact",
    resourceId: contact.id,
    detail: { name: contact.name, faxNumber: contact.faxNumber },
    request,
  });

  return NextResponse.json(contact, { status: 201 });
}
