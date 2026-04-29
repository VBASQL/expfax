import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { Contact } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";
  const container = await containers.contacts();

  let query = "SELECT * FROM c WHERE c.userId = @uid AND NOT IS_DEFINED(c.type)";
  const params: Array<{ name: string; value: string }> = [{ name: "@uid", value: user.id }];

  if (search) {
    query += " AND (CONTAINS(LOWER(c.name), @search) OR CONTAINS(c.faxNumber, @search) OR CONTAINS(LOWER(c.company), @search))";
    params.push({ name: "@search", value: search.toLowerCase() });
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
    faxNumber: body.faxNumber,
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

  return NextResponse.json(contact, { status: 201 });
}
